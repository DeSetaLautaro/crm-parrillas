const Empresa = require('../models/Empresa');
const Cliente = require('../models/Cliente');
const Conversacion = require('../models/Conversacion');
const Mensaje = require('../models/Mensaje');
const Difusion = require('../models/Difusion');
const { Types } = require('mongoose');
const { registrarAuditoria } = require('../services/auditoriaService');
const { normalizarTelefono } = require('../services/telefonoUtils');

const CONCURRENCIA_ENVIO = 10;

let cronEjecutandose = false;


async function guardarMensajeDifusion(empresa, contactoId, mensaje) {
  let conversacion = await Conversacion.findOne({
    empresaId: empresa._id,
    contactoId
  }).sort({ updatedAt: -1 });

  if (!conversacion) {
    conversacion = await Conversacion.create({
      empresaId: empresa._id,
      contactoId,
      lineaReceptora: empresa.whatsappPhoneId,
      numeroReceptor: '',
      botActivo: empresa.botActivo !== false,
      estado: 'Abierto',
      ultimoMensaje: mensaje
    });
  } else {
    await Conversacion.findByIdAndUpdate(conversacion._id, {
      $set: {
        ultimoMensaje: mensaje,
        estado: 'Abierto'
      }
    });
  }

  const nuevoMensaje = await Mensaje.create({
    conversacionId: conversacion._id,
    remitente: 'empresa',
    contenido: mensaje
  });

  return { conversacion, mensaje: nuevoMensaje };
}

async function enviarTextoWhatsApp(empresa, telefono, mensaje) {
  const accessToken = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = empresa.whatsappPhoneId;
  const destino = normalizarTelefono(telefono);
  if (!accessToken || !phoneId || !destino) {
    console.log('❌ [DIFUSIÓN] Faltan credenciales o teléfono:', {
      accessToken: accessToken ? 'SÍ' : 'NO',
      phoneId: phoneId || 'NO',
      destino: destino || 'NO'
    });
    return { ok: false, error: 'Faltan credenciales o teléfono' };
  }
  console.log('📤 [DIFUSIÓN] Intentando enviar a WhatsApp:');
  console.log('  - phoneId (whatsappPhoneId):', phoneId);
  console.log('  - teléfono normalizado:', destino);
  console.log('  - accessToken definido?', accessToken ? 'SÍ (longitud ' + accessToken.length + ')' : 'NO');
  console.log('  - mensaje:', mensaje);
  try {
    const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: destino,
      type: 'text',
      text: { body: mensaje }
    };
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const body = await resp.text();
    console.log('📥 [DIFUSIÓN] Respuesta de Meta:', resp.status, body);
    if (!resp.ok) {
      return { ok: false, error: body };
    }
    return { ok: true };
  } catch (error) {
    console.error('❌ [DIFUSIÓN] Excepción en fetch a WhatsApp:', error);
    return { ok: false, error: error.message };
  }
}

async function listarDifusiones(req, res) {
  try {
    const idsEmpresas = req.empresas && req.empresas.length ? req.empresas : [req.empresaId];
    const difusiones = await Difusion.find({ empresaId: { $in: idsEmpresas } })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ ok: true, difusiones });
  } catch (error) {
    console.error('Error listando difusiones:', error);
    return res.status(500).json({ error: 'Error interno al listar difusiones' });
  }
}

async function obtenerOpcionesDifusion(req, res) {
  try {
    const idsEmpresas = req.empresas && req.empresas.length ? req.empresas : [req.empresaId];
    if (!idsEmpresas || idsEmpresas.length === 0) {
      return res.status(400).json({ error: 'No se pudo identificar la empresa' });
    }
    const contactos = await Cliente.find({ empresaId: { $in: idsEmpresas } }).lean();
    const etiquetasSet = new Set();
    contactos.forEach(c => (c.etiquetas || []).forEach(e => {
      const nombre = (typeof e === 'string') ? e : e.nombre;
      if (nombre) etiquetasSet.add(nombre);
    }));
    const etiquetas = Array.from(etiquetasSet).sort();
    return res.json({
      ok: true,
      contactos: contactos.map(c => ({
        _id: c._id,
        nombre: c.nombre || '',
        telefono: c.telefono,
        etiquetas: (c.etiquetas || []).map(e => (typeof e === 'string' ? e : e.nombre)).filter(Boolean)
      })),
      etiquetas
    });
  } catch (error) {
    console.error('Error obteniendo opciones de difusión:', error);
    return res.status(500).json({ error: 'Error interno al obtener opciones' });
  }
}

