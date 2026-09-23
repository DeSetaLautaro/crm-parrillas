const Empresa = require('../models/Empresa');
const Usuario = require('../models/usuario');

async function obtenerWabaId(empresa) {
  // Si ya lo tenemos guardado, lo usamos
  if (empresa.wabaId) {
    console.log(`✅ WABA ID ya estaba guardado: ${empresa.wabaId}`);
    return empresa.wabaId;
  }

  // Si hay un WABA global en .env, lo usamos y lo guardamos en la empresa
  if (process.env.WHATSAPP_WABA_ID) {
    console.log(`🌐 Usando WABA ID desde .env: ${process.env.WHATSAPP_WABA_ID}`);
    await Empresa.findByIdAndUpdate(empresa._id, {
      $set: { wabaId: process.env.WHATSAPP_WABA_ID }
    });
    return process.env.WHATSAPP_WABA_ID;
  }

  // Sino, intentamos obtenerlo del phone_number_id
  const token = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = empresa.whatsappPhoneId;
  console.log('🔍 Buscando WABA ID con:', { token: token ? 'OK' : 'FALTA', phoneId });
  if (!token || !phoneId) {
    console.error('❌ No hay token o phoneId para obtener WABA ID');
    return null;
  }

  const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneId}?fields=whatsapp_business_account`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json();
  console.log('📥 Respuesta al obtener WABA:', JSON.stringify(data));
  const wabaId = data.whatsapp_business_account?.id;

  if (!wabaId) {
    console.error('❌ WhatsApp Business Account no vino en la respuesta');
  }

  if (wabaId) {
    await Empresa.findByIdAndUpdate(empresa._id, { $set: { wabaId } });
  }
  return wabaId || null;
}

async function actualizarCostosEmpresa(empresa) {
  const wabaId = await obtenerWabaId(empresa);
  if (!wabaId) return null;

  const token = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;

  // Tomar la fecha de inicio del ciclo de facturación del usuario dueño
  const usuario = await Usuario.findById(empresa.usuarioAppId).lean();
  if (!usuario) {
    console.warn(`⚠️ Usuario no encontrado para empresa ${empresa.nombre}`);
    return null;
  }

  const fechaInicio = usuario.fechaCicloFacturacion || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const start = Math.floor(new Date(fechaInicio).getTime() / 1000);
  const end = Math.floor(Date.now() / 1000);

  const url = `https://graph.facebook.com/v19.0/${wabaId}?fields=conversation_analytics.start(${start}).end(${end}).granularity(DAILY).metric_types(COST).conversation_types(REGULAR,UNKNOWN,FREE_ENTRY_POINT,FREE_TIER)`;

  console.log(`🌐 Llamando a Meta analytics con URL: ${url}`);

  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!resp.ok) {
    const cuerpo = await resp.text();
    console.error(`⚠️ Error obteniendo analytics de Meta: ${resp.status} ${cuerpo}`);
    return null;
  }

  const data = await resp.json();
  console.log('📥 Respuesta cruda de Meta analytics:', JSON.stringify(data).slice(0, 1000));

  const analytics = data?.conversation_analytics?.data || data?.data || [];

  let costoTotal = 0;
  for (const item of analytics) {
    if (typeof item.cost === 'number' || typeof item.cost === 'string') {
      costoTotal += parseFloat(item.cost) || 0;
    } else if (item.cost && typeof item.cost === 'object' && item.cost.total !== undefined) {
      costoTotal += parseFloat(item.cost.total) || 0;
    }
    if (Array.isArray(item.conversation_costs)) {
      costoTotal += item.conversation_costs.reduce((s, c) => s + (parseFloat(c.cost) || 0), 0);
    }
  }

  await Empresa.findByIdAndUpdate(empresa._id, {
    $set: {
      metaCostoTotal: costoTotal.toFixed(4),
      metaUltimaActualizacion: new Date()
    }
  });

  console.log(`✅ Analytics Meta actualizadas para empresa ${empresa.nombre}: costoTotal=${costoTotal.toFixed(4)} usd`);

  return costoTotal;
}

// Actualiza el costo total del ciclo para un usuario (suma todas sus líneas)
async function actualizarCostosUsuario(usuarioId, io) {
  const empresas = await Empresa.find({ usuarioAppId: usuarioId.toString() }).lean();
  let total = 0;
  for (const empresa of empresas) {
    const costo = await actualizarCostosEmpresa(empresa);
    total += costo || 0;
  }

  await Usuario.findByIdAndUpdate(usuarioId, {
    $set: { costoCicloActualUsd: total }
  });

  // Re-evaluar bloqueo del monedero
  const usuario = await Usuario.findById(usuarioId).lean();
  if (!usuario) return total;

  const saldo = usuario.saldoUsd || 0;
  const tolerancia = usuario.deudaToleradaUsd || 5;
  const deudaPrevia = usuario.deudaPendienteUsd || 0;
  const presupuestoTotal = saldo + tolerancia;
  const gastoTotal = total + deudaPrevia;

  const deudaReal = Math.max(0, gastoTotal - saldo);
  const ratioDeuda = tolerancia > 0 ? deudaReal / tolerancia : 0;

  // Aviso al 70% de la tolerancia usada
  if (ratioDeuda >= 0.7 && !usuario.avisoEnviado) {
    if (io) {
      const empresasUsuario = await Empresa.find({ usuarioAppId: usuarioId.toString() }).lean();
      empresasUsuario.forEach(e => io.to(e._id.toString()).emit('monedero-aviso', {
        deuda: deudaReal,
        tolerancia,
        porcentaje: Math.round(ratioDeuda * 100)
      }));
    }
    await Usuario.findByIdAndUpdate(usuarioId, { $set: { avisoEnviado: true } });
  } else if (ratioDeuda < 0.7 && usuario.avisoEnviado) {
    await Usuario.findByIdAndUpdate(usuarioId, { $set: { avisoEnviado: false } });
  }

  const bloqueado = gastoTotal > presupuestoTotal;
  if (bloqueado !== usuario.monederoBloqueado) {
    await Usuario.findByIdAndUpdate(usuarioId, { $set: { monederoBloqueado: bloqueado } });

    if (bloqueado && io) {
      const empresasUsuario = await Empresa.find({ usuarioAppId: usuarioId.toString() }).lean();
      empresasUsuario.forEach(e => io.to(e._id.toString()).emit('monedero-bloqueado', {
        usuarioId,
        deuda: deudaReal,
        tolerancia
      }));
    }
    console.log(`${bloqueado ? '🚫' : '✅'} Monedero ${bloqueado ? 'bloqueado' : 'desbloqueado'} para usuario ${usuarioId}`);
  }

  return total;
}

async function actualizarCostosDeTodasLasEmpresas(io) {
  const empresas = await Empresa.find({});
  const usuariosSet = new Set();
  for (const empresa of empresas) {
    try {
      await actualizarCostosEmpresa(empresa);
      if (empresa.usuarioAppId) usuariosSet.add(empresa.usuarioAppId.toString());
    } catch (e) {
      console.error(`Error con empresa ${empresa.nombre}:`, e.message);
    }
  }

  for (const userId of usuariosSet) {
    try {
      await actualizarCostosUsuario(userId, io);
    } catch (e) {
      console.error(`Error actualizando usuario ${userId}:`, e.message);
    }
  }
}

module.exports = { actualizarCostosEmpresa, actualizarCostosUsuario, actualizarCostosDeTodasLasEmpresas };