async function crearDifusion(req, res) {
  try {
    const empresaId = req.body.empresaId || req.empresaId;
    if (!empresaId) return res.status(400).json({ error: 'Falta empresaId' });

    // Validación multi-tenant: la empresa debe pertenecer al usuario logueado
    const empresasPermitidas = req.empresas || [];
    if (!empresasPermitidas.some(e => String(e) === String(empresaId))) {
      return res.status(403).json({ error: 'No tienes acceso a esta empresa' });
    }
    const mensaje = (req.body.mensaje || '').trim();
    if (!mensaje) return res.status(400).json({ error: 'El mensaje es obligatorio' });
    if (mensaje.length > 4000) return res.status(400).json({ error: 'El mensaje no puede superar los 4000 caracteres' });

    let tipos = req.body.tipoDestinatario || 'etiqueta';
    if (!Array.isArray(tipos)) {
      tipos = [tipos];
    }
    const tiposValidos = ['todos', 'etiqueta', 'manual'];
    if (!tipos.every(t => tiposValidos.includes(t))) {
      return res.status(400).json({ error: 'Tipo de destinatario inválido' });
    }
    if (tipos.length === 0) {
      return res.status(400).json({ error: 'Elegí al menos un tipo de destinatario' });
    }

    const mapContactos = new Map();
    const agregarContacto = (c) => {
      const key = c._id.toString();
      if (!mapContactos.has(key)) {
        mapContactos.set(key, { contactoId: c._id, telefono: normalizarTelefono(c.telefono), nombre: c.nombre || '' });
      }
    };

    if (tipos.includes('todos')) {
      const clientes = await Cliente.find({ empresaId }).lean();
      clientes.forEach(agregarContacto);
    }
    if (tipos.includes('etiqueta')) {
      const etiqueta = String(req.body.etiqueta || '').trim();
      if (!etiqueta) return res.status(400).json({ error: 'Elegí una etiqueta' });
      if (etiqueta.length > 50) return res.status(400).json({ error: 'La etiqueta no puede superar los 50 caracteres' });
      const clientes = await Cliente.find({ empresaId, 'etiquetas.nombre': etiqueta }).lean();
      clientes.forEach(agregarContacto);
    }
    if (tipos.includes('manual')) {
      if (!Array.isArray(req.body.contactosIds) || req.body.contactosIds.length === 0) {
        return res.status(400).json({ error: 'No se seleccionaron contactos' });
      }
      const ids = req.body.contactosIds;
      if (ids.some(id => typeof id !== 'string' || !Types.ObjectId.isValid(id))) {
        return res.status(400).json({ error: 'IDs de contactos inválidos' });
      }
      const idsValidos = ids.filter(id => Types.ObjectId.isValid(id));
      const clientes = await Cliente.find({ _id: { $in: idsValidos }, empresaId }).lean();
      clientes.forEach(agregarContacto);
    }

    const contactos = Array.from(mapContactos.values());
    console.log('👥 [DIFUSIÓN] Contactos encontrados:', contactos.length);
    if (contactos.length > 0) {
      console.log('  - Primer contacto:', contactos[0]);
    }
    if (contactos.length === 0) {
      return res.status(400).json({ error: 'No hay contactos para la difusión' });
    }

    const fechaProgramacion = req.body.fechaProgramacion ? new Date(req.body.fechaProgramacion) : null;
    const difusion = await Difusion.create({
      empresaId,
      usuarioAppId: String(req.usuario.id || ''),
      mensaje,
      contactos: contactos.map(c => ({
        contactoId: c.contactoId || null,
        telefono: String(c.telefono || ''),
        nombre: c.nombre || ''
      })),
      estado: fechaProgramacion && fechaProgramacion > new Date() ? 'programada' : 'borrador',
      fechaProgramacion,
      destinatariosTotal: contactos.length
    });
    await registrarAuditoria(req, empresaId, 'difusion_creada', `Se creó una difusión para ${contactos.length} contactos`, { difusionId: difusion._id, mensaje: difusion.mensaje, destinatarios: contactos.length });
    return res.status(201).json({ ok: true, difusion });
  } catch (error) {
    console.error('Error creando difusión:', error);
    return res.status(500).json({ error: 'Error interno al crear difusión' });
  }
}

async function procesarEnvioDifusion(difusion, io = null) {
  if (difusion.estado === 'enviando') {
    throw new Error('La difusión ya está en proceso');
  }
  const empresa = await Empresa.findById(difusion.empresaId);
  if (!empresa) throw new Error('Empresa no encontrada');

  console.log('🏢 [DIFUSIÓN] Empresa encontrada:', empresa.nombre);
  console.log('  - empresa.tokenMeta definido?', empresa.tokenMeta ? 'SÍ' : 'NO');
  console.log('  - empresa.whatsappPhoneId:', empresa.whatsappPhoneId);
  console.log('  - Difusión ID:', difusion._id);
  console.log('  - Contactos totales:', difusion.contactos.length);

  difusion.estado = 'enviando';
  difusion.fechaEnvio = new Date();
  await difusion.save();

  let enviados = 0;
  const errores = [];
  const pendientes = difusion.contactos.filter(d => d.estado !== 'enviado' && d.telefono);
  console.log('  - Contactos pendientes:', pendientes.length);

  for (let i = 0; i < pendientes.length; i += CONCURRENCIA_ENVIO) {
    const lote = pendientes.slice(i, i + CONCURRENCIA_ENVIO);
    console.log(`🚀 [DIFUSIÓN] Enviando lote de ${lote.length} contactos (${i + lote.length}/${pendientes.length})`);
    const resultados = await Promise.allSettled(
      lote.map(dest => enviarTextoWhatsApp(empresa, dest.telefono, difusion.mensaje))
    );
    resultados.forEach((r, idx) => {
      const dest = lote[idx];
      if (r.status === 'fulfilled' && r.value && r.value.ok) {
        dest.estado = 'enviado';
        enviados++;
        // Guardar en la conversación del CRM como mensaje enviado por la empresa
        if (dest.contactoId) {
          guardarMensajeDifusion(empresa, dest.contactoId, difusion.mensaje)
            .then(({ conversacion, mensaje: msg }) => {
              if (io) {
                io.to(empresa._id.toString()).emit('mensaje-nuevo', {
                  conversacionId: conversacion._id,
                  mensaje: {
                    remitente: 'empresa',
                    contenido: msg.contenido,
                    fecha: msg.createdAt
                  },
                  conversacion: {
                    _id: conversacion._id,
                    ultimoMensaje: msg.contenido,
                    updatedAt: conversacion.updatedAt
                  }
                });
              }
            })
            .catch(err => {
              console.error('❌ [DIFUSIÓN] Error al guardar mensaje en conversación:', err);
            });
        }
      } else {
        dest.estado = 'error';
        const errMsg = r.status === 'rejected' ? (r.reason?.message || 'Error') : (r.value?.error || 'Error');
        errores.push({ telefono: dest.telefono, error: errMsg });
      }
    });
    console.log(`✅ [DIFUSIÓN] Lote enviado: enviados=${enviados}, errores=${errores.length}`);
    difusion.destinatariosEnviados = enviados;
    difusion.errores = errores;
    await difusion.save();
  }

  console.log('📊 [DIFUSIÓN] Resumen final:', {
    enviados,
    errores: errores.length,
    estadoFinal: errores.length === 0 ? 'completada' : (enviados > 0 ? 'completada' : 'error')
  });
  difusion.estado = errores.length === 0 ? 'completada' : (enviados > 0 ? 'completada' : 'error');
  await difusion.save();
  return difusion;
}

async function enviarDifusion(req, res) {
  try {
    const difusion = await Difusion.findById(req.params.id);
    if (!difusion) return res.status(404).json({ error: 'Difusión no encontrada' });
    console.log('📣 [DIFUSIÓN] Petición para enviar difusión:', difusion._id, '| estado:', difusion.estado);
    const idsEmpresas = req.empresas && req.empresas.length ? req.empresas : [req.empresaId];
    if (!idsEmpresas.some(e => String(e) === String(difusion.empresaId))) {
      return res.status(403).json({ error: 'No tienes acceso a esta difusión' });
    }
    const io = req.app.get('io');
    const difusionProcesada = await procesarEnvioDifusion(difusion, io);
    if (io) {
      io.to(String(difusion.empresaId)).emit('difusion-completada', { difusionId: difusion._id });
    }
    await registrarAuditoria(req, difusion.empresaId, 'difusion_enviada', `Se envió la difusión ${difusion._id} a ${difusionProcesada.destinatariosEnviados || 0} contactos`, { difusionId: difusion._id, enviados: difusionProcesada.destinatariosEnviados || 0, total: difusionProcesada.destinatariosTotal || 0, errores: (difusionProcesada.errores || []).length });
    if (difusionProcesada.estado === 'error') {
      return res.status(502).json({
        ok: false,
        error: 'No se pudo enviar la difusión. Revisá los errores.',
        difusion: difusionProcesada,
        errores: difusionProcesada.errores || []
      });
    }
    return res.json({ ok: true, difusion: difusionProcesada, errores: difusionProcesada.errores || [] });
  } catch (error) {
    console.error('Error enviando difusión:', error);
    return res.status(500).json({ error: 'Error interno al enviar difusión' });
  }
}

async function enviarDifusionesProgramadas() {
  if (cronEjecutandose) {
    console.log('⏭️ Cron de difusiones ya en ejecución, se omite este tick.');
    return;
  }
  cronEjecutandose = true;
  try {
    const ahora = new Date();
    const hayProgramadas = await Difusion.countDocuments({
      estado: 'programada',
      fechaProgramacion: { $lte: ahora }
    });
    if (hayProgramadas === 0) {
      console.log('⏭️ Sin difusiones programadas pendientes, se omite.');
      return;
    }
    const difusiones = await Difusion.find({
      estado: 'programada',
      fechaProgramacion: { $lte: ahora }
    }).limit(20);
    for (const difusion of difusiones) {
      try {
        await procesarEnvioDifusion(difusion, null);
      } catch (e) {
        console.error(`Error enviando difusión programada ${difusion._id}:`, e);
      }
    }
  } catch (error) {
    console.error('Error en cron de difusiones programadas:', error);
  } finally {
    cronEjecutandose = false;
  }
}

module.exports = {
  listarDifusiones,
  crearDifusion,
  enviarDifusion,
  obtenerOpcionesDifusion,
  enviarDifusionesProgramadas
};
