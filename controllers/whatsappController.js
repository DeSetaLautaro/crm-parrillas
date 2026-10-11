const { generarTexto } = require('../services/iaService');
const { generarTextoConImagen, generarTextoConAudio } = require('../services/geminiService');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Empresa = require('../models/Empresa');
const Cliente = require('../models/Cliente');
const Conversacion = require('../models/Conversacion');
const Mensaje = require('../models/Mensaje');
const Producto = require('../models/Producto');
const Usuario = require('../models/usuario');
const Pedido = require('../models/Pedido');
const { guardarPedidoConfirmado, reintegrarStock } = require('./pedidosController');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { actualizarCostosEmpresa } = require('../services/metaAnalyticsService');
const { registrarAuditoria } = require('../services/auditoriaService');
const logger = require('../logger');
const CircuitBreaker = require('../services/circuitBreaker');
const { colaIA } = require('../services/iaQueue');
const breakerMeta = new CircuitBreaker({ errorThreshold: 5, resetTimeout: 30000 });
const generarTextoCola = (prompt) => colaIA.ejecutar(() => generarTexto(prompt));

// Lee la duración real de un archivo de audio/video usando ffprobe
async function obtenerDuracionArchivo(ruta) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'json',
      ruta
    ]);
    const data = JSON.parse(stdout);
    return data.format?.duration ? parseFloat(data.format.duration) : null;
  } catch (e) {
    console.warn('⚠️ No se pudo obtener duración con ffprobe:', e.message);
    return null;
  }
}

// Prompt por defecto (mismo que estaba hardcodeado, pero con placeholders)
const PROMPT_IA_CONTEXTO = `Sos el asistente virtual de {nombreLocal}, una parrilla. Atendés clientes por WhatsApp.

ESTILO (MUY IMPORTANTE):
- Respuestas BREVES y CONCRETAS. Máximo 1 a 3 oraciones. Sin vueltas, sin introducciones largas, sin despedidas rebuscadas.
- Hablá directo, como si atenderías el mostrador. Nada de "parafernalia".
- Nunca uses prefijos tipo "Respuesta:" ni títulos. Solo el mensaje final.
- No inventes datos. Si no tenés la info, decilo con naturalidad (ej: "eso lo consulto con el local") sin inventar y sin derivar a un humano.

CONTEXTO DEL LOCAL:
- Estado ahora: {estadoLocal}
- Horarios: {horarios}
- Información del local: {atajos}

CATÁLOGO (nombre | precio | medidas | extras | envío):
{menuTexto}

REGLAS DEL DUEÑO (respetalas siempre):
{instrucciones}

PEDIDO EN CURSO:
- Carrito: {carritoActual}
- Total: {carritoTotal}

HISTORIAL RECIENTE:
{historialTexto}

MENSAJE DEL CLIENTE: "{mensajeCliente}"

CÓMO RESPONDER:
1. Si el cliente pregunta por un producto, contestá con precio, medidas y modalidad de envío.
2. Si el cliente quiere comprar, pedí la DIRECCIÓN de entrega ANTES de confirmar el pedido y de cotizar el envío.
3. Envío (según lo que diga el producto):
   - "Envío gratis" -> aclaralo.
   - "Envío $X" -> informá ese costo.
   - "Envío a consultar" -> decí "el envío se cotiza según tu zona".
4. El bot responde SIEMPRE y NUNCA deriva a un humano desde su propia respuesta. Si el cliente pide explícitamente hablar con una persona, el sistema lo detecta automáticamente y hace la derivación; vos seguí respondiendo normal. Si el cliente pide algo que no tenés (un dato, una foto, una medida que no figura en el catálogo), respondé con lo que tengas o decí "eso lo consulto con el local". Si el cliente pregunta en qué horario puede hablar con una persona, respondé con el horario del local que figura arriba en este prompt.
5. Confirmá el pedido SOLO cuando el cliente ya dio la dirección y muestra intención clara de comprar.
6. Si el cliente pide explícitamente ver la FOTO de un producto del catálogo, y ese producto figura con "Con foto", mandá la foto (ver formato abajo). No ofrezcas fotos de productos que figuran "Sin foto".
7. Si un producto figura AGOTADO en el catálogo, no lo ofrezcas ni lo sumes al carrito. Si el cliente lo pide, avisale que ya no hay disponible.
8. Si el cliente pide algo que no podés resolver con el catálogo, las reglas o los atajos, respondé "eso lo consulto con el local" y marcá "derivar": true en el JSON (ver formato abajo).

FORMATO DE RESPUESTA (MUY IMPORTANTE):
Respondé SIEMPRE con un objeto JSON válido, sin markdown, sin bloques de código y sin texto extra. Usá uno de estos dos formatos exactos:

• Para respuestas de texto:
{"tipo": "texto", "respuesta": "tu mensaje para el cliente", "derivar": false}

• Para enviar la foto de un producto:
{"tipo": "imagen", "producto": "nombre exacto del producto tal como figura en el catálogo", "caption": "texto breve que acompañará la foto"}

El campo "respuesta" o "caption" debe ser el mensaje final listo para enviar por WhatsApp.

El campo "derivar" es OPCIONAL y solo aplica a las respuestas de texto:
- Poné "derivar": true cuando el cliente pida algo que no podés resolver con el catálogo, las reglas o los atajos, y tu respuesta sea del tipo "eso lo consulto con el local".
- En cualquier otro caso, omitilo o poné "derivar": false.

No agregues nada fuera del JSON.`;

const PROMPT_IA_DEFAULT_REGLAS = `- SIEMPRE pedí la dirección de entrega completa antes de confirmar un pedido. No confirmes sin dirección.
- Preguntá cómo quiere pagar (efectivo o transferencia) antes de cerrar el pedido.
- Respuestas cortas y concretas. Nada de discursos largos.
- Si el cliente no encuentra lo que busca o pide algo fuera del catálogo, respondé con lo que tengas disponible o aclarale que lo vas a consultar con el local. No derives a un humano.
- El bot atiende siempre, no cierra. Si el cliente pregunta en qué horario hay una persona disponible, respondé con el horario del local.
- Si el local está CERRADO, avisá de forma amable y aclarás que los pedidos se toman cuando abra.
- IMPORTANTE: Si el carrito ya tiene items y tenés la dirección, confirmá el pedido, informá el total y preguntá cómo quiere pagar. No esperes a que el cliente diga "confirmo".`;

// Convierte los horarios estructurados en texto legible para la IA
function formatearHorarios(horarios) {
  if (!horarios || !Array.isArray(horarios) || horarios.length === 0) {
    return 'No configurados';
  }
  const ordenDias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const ordenados = [...horarios].sort((a, b) => {
    const da = ordenDias.indexOf(String(a.dia || '').toLowerCase());
    const db = ordenDias.indexOf(String(b.dia || '').toLowerCase());
    return (da === -1 ? 999 : da) - (db === -1 ? 999 : db);
  });
  return ordenados.map(h => `${h.dia}: ${h.apertura} a ${h.cierre}`).join(', ');
}

// Genera atajos automáticos basados en datos del Usuario (dueño del local) y de la Empresa
function generarAtajosAutomaticos(usuario, empresa) {
  const atajos = [];
  if (!usuario) return atajos;

  // 1. Dirección del local
  const direccion = (usuario.direccion || '').trim();
  if (direccion !== '') {
    atajos.push({
      comando: 'direccion',
      respuesta: `Nuestro local está en ${direccion}`
    });
  } else {
    atajos.push({
      comando: 'direccion',
      respuesta: 'Nuestra dirección aún no está cargada'
    });
  }

  // 2. Horarios de atención (siempre desde la Empresa, no del Usuario)
  const horariosFuente = (empresa && Array.isArray(empresa.horariosEstructurados))
    ? empresa.horariosEstructurados
    : [];
  const horariosTexto = formatearHorarios(horariosFuente);
  if (horariosTexto && horariosTexto !== 'No configurados') {
    atajos.push({
      comando: 'horarios',
      respuesta: `Nuestros horarios son: ${horariosTexto}`
    });
  } else {
    atajos.push({
      comando: 'horarios',
      respuesta: 'Horarios no configurados aún'
    });
  }

  // 3. Métodos de pago y datos de transferencia
  const metodosPago = usuario.metodosPago || [];
  const transferencia = metodosPago.find(m => m.tipo === 'transferencia');
  const tieneEfectivo = metodosPago.some(m => m.tipo === 'efectivo');
  const tieneTarjeta = metodosPago.some(m => m.tipo === 'tarjeta');

  const tipos = [];
  if (tieneEfectivo) tipos.push('efectivo');
  if (transferencia) tipos.push('transferencia');
  if (tieneTarjeta) tipos.push('tarjeta');
  const pagoBase = tipos.length > 0
    ? `Aceptamos ${tipos.join(' y ')}.`
    : 'Aceptamos efectivo y transferencia.';

  let pagoRespuesta = pagoBase;
  if (transferencia?.alias) {
    pagoRespuesta += ` Alias/CVU: ${transferencia.alias}`;
  }
  if (transferencia?.titular) {
    pagoRespuesta += ` a nombre de: ${transferencia.titular}`;
  }
  atajos.push({
    comando: 'pago',
    respuesta: pagoRespuesta.trim()
  });

  return atajos;
}

// Combina atajos automáticos con los manuales guardados en la empresa
function combinarAtajos(usuario, empresa) {
  const atajosAuto = generarAtajosAutomaticos(usuario, empresa);
  const atajosManuales = (empresa && Array.isArray(empresa.atajos)) ? empresa.atajos : [];

  const comandosAuto = new Set(atajosAuto.map(a => a.comando));
  const manualesPorComando = {};
  atajosManuales.forEach(a => {
    if (a.comando) manualesPorComando[a.comando] = a;
  });

  // Los automáticos pueden ser pisados por manuales con el mismo comando
  const combinados = atajosAuto.map(a => manualesPorComando[a.comando] || a);

  // Agregar manuales que no pisan ningún automático
  atajosManuales.forEach(a => {
    if (!comandosAuto.has(a.comando)) {
      combinados.push(a);
    }
  });

  return combinados.filter(a => a.comando && a.respuesta);
}

// Chequeo NO destructivo del stock del carrito (para pre-validar antes de responder).
async function verificarStockCarrito(items, empresaId) {
  const faltantes = [];
  for (const item of items || []) {
    const cantidad = Math.max(1, parseInt(item.cantidad) || 1);
    const nombre = String(item.nombre || '').trim();
    if (!nombre || !empresaId) continue;

    const prod = await Producto.findOne({ empresaId, nombre }).lean();
    if (!prod || prod.stock === null || prod.stock === undefined) continue;
    if (prod.stock < cantidad) {
      faltantes.push({ nombre, cantidad, disponible: prod.stock });
    }
  }
  return { ok: faltantes.length === 0, faltantes };
}

async function procesarCarrito(empresa, conversacion, texto, productos) {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    // No ofrecemos productos agotados al modelo
    const disponibles = (productos || []).filter(p =>
      p.stock === null || p.stock === undefined || p.stock > 0
    );
    if (disponibles.length === 0) return null;
    const menu = disponibles.map(p => `- ${p.nombre} ($${p.precio})`).join('\n');
    let prompt = `Actúa como sistema de punto de venta. El cliente escribió: "${texto}".
      Interpretá el pedido y devolvé un JSON con la estructura:
      {
        "items": [
          {"nombre": "...", "cantidad": 2, "precioUnitario": 10}
        ],
        "total": 20
      }
      Si el mensaje no hace referencia a ningún ítem, devolvé null.
      Catálogo:\n${menu}
      Respuesta JSON:`;
    const raw = (await generarTextoCola(prompt) || '').trim().replace(/```json/g, '').replace(/```/g, '').trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const data = JSON.parse(raw.substring(start, end + 1));
    if (!data || !Array.isArray(data.items)) return null;
    return { items: data.items, total: Number(data.total) || 0 };
  } catch (error) {
    console.error('⚠️ Error al procesar carrito:', error);
    return null;
  }
}

function detectarConfirmacionPedido(texto) {
  const lower = texto.toLowerCase();
  const confirmaciones = ['confirmo', 'confirmar', 'confirmado', 'dale', 'si, quiero', 'sí, quiero', 'si quiero', 'sí quiero', 'hago el pedido', 'ok, pago', 'vamos'];
  return confirmaciones.some(p => lower.includes(p));
}

function detectarMetodoPago(texto) {
  const lower = (texto || '').toLowerCase();
  if (/(efectivo|contado|billete|cash)/.test(lower)) return 'efectivo';
  if (/(transferencia|transferir|alias|cbu|depósito|deposito)/.test(lower)) return 'transferencia';
  if (/(tarjeta|débito|debito|crédito|credito|mercado pago|mercadopago)/.test(lower)) return 'tarjeta';
  return null;
}

function detectarIntencionHumano(texto) {
  const lower = (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const frases = [
    'quiero hablar con una persona',
    'quiero hablar con un humano',
    'hablar con una persona',
    'hablar con un humano',
    'quiero un asesor',
    'quiero hablar con alguien',
    'atendeme una persona',
    'que me atienda una persona',
    'que me atienda un humano',
    'operador',
    'asesor',
    'persona real',
    'humano',
    'agente',
    'representante'
  ];
  return frases.some(f => lower.includes(f));
}

function detectarCancelacionPedido(texto) {
  const lower = (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const expresiones = [
    /cancel/,
    /anul/,
    /arrepient/,
    /no (lo|la) quiero/,
    /no quiero (el|mi) pedido/,
    /baja (el|mi) pedido/,
    /darse de baja/
  ];

  return expresiones.some(re => re.test(lower));
}

async function obtenerOCrearConversacion({ empresaId, contactoId, ...datos }) {
  let conversacion = await Conversacion.findOne({ empresaId, contactoId }).sort({ createdAt: -1 });
  if (conversacion) return conversacion;

  try {
    conversacion = await Conversacion.create({ empresaId, contactoId, ...datos });
  } catch (error) {
    if (error.code === 11000) {
      conversacion = await Conversacion.findOne({ empresaId, contactoId }).sort({ createdAt: -1 });
      if (!conversacion) throw error;
    } else {
      throw error;
    }
  }

  return conversacion;
}

async function verificarVentana(conversacionId) {
  const ultimoCliente = await Mensaje.findOne({
    conversacionId,
    remitente: 'cliente'
  }).sort({ createdAt: -1 }).lean();
  if (!ultimoCliente) return true;
  const limite = new Date(ultimoCliente.createdAt).getTime() + 24 * 60 * 60 * 1000;
  return Date.now() < limite;
}

async function incrementarContadorConversaciones(empresaId, conversacionId) {
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existeMensajeSaliente = await Mensaje.findOne({
    conversacionId,
    remitente: { $in: ['ia', 'empresa', 'humano', 'bot'] },
    createdAt: { $gte: hace24h }
  });
  if (!existeMensajeSaliente) {
    await Empresa.findByIdAndUpdate(empresaId, {
      $inc: { conversacionesUsadas24h: 1 }
    });
  }
}

async function descontarSaldoPorCosto(usuario, costo, empresaId, io) {
  if (!usuario) return { ok: false, error: 'Usuario no encontrado' };
  if (usuario.monederoBloqueado) return { ok: false, error: 'Monedero bloqueado' };

  let saldo = usuario.saldoUsd || 0;
  let deuda = usuario.deudaPendienteUsd || 0;

  if (saldo >= costo) {
    saldo -= costo;
  } else {
    deuda += (costo - saldo);
    saldo = 0;
  }

  const tolerancia = usuario.deudaToleradaUsd || 5;
  const ratioDeuda = tolerancia > 0 ? deuda / tolerancia : 0;
  let bloqueado = false;

  if (deuda > tolerancia) {
    bloqueado = true;
    await Empresa.updateMany(
      { usuarioAppId: usuario._id.toString() },
      { $set: { botActivo: false } }
    );
    console.log(`🚫 Monedero bloqueado para usuario ${usuario._id} por deuda de ${deuda.toFixed(2)} USD`);

    if (io) {
      io.to(empresaId.toString()).emit('monedero-bloqueado', {
        usuarioId: usuario._id,
        deuda,
        tolerancia
      });
    }
  } else if (ratioDeuda >= 0.7 && !usuario.avisoEnviado) {
    if (io) {
      io.to(empresaId.toString()).emit('monedero-aviso', {
        deuda,
        tolerancia,
        porcentaje: Math.round(ratioDeuda * 100)
      });
    }
    await Usuario.findByIdAndUpdate(usuario._id, {
      $set: { avisoEnviado: true }
    });
  } else if (ratioDeuda < 0.7 && usuario.avisoEnviado) {
    await Usuario.findByIdAndUpdate(usuario._id, {
      $set: { avisoEnviado: false }
    });
  }

  await Usuario.findByIdAndUpdate(usuario._id, {
    $set: {
      saldoUsd: saldo,
      deudaPendienteUsd: deuda,
      monederoBloqueado: bloqueado
    }
  });

  return { ok: true, saldo, deuda, bloqueado };
}

const obtenerUsoConversaciones = async (req, res) => {
  try {
    const empresaId = req.empresaId || (req.empresas && req.empresas[0]);
    if (!empresaId) {
      return res.status(400).json({ error: 'No se pudo identificar la empresa' });
    }
    const empresa = await Empresa.findById(empresaId).lean();
    if (!empresa) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    const usados = empresa.conversacionesUsadas24h || 0;
    const maximo = empresa.limiteConversaciones24h || 250;
    return res.json({ ok: true, usados, maximo });
  } catch (error) {
    console.error('Error al obtener uso conversaciones:', error);
    return res.status(500).json({ error: 'Error interno al obtener uso' });
  }
};

function verificarFirmaMeta(req, res, next) {
  const firma = req.headers['x-hub-signature-256'];
  if (!firma || !req.rawBody) {
    return res.sendStatus(401);
  }
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    console.error('⚠️ Falta WHATSAPP_APP_SECRET en variables de entorno');
    return res.sendStatus(401);
  }
  const hash = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  const expected = 'sha256=' + hash;
  const firmaBuffer = Buffer.from(firma);
  const expectedBuffer = Buffer.from(expected);
  if (firmaBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(firmaBuffer, expectedBuffer)) {
    console.error('❌ Firma HMAC inválida');
    return res.sendStatus(401);
  }
  next();
}

const verificarWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

const recibirMensaje = async (req, res) => {
  try {
    logger.info("🔔 [1] ¡DING DONG! Facebook mandó algo al webhook");

    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value) {
        console.log("🛑 [2] Falla: No hay 'value' en el mensaje de Facebook.");
        return res.sendStatus(200);
    }

    const metadata = value?.metadata || {};
    // 📍 Manejar actualización de estado (entregado/leído)
    if (value?.statuses && Array.isArray(value.statuses) && value.statuses.length > 0) {
      for (const status of value.statuses) {
        const whatsappMsgId = status?.id || status?.message_id || null;
        const tipoEstado = status?.status || '';
        if (!whatsappMsgId) continue;
        let nuevoEstado = null;
        if (tipoEstado === 'sent') nuevoEstado = 'enviado';
        else if (tipoEstado === 'delivered') nuevoEstado = 'entregado';
        else if (tipoEstado === 'read') nuevoEstado = 'leido';
        if (!nuevoEstado) continue;
        try {
          const mensajeDb = await Mensaje.findOneAndUpdate(
            { whatsappMsgId },
            { $set: { estado: nuevoEstado, fechaEstado: new Date() } },
            { new: true }
          );
          if (mensajeDb) {
            const conversacionActual = await Conversacion.findById(mensajeDb.conversacionId);
            const ioStatus = req.app.get('io');
            if (conversacionActual && ioStatus) {
              ioStatus.to(conversacionActual.empresaId.toString()).emit('mensaje-estado', {
                mensajeId: mensajeDb._id,
                conversacionId: mensajeDb.conversacionId,
                estado: nuevoEstado,
                fechaEstado: new Date()
              });
            }
          }
        } catch (error) {
          console.error('Error al actualizar estado de mensaje:', error);
        }
      }
      return res.sendStatus(200);
    }
    // 1. Verificamos que 'contacts' exista y tenga al menos un elemento
    const contact = value?.contacts?.[0];
    // 2. Extraemos el nombre de forma segura (si no viene, le ponemos 'Cliente' por defecto)
    const nombre = contact?.profile?.name || 'Cliente';    
    const whatsappPhoneId = metadata?.phone_number_id || metadata?.display_phone_number || '';
    const displayPhoneNumber = metadata?.display_phone_number || '';
    const mensaje = value?.messages?.[0];

    if (!mensaje) {
        console.log("🛑 [2] Falla: Es una actualización de estado (ej. mensaje leído), no es un mensaje de texto.");
        return res.sendStatus(200);
    }

    const esTexto = mensaje?.type === 'text';
    const telefonoCliente = mensaje?.from || '';
    const textoMensaje = esTexto ? (mensaje?.text?.body || '') : '';
    const contenidoEntrada = esTexto ? textoMensaje : '📎 Envío un mensaje multimedia';

    const whatsappMsgId = mensaje?.id || '';

    // Contexto de publicidad Click-to-WhatsApp (viene solo en el primer mensaje)
    const referral = mensaje?.referral || null;
    const adSourceId = (referral?.source_id || referral?.sourceId || '').toString().trim();

    const t0 = performance.now();

    console.log(`🔍 [3] Datos extraídos -> Cliente: ${telefonoCliente} | Mi Local ID: ${whatsappPhoneId} | Texto: ${esTexto ? textoMensaje : '[MULTIMEDIA]'}`);

    if (!whatsappPhoneId || !telefonoCliente) {
      console.log("🛑 [4] Falla: Faltan datos clave (Teléfono, ID).");
      return res.sendStatus(200);
    }

    // Deduplicación: si ya procesamos este mensaje, no volver a hacerlo
    if (whatsappMsgId) {
      const yaProcesado = await Mensaje.findOne({ whatsappMsgId });
      if (yaProcesado) {
        console.log(`🔁 Mensaje duplicado ${whatsappMsgId} ignorado.`);
        return res.sendStatus(200);
      }
    }

    // ⚠️ No respondemos aún: primero hay que persistir el mensaje.
    // Si algo falla antes de guardar, respondemos 500 y Meta reintentará.

    console.log(`⚙️ [5] Buscando empresa en MongoDB con whatsappPhoneId: '${whatsappPhoneId}'`);
    const empresa = await Empresa.findOne({ whatsappPhoneId: whatsappPhoneId });
    
    if (!empresa) {
        logger.error("❌ [ERROR GRAVE] La base de datos no encontró ninguna empresa con ese número de ID.");
        return res.status(500).json({ error: 'Empresa no encontrada' });
    }
    console.log(`🏢 [6] ¡Empresa encontrada!: ${empresa.nombre}`);
    const localAbierto = empresa.abierto !== false;
    
    // Buscar el Usuario que posee la empresa (para datos auxiliares) y el catálogo desde Producto
    const usuario = await Usuario.findById(empresa.usuarioAppId).lean();
    const productos = await Producto.find({ empresaId: empresa._id }).lean();

    // 🆕 Cliente nuevo?
    let esClienteNuevo = false;
    let contacto = await Cliente.findOne({ empresaId: empresa._id, telefono: telefonoCliente });
    if (!contacto) {
      console.log("👤 [7] Creando nuevo cliente...");
      contacto = await Cliente.create({ localId: usuario._id, empresaId: empresa._id, telefono: telefonoCliente, nombre: nombre });
      esClienteNuevo = true;
    }

    // 🚫 Si el cliente está bloqueado, descartamos el mensaje por completo
    // Pero respondemos 200 a Meta para evitar reintentos infinitos del webhook
    if (contacto.bloqueado) {
      console.log(`🚫 Cliente bloqueado (${telefonoCliente}), se descarta mensaje.`);
      return res.sendStatus(200);
    }

    let conversacion = await obtenerOCrearConversacion({
      empresaId: empresa._id,
      contactoId: contacto._id,
      lineaReceptora: whatsappPhoneId,
      numeroReceptor: displayPhoneNumber,
      botActivo: empresa.botActivo !== false,
      estado: 'Abierto',
      ultimoMensaje: textoMensaje
    });
    if (conversacion.estado !== 'Abierto') {
      conversacion.estado = 'Abierto';
      await conversacion.save();
    }

    // Habilitación del bot para esta conversación (global de empresa y por conversación)
    const botHabilitado = (empresa.botActivo !== false) && (conversacion.botActivo !== false);

    // Si llegó por publicidad (Click-to-WhatsApp), guardar el id del anuncio en la conversación
    if (adSourceId && !conversacion.fbAdId) {
      conversacion.fbAdId = adSourceId;
      await Conversacion.findByIdAndUpdate(conversacion._id, { $set: { fbAdId: adSourceId } });
    }
    const esPrimerMensajeDePublicidad = esTexto && !!adSourceId && !conversacion.bienvenidaPublicidadEnviada;

    // 🎉 Mensaje de bienvenida para clientes nuevos (se omite si viene de publicidad)
    if (botHabilitado && esClienteNuevo && empresa.bienvenida && empresa.bienvenida.trim() !== '' && !esPrimerMensajeDePublicidad) {
      const phoneNumberIdBienvenida = metadata?.phone_number_id || whatsappPhoneId;
      const accessTokenBienvenida = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;
      if (phoneNumberIdBienvenida && accessTokenBienvenida) {
        try {
          const url = `https://graph.facebook.com/v19.0/${phoneNumberIdBienvenida}/messages`;
          const payload = {
            messaging_product: 'whatsapp',
            to: telefonoCliente,
            type: 'text',
            text: { body: empresa.bienvenida.trim() }
          };
          const resp = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessTokenBienvenida}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });
          if (resp.ok) {
            console.log('✅ Mensaje de bienvenida enviado al nuevo cliente', telefonoCliente);
            const mensajeBienvenidaDb = await Mensaje.create({
              conversacionId: conversacion._id,
              remitente: 'ia',
              contenido: empresa.bienvenida.trim()
            });
            await Conversacion.findByIdAndUpdate(conversacion._id, {
              $set: { ultimoMensaje: empresa.bienvenida.trim() }
            });
            const iob = req.app.get('io');
            if (iob) {
              iob.to(empresa._id.toString()).emit('mensaje-nuevo', {
                conversacionId: conversacion._id,
                mensaje: {
                  _id: mensajeBienvenidaDb._id,
                  remitente: 'ia',
                  contenido: empresa.bienvenida.trim(),
                  estado: 'enviado',
                  fecha: new Date()
                },
                conversacion: {
                  _id: conversacion._id,
                  ultimoMensaje: empresa.bienvenida.trim(),
                  updatedAt: new Date()
                }
              });
            }
          } else {
            const respBody = await resp.json().catch(() => ({}));
            console.error('❌ Error al enviar bienvenida:', resp.status, respBody);
          }
        } catch (error) {
          console.error('❌ Error de red al enviar bienvenida:', error);
        }
      }
    }

    console.log("📝 [9] Guardando mensaje...");
    let mensajeClienteDb;
    try {
      mensajeClienteDb = await Mensaje.create({
        conversacionId: conversacion._id,
        remitente: 'cliente',
        contenido: contenidoEntrada,
        whatsappMsgId
      });
    } catch (error) {
      if (error.code === 11000 && whatsappMsgId) {
        console.log(`🔁 [DEDUP] Mensaje ${whatsappMsgId} ya procesado, ignorado.`);
        return;
      }
      throw error;
    }

    await Conversacion.findByIdAndUpdate(conversacion._id, {
      $set: {
        ultimoMensaje: contenidoEntrada,
        numeroReceptor: displayPhoneNumber
      }
    });

    // Emitir el mensaje entrante ANTES de procesar el carrito para que el panel lo muestre al instante
    const ioEntrante = req.app.get('io');
    if (ioEntrante) {
      ioEntrante.to(empresa._id.toString()).emit('mensaje-nuevo', {
        conversacionId: conversacion._id,
        mensaje: {
          _id: mensajeClienteDb._id,
          remitente: 'cliente',
          contenido: contenidoEntrada,
          fecha: new Date()
        },
        conversacion: {
          _id: conversacion._id,
          ultimoMensaje: contenidoEntrada,
          updatedAt: new Date()
        }
      });
    }

    // ⚡ Recién acá avisamos a Meta que el mensaje se procesó correctamente.
    // Si algo falla antes de este punto, respondemos 500 y Meta reintentará.
    if (!res.headersSent) {
      res.sendStatus(200);
    }

    // ===== Contexto de publicidad (Click-to-WhatsApp) =====
    if (esPrimerMensajeDePublicidad) {
      const productosAd = await Producto.find({ empresaId: empresa._id, fbAdId: adSourceId }).lean();

      await Conversacion.findByIdAndUpdate(conversacion._id, {
        $set: {
          bienvenidaPublicidadEnviada: true,
          productoOrigenId: productosAd.length === 1 ? productosAd[0]._id : null
        }
      });

      if (productosAd.length > 0 && botHabilitado) {
        const phoneNumberIdAd = metadata?.phone_number_id || whatsappPhoneId;
        const accessTokenAd = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;

        let respuestaPublicidad = '';
        if (productosAd.length === 1) {
          const p = productosAd[0];
          const partes = [`¡Hola! Gracias por escribirnos por la ${p.nombre} ($${p.precio}).`];
          if (p.dimensions?.displayString) partes.push(`Medidas: ${p.dimensions.displayString}`);
          if (Array.isArray(p.extras) && p.extras.length > 0) partes.push(`Incluye: ${p.extras.join(', ')}`);
          if (p.envio?.tipo === 'gratis') partes.push('Envío gratis.');
          else if (p.envio?.tipo === 'fijo') partes.push(`Envío $${Number(p.envio.costo || 0).toFixed(2)}.`);
          else partes.push('El envío se cotiza según tu zona.');
          partes.push('¿Querés saber algo más?');
          respuestaPublicidad = partes.join('\n');
        } else {
          const lista = productosAd.map(p => `- ${p.nombre} ($${p.precio})`).join('\n');
          respuestaPublicidad = `¡Hola! Gracias por escribirnos. Vi que llegaste por una publicidad y tenemos varias opciones:\n${lista}\n\n¿Cuál te interesa?`;
        }

        if (accessTokenAd && phoneNumberIdAd) {
          try {
            await fetch(`https://graph.facebook.com/v19.0/${phoneNumberIdAd}/messages`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessTokenAd}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: telefonoCliente,
                type: 'text',
                text: { body: respuestaPublicidad }
              })
            });
            console.log('✅ Respuesta contextual de publicidad enviada');
          } catch (error) {
            console.error('❌ Error al enviar respuesta de publicidad:', error);
          }
        }

        const mensajeAdDb = await Mensaje.create({
          conversacionId: conversacion._id,
          remitente: 'ia',
          contenido: respuestaPublicidad
        });

        await Conversacion.findByIdAndUpdate(conversacion._id, {
          $set: { ultimoMensaje: respuestaPublicidad }
        });

        const ioAd = req.app.get('io');
        if (ioAd) {
          ioAd.to(empresa._id.toString()).emit('mensaje-nuevo', {
            conversacionId: conversacion._id,
            mensaje: {
              _id: mensajeAdDb._id,
              remitente: 'ia',
              contenido: respuestaPublicidad,
              estado: 'enviado',
              fecha: new Date()
            },
            conversacion: {
              _id: conversacion._id,
              ultimoMensaje: respuestaPublicidad,
              updatedAt: new Date()
            }
          });
        }

        console.log(`✅ [PUBLICIDAD] Respuesta contextual enviada (fbAdId=${adSourceId}, productos=${productosAd.length})`);
        return;
      }
    }

    // ===== Manejo de mensajes multimedia (imagen, audio, video, etc.) =====
    if (!esTexto) {
      let respuestaAutomatica = "Disculpá, por el momento mi sistema automático solo puede leer mensajes de texto. Por favor, escribime tu consulta.";

      const phoneNumberId = metadata?.phone_number_id || whatsappPhoneId;
      const accessToken = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;

      // Si la empresa activó el procesamiento de imágenes, intentamos analizarla con Gemini
      if (botHabilitado && mensaje.type === 'image' && empresa.procesarImagenes === true && accessToken) {
        const mediaId = mensaje.image?.id;
        if (mediaId) {
          try {
            // 1. Obtener la URL de descarga
            const mediaResp = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const mediaJson = await mediaResp.json();
            if (mediaJson.url) {
              // 2. Descargar el archivo binario
              const imgResp = await fetch(mediaJson.url, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              });
              const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
              const mimeType = mediaJson.mime_type || 'image/jpeg';
              const base64 = imgBuffer.toString('base64');

              // 3. Enviarlo a Gemini con visión
              const promptVision = "El cliente de un local de ropa te envió esta imagen. Analizá la imagen y respondé de forma breve y amable. Si es una prenda, preguntá por talle, color o cantidad. Si aparece texto, incluílo.";
              const respuestaIA = await generarTextoConImagen(promptVision, mimeType, base64);
              if (respuestaIA) {
                respuestaAutomatica = respuestaIA;
                console.log('✅ Imagen procesada con Gemini');
              }
            }
          } catch (error) {
            console.error('❌ Error al procesar imagen con Gemini:', error);
          }
        }
      }

      // Debug temporal para audios
      console.log('🎵 DEBUG AUDIO:', {
        type: mensaje.type,
        tieneAudioId: !!mensaje.audio?.id,
        tieneDocumentId: !!mensaje.document?.id,
        procesarAudios: empresa.procesarAudios,
        tieneToken: !!accessToken
      });
      // 🔍 Log del payload completo de audio para diagnosticar duración
      console.log('🎵 PAYLOAD AUDIO COMPLETO:', JSON.stringify({
        type: mensaje.type,
        audio: mensaje.audio,
        voice: mensaje.voice,
        document: mensaje.document
      }, null, 2));

      // ===== Manejo de ubicaciones (maps) =====
      if (mensaje.type === 'location') {
        const lat = mensaje.location?.latitude;
        const lng = mensaje.location?.longitude;
        const nombreLugar = mensaje.location?.name || '';
        const addressWpp = mensaje.location?.address || '';

        let direccionFinal = addressWpp;

        // Si WhatsApp no mandó la dirección (solo lat/lng), intentamos con Nominatim
        if (!direccionFinal && lat && lng) {
          try {
            const urlNominatim = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
            const respNominatim = await fetch(urlNominatim, {
              headers: {
                'User-Agent': 'CRM-WhatsApp-Bot/1.0 (contacto: admin@example.com)'
              }
            });
            const dataNominatim = await respNominatim.json();
            if (dataNominatim && dataNominatim.display_name) {
              direccionFinal = dataNominatim.display_name;
            } else if (dataNominatim && dataNominatim.address) {
              // construimos una dirección simple
              const a = dataNominatim.address;
              const calle = a.road || a.pedestrian || '';
              const numero = a.house_number || '';
              direccionFinal = [calle, numero].filter(Boolean).join(' ');
              if (!direccionFinal) direccionFinal = dataNominatim.display_name;
            }
          } catch (error) {
            console.error('❌ Error al geocodificar con Nominatim:', error);
          }
        }

        // Guardar la dirección en el cliente si no tenía
        if (direccionFinal && (!contacto.direccion || contacto.direccion.trim() === '')) {
          await Cliente.findByIdAndUpdate(contacto._id, { $set: { direccion: direccionFinal } });
          contacto.direccion = direccionFinal;
          console.log('✅ Dirección guardada automáticamente desde la ubicación');
        }

        // Guardar lat/lng en la conversación para usarlas en el pedido posteriormente
        if (lat && lng) {
          await Conversacion.findByIdAndUpdate(conversacion._id, {
            $set: { latitud: lat, longitud: lng }
          });
          conversacion.latitud = lat;
          conversacion.longitud = lng;
          console.log('📍 Latitud/Longitud guardadas en la conversación');
        }

        // Construir respuesta
        if (lat && lng && process.env.GEMINI_API_KEY) {
          const promptUbicacion = `Sos el asistente virtual de ${empresa.nombre}. El cliente compartió su ubicación: ${nombreLugar} ${direccionFinal} (lat:${lat}, lng:${lng}). Respondé de forma breve y amable. Si el negocio hace envíos, indicá que anotaron la dirección y confirmá el pedido. Si no hacen envíos, disculpate y explicá cómo retirar por el local.`;
          const respuestaIA = await generarTexto(promptUbicacion);
          if (respuestaIA) {
            respuestaAutomatica = respuestaIA;
            console.log('✅ Ubicación procesada con Gemini');
          } else {
            respuestaAutomatica = `Gracias por compartir tu ubicación 📍`;
          }
        } else {
          respuestaAutomatica = `Gracias por compartir tu ubicación 📍`;
        }
      }

      // Si la empresa activó el procesamiento de audios, intentamos transcribirlo con Gemini
      // Pero SIEMPRE descargamos y guardamos el audio para que el operador lo escuche en el panel
      const mediaIdMultimedia = mensaje.audio?.id || mensaje.voice?.id || mensaje.image?.id || mensaje.document?.id || mensaje.video?.id || mensaje.sticker?.id;
      if (mediaIdMultimedia && accessToken) {
        try {
          // 1. Obtener la URL de descarga
          const mediaResp = await fetch(`https://graph.facebook.com/v19.0/${mediaIdMultimedia}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          const mediaJson = await mediaResp.json();
          console.log('🎵 MEDIA JSON DE META:', JSON.stringify(mediaJson, null, 2));
          if (!mediaResp.ok) {
            console.error('❌ Error al obtener media de Meta:', mediaResp.status, mediaJson);
          }
          const mimeTypeDetectado = mediaJson.mime_type || (mensaje.type === 'voice' || mensaje.type === 'audio' ? 'audio/ogg' : (mensaje.type === 'image' ? 'image/jpeg' : (mensaje.type === 'sticker' ? 'image/webp' : (mensaje.type === 'video' ? 'video/mp4' : (mensaje.type === 'document' ? 'application/octet-stream' : '')))));
          const esArchivoAudio = mensaje.type === 'voice' || mensaje.type === 'audio' || mimeTypeDetectado.startsWith('audio/');
          const esDocumento = mensaje.type === 'document';
          const esSticker = mensaje.type === 'sticker';
          const esVideo = mensaje.type === 'video' || mimeTypeDetectado.startsWith('video/');
          // Excluimos stickers del branch de imagen para guardarlos con su propio tipo
          const esImagen = !esSticker && (mensaje.type === 'image' || mimeTypeDetectado.startsWith('image/'));

          if (mediaJson.url && (esArchivoAudio || esDocumento || esImagen || esVideo || esSticker)) {
            // 2. Descargar el archivo binario con header; si falla reintenta con query param
            let fileResp = await fetch(mediaJson.url, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!fileResp.ok) {
              console.warn(`⚠️ Falló descarga con header. Reintentando con query param. Status: ${fileResp.status}`);
              fileResp = await fetch(`${mediaJson.url}?access_token=${accessToken}`);
            }
            let fileBuffer = Buffer.alloc(0);
            if (!fileResp.ok) {
              console.error('❌ Error al descargar el archivo de Meta:', fileResp.status, await fileResp.text());
            } else {
              fileBuffer = Buffer.from(await fileResp.arrayBuffer());
              if (!fileBuffer || fileBuffer.length < 500) {
                console.error('⚠️ Archivo descargado vacío o muy chico, se descarta');
                fileBuffer = Buffer.alloc(0);
              }
            }
            const mimeType = mimeTypeDetectado;

            // 2b. Guardar el audio en /uploads y actualizar el mensaje del cliente
            if (esArchivoAudio && fileBuffer.length > 0) {
              try {
                const empresaFolder = String(empresa._id);
                const uploadDirEmpresa = path.join(__dirname, '..', 'uploads', empresaFolder);
                fs.mkdirSync(uploadDirEmpresa, { recursive: true });
                const extMap = {
                  'audio/mpeg': '.mp3',
                  'audio/mp3': '.mp3',
                  'audio/ogg': '.ogg',
                  'audio/opus': '.opus',
                  'audio/mp4': '.m4a',
                  'audio/aac': '.aac',
                  'audio/amr': '.amr',
                  'audio/wav': '.wav',
                  'audio/x-wav': '.wav'
                };
                const ext = extMap[mimeType] || '.ogg';
                const nombreBase = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
                const archivoTemp = path.join(uploadDirEmpresa, `${nombreBase}${ext}`);
                fs.writeFileSync(archivoTemp, fileBuffer);

                // Intentar conversion a MP3 para máxima compatibilidad (Chrome, Safari, Firefox, Edge)
                const archivoFinal = path.join(uploadDirEmpresa, `${nombreBase}.mp3`);
                let archivoGuardado = archivoTemp;
                let extensionFinal = ext;
                try {
                  await execFileAsync('ffmpeg', ['-version'], { timeout: 3000 });
                  await execFileAsync('ffmpeg', ['-i', archivoTemp, '-codec:a', 'libmp3lame', '-qscale:a', '2', archivoFinal]);
                  archivoGuardado = archivoFinal;
                  extensionFinal = '.mp3';
                  // Eliminamos el .ogg temporal
                  if (fs.existsSync(archivoTemp)) fs.unlinkSync(archivoTemp);
                } catch (convErr) {
                  console.warn('⚠️ No se pudo convertir a MP3, se usará el archivo original:', convErr.message);
                }

                const filename = path.basename(archivoGuardado);
                let duracionSegundos = mensaje.audio?.duration || mensaje.voice?.duration || null;
                console.log('🎵 duración desde payload de Meta:', duracionSegundos);
                // Si no vino duración desde Meta, intentamos leerla del archivo convertido
                try {
                  const duracionReal = await obtenerDuracionArchivo(archivoGuardado);
                  console.log('🎵 duración real del archivo con ffprobe:', duracionReal);
                  if ((!duracionSegundos || duracionSegundos === 0) && duracionReal) {
                    duracionSegundos = duracionReal;
                    console.log('🎵 usando duración real como fallback:', duracionSegundos);
                  }
                } catch (e) {
                  console.warn('⚠️ No se pudo obtener duración con ffprobe:', e.message);
                }
                // Actualizar el mensaje del cliente con tipo y urlArchivo
                await Mensaje.findByIdAndUpdate(mensajeClienteDb._id, {
                  $set: {
                    tipo: 'audio',
                    urlArchivo: `/uploads/${empresaFolder}/${filename}`,
                    contenido: '📎 [Audio]',
                    duracionSegundos
                  }
                });

                // Emitir la actualización al panel
                const ioAudio = req.app.get('io');
                if (ioAudio) {
                  ioAudio.to(empresa._id.toString()).emit('mensaje-nuevo', {
                    conversacionId: conversacion._id,
                    mensaje: {
                      _id: mensajeClienteDb._id,
                      remitente: 'cliente',
                      contenido: '📎 [Audio]',
                      tipo: 'audio',
                      urlArchivo: `/uploads/${empresaFolder}/${filename}`,
                      duracionSegundos,
                      fecha: new Date()
                    },
                    conversacion: {
                      _id: conversacion._id,
                      ultimoMensaje: contenidoEntrada,
                      updatedAt: new Date()
                    }
                  });
                }
              } catch (err) {
                console.error('❌ Error al guardar audio:', err);
              }
            } else if (esImagen && fileBuffer.length > 0) {
              try {
                const empresaFolder = String(empresa._id);
                const uploadDirEmpresa = path.join(__dirname, '..', 'uploads', empresaFolder);
                fs.mkdirSync(uploadDirEmpresa, { recursive: true });
                const extMap = {
                  'image/jpeg': '.jpg',
                  'image/jpg': '.jpg',
                  'image/png': '.png',
                  'image/webp': '.webp',
                  'image/gif': '.gif'
                };
                const ext = extMap[mimeType] || '.jpg';
                const nombreBase = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
                const archivoFinal = path.join(uploadDirEmpresa, `${nombreBase}${ext}`);
                fs.writeFileSync(archivoFinal, fileBuffer);
                const filename = path.basename(archivoFinal);
                // Actualizar el mensaje del cliente con tipo y urlArchivo
                await Mensaje.findByIdAndUpdate(mensajeClienteDb._id, {
                  $set: {
                    tipo: 'imagen',
                    urlArchivo: `/uploads/${empresaFolder}/${filename}`,
                    contenido: '📎 [Imagen]'
                  }
                });

                // Emitir la actualización al panel
                const ioImg = req.app.get('io');
                if (ioImg) {
                  ioImg.to(empresa._id.toString()).emit('mensaje-nuevo', {
                    conversacionId: conversacion._id,
                    mensaje: {
                      _id: mensajeClienteDb._id,
                      remitente: 'cliente',
                      contenido: '📎 [Imagen]',
                      tipo: 'imagen',
                      urlArchivo: `/uploads/${empresaFolder}/${filename}`,
                      fecha: new Date()
                    },
                    conversacion: {
                      _id: conversacion._id,
                      ultimoMensaje: contenidoEntrada,
                      updatedAt: new Date()
                    }
                  });
                }
              } catch (err) {
                console.error('❌ Error al guardar imagen:', err);
              }
            } else if (esSticker && fileBuffer.length > 0) {
              try {
                const empresaFolder = String(empresa._id);
                const uploadDirEmpresa = path.join(__dirname, '..', 'uploads', empresaFolder);
                fs.mkdirSync(uploadDirEmpresa, { recursive: true });
                const nombreArchivo = `${Date.now()}-${Math.round(Math.random() * 1E9)}.webp`;
                const archivoFinal = path.join(uploadDirEmpresa, nombreArchivo);
                fs.writeFileSync(archivoFinal, fileBuffer);
                const urlRelativa = `/uploads/${empresaFolder}/${nombreArchivo}`;
                await Mensaje.findByIdAndUpdate(mensajeClienteDb._id, {
                  $set: { tipo: 'sticker', urlArchivo: urlRelativa, contenido: '📎 [Sticker]' }
                });
                const ioSticker = req.app.get('io');
                if (ioSticker) {
                  ioSticker.to(empresa._id.toString()).emit('mensaje-nuevo', {
                    conversacionId: conversacion._id,
                    mensaje: {
                      _id: mensajeClienteDb._id,
                      remitente: 'cliente',
                      contenido: '📎 [Sticker]',
                      tipo: 'sticker',
                      urlArchivo: urlRelativa,
                      fecha: new Date()
                    },
                    conversacion: {
                      _id: conversacion._id,
                      ultimoMensaje: contenidoEntrada,
                      updatedAt: new Date()
                    }
                  });
                }
              } catch (err) {
                console.error('❌ Error al guardar sticker:', err);
              }
            } else if (esVideo && fileBuffer.length > 0) {
              try {
                const empresaFolder = String(empresa._id);
                const uploadDirEmpresa = path.join(__dirname, '..', 'uploads', empresaFolder);
                fs.mkdirSync(uploadDirEmpresa, { recursive: true });
                const nombreArchivo = `${Date.now()}-${Math.round(Math.random() * 1E9)}.mp4`;
                const archivoFinal = path.join(uploadDirEmpresa, nombreArchivo);
                fs.writeFileSync(archivoFinal, fileBuffer);
                const urlRelativa = `/uploads/${empresaFolder}/${nombreArchivo}`;
                await Mensaje.findByIdAndUpdate(mensajeClienteDb._id, {
                  $set: { tipo: 'video', urlArchivo: urlRelativa, contenido: '📎 [Video]' }
                });
                const ioVideo = req.app.get('io');
                if (ioVideo) {
                  ioVideo.to(empresa._id.toString()).emit('mensaje-nuevo', {
                    conversacionId: conversacion._id,
                    mensaje: {
                      _id: mensajeClienteDb._id,
                      remitente: 'cliente',
                      contenido: '📎 [Video]',
                      tipo: 'video',
                      urlArchivo: urlRelativa,
                      fecha: new Date()
                    },
                    conversacion: {
                      _id: conversacion._id,
                      ultimoMensaje: contenidoEntrada,
                      updatedAt: new Date()
                    }
                  });
                }
              } catch (err) {
                console.error('❌ Error al guardar video:', err);
              }
            }

            // 3. Procesar con Gemini solo si está habilitado y es audio
            if (botHabilitado && esArchivoAudio && empresa.procesarAudios === true && fileBuffer.length > 0) {
              const base64 = fileBuffer.toString('base64');
              const promptAudio = `Sos el asistente virtual de ${empresa.nombre}. Un cliente te envió un mensaje de voz. Escuchá el audio y respondé DIRECTAMENTE al cliente, de forma breve y amable, continuando la conversación.

Reglas:
- NO incluyas la transcripción del audio en tu respuesta.
- NO uses títulos ni etiquetas como "Transcripción:", "Respuesta:", "Bot:", etc.
- Respondé SOLO con el mensaje final que se le enviará al cliente por WhatsApp.`;
              try {
                const respuestaIA = await generarTextoConAudio(promptAudio, mimeType, base64);
                if (respuestaIA) {
                  respuestaAutomatica = respuestaIA;
                  console.log('✅ Audio procesado con Gemini');
                }
              } catch (errorGemini) {
                console.error('❌ Error al procesar audio con Gemini:', errorGemini);
              }
            }
          }
        } catch (error) {
          console.error('❌ Error al procesar audio con Gemini:', error);
        }
      }

      // Enviar respuesta al cliente por WhatsApp (si tenemos token)
      if (botHabilitado && accessToken) {
        try {
          const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
          const payload = {
            messaging_product: 'whatsapp',
            to: telefonoCliente,
            type: 'text',
            text: { body: respuestaAutomatica }
          };
          await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });
          console.log('✅ Respuesta automática por multimedia enviada a WhatsApp');
        } catch (error) {
          console.error('❌ Error enviando respuesta automática de multimedia a WhatsApp:', error);
        }
      }

      if (botHabilitado) {
        // Guardar mensaje del bot en BD
        await Mensaje.create({
          conversacionId: conversacion._id,
          remitente: 'ia',
          contenido: respuestaAutomatica
        });

        await Conversacion.findByIdAndUpdate(conversacion._id, {
          $set: { ultimoMensaje: respuestaAutomatica }
        });

        const ioResp = req.app.get('io');
        if (ioResp) {
          ioResp.to(empresa._id.toString()).emit('mensaje-nuevo', {
            conversacionId: conversacion._id,
            mensaje: {
              remitente: 'ia',
              contenido: respuestaAutomatica,
              fecha: new Date()
            },
            conversacion: {
              _id: conversacion._id,
              ultimoMensaje: respuestaAutomatica,
              updatedAt: new Date()
            }
          });
        }
      }

      // Finalizamos aquí, no procesamos carrito ni IA
      return;
    }

    console.log(`⏱️ Tiempo hasta mensaje guardado: ${(performance.now() - t0).toFixed(0)} ms`);

    // ===== Cancelación de pedido (validada por IA) =====
    if (botHabilitado && detectarCancelacionPedido(textoMensaje) && process.env.GEMINI_API_KEY) {
      const promptCancelacion = `Sos el asistente virtual de ${empresa.nombre} y estás atendiendo a un cliente.
El cliente escribió: "${textoMensaje}"

Quiero que determines si el cliente quiere CANCELAR un pedido que ya hizo, o si simplemente está hablando de cancelar pero no es una intención real.

Respondé SOLO con un JSON válido:
{
  "accion": "cancelar" | "no_cancelar",
  "respuesta_para_cliente": "mensaje breve que le responderías al cliente"
}

Ejemplos:
- "quiero cancelar mi pedido" → {"accion": "cancelar", "respuesta_para_cliente": "Listo, tu pedido fue cancelado. ¿Necesitás algo más?"}
- "no canceles nada, solo preguntaba" → {"accion": "no_cancelar", "respuesta_para_cliente": "Ah, perfecto, sigamos entonces. ¿En qué más te ayudo?"}
- "me arrepentí, cancelá" → {"accion": "cancelar", "respuesta_para_cliente": "No hay problema, tu pedido fue cancelado."}
- "¿puedo cancelar si quiero?" → {"accion": "no_cancelar", "respuesta_para_cliente": "Claro, si necesitás cancelar tu pedido avisame y lo hacemos al toque."}

JSON:`;

      const rawCancel = (await generarTextoCola(promptCancelacion) || '').trim()
        .replace(/```json/g, '').replace(/```/g, '').trim();
      const startC = rawCancel.indexOf('{');
      const endC = rawCancel.lastIndexOf('}');
      let decisionCancel = null;
      if (startC !== -1 && endC !== -1) {
        try {
          decisionCancel = JSON.parse(rawCancel.substring(startC, endC + 1));
        } catch (e) {
          console.warn('⚠️ No se pudo parsear JSON de cancelación:', e.message);
        }
      }

      if (decisionCancel?.accion === 'cancelar') {
        const pedidoActivo = await Pedido.findOne({
          empresaId: empresa._id,
          contactoId: contacto._id,
          estado: { $nin: ['Entregado', 'Cancelado'] }
        }).sort({ createdAt: -1 });

        if (pedidoActivo) {
          if (!pedidoActivo.stockDevuelto) {
            await reintegrarStock(pedidoActivo.items, empresa._id);
            await Pedido.findByIdAndUpdate(pedidoActivo._id, {
              $set: { stockDevuelto: true }
            });
          }
          await Pedido.findByIdAndUpdate(pedidoActivo._id, {
            $set: { estado: 'Cancelado' }
          });
          console.log(`✅ [CANCELACIÓN] Pedido ${pedidoActivo._id} cancelado por el cliente`);
        } else {
          decisionCancel.respuesta_para_cliente = 'No tenés ningún pedido en curso para cancelar. ¿Querés hacer un pedido?';
        }
      } else if (!decisionCancel) {
        decisionCancel = {
          accion: 'no_cancelar',
          respuesta_para_cliente: 'Disculpá, no entendí bien. ¿Me confirmás si querés cancelar tu pedido?'
        };
      }

      const respuestaCancelacion = decisionCancel.respuesta_para_cliente || '¿En qué más te ayudo?';

      const phoneNumberId = metadata?.phone_number_id || whatsappPhoneId;
      const accessToken = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;
      if (accessToken) {
        try {
          const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
          const payload = {
            messaging_product: 'whatsapp',
            to: telefonoCliente,
            type: 'text',
            text: { body: respuestaCancelacion }
          };
          await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });
        } catch (error) {
          console.error('❌ Error al enviar respuesta de cancelación:', error);
        }
      }

      const mensajeCancelacionDb = await Mensaje.create({
        conversacionId: conversacion._id,
        remitente: 'ia',
        contenido: respuestaCancelacion
      });
      await Conversacion.findByIdAndUpdate(conversacion._id, {
        $set: { ultimoMensaje: respuestaCancelacion }
      });

      const ioc = req.app.get('io');
      if (ioc) {
        ioc.to(empresa._id.toString()).emit('mensaje-nuevo', {
          conversacionId: conversacion._id,
          mensaje: {
            _id: mensajeCancelacionDb._id,
            remitente: 'ia',
            contenido: respuestaCancelacion,
            estado: 'enviado',
            fecha: new Date()
          },
          conversacion: {
            _id: conversacion._id,
            ultimoMensaje: respuestaCancelacion,
            updatedAt: new Date()
          }
        });
        if (decisionCancel?.accion === 'cancelar') {
          ioc.to(empresa._id.toString()).emit('pedido-actualizado', {
            conversacionId: conversacion._id,
            pedidoId: pedidoActivo?._id,
            estado: 'Cancelado'
          });

          // Aviso especial para el dueño
          if (pedidoActivo) {
            ioc.to(empresa._id.toString()).emit('pedido-cancelado', {
              conversacionId: conversacion._id,
              pedidoId: pedidoActivo._id,
              clienteNombre: contacto.nombre || 'Cliente',
              telefonoCliente: contacto.telefono,
              total: pedidoActivo.total || 0
            });
          }
        }
      }

      return;
    }

    // ===== Procesar carrito en vivo (después de mostrar el mensaje) =====
    let carritoProcesado = null;
    if (botHabilitado) {
      carritoProcesado = await procesarCarrito(empresa, conversacion, textoMensaje, productos);
    }
    if (carritoProcesado) {
      conversacion.carrito = carritoProcesado.items;
      conversacion.carritoTotal = carritoProcesado.total;
      await Conversacion.findByIdAndUpdate(conversacion._id, {
        $set: {
          carrito: carritoProcesado.items,
          carritoTotal: carritoProcesado.total,
          carritoActualizadoAt: new Date()
        }
      });
      const ioCarrito = req.app.get('io');
      if (ioCarrito) {
        ioCarrito.to(empresa._id.toString()).emit('carrito-actualizado', {
          conversacionId: conversacion._id,
          carrito: carritoProcesado.items,
          total: carritoProcesado.total
        });
      }
    }

    // ===== Protección contra confirmación de pedidos viejos =====
    const carritoVigente = Array.isArray(conversacion.carrito) && conversacion.carrito.length > 0;
    if (carritoVigente && conversacion.carritoActualizadoAt) {
      const msDesdeCarrito = Date.now() - new Date(conversacion.carritoActualizadoAt).getTime();
      if (msDesdeCarrito > 24 * 60 * 60 * 1000) {
        // El carrito tiene más de 24 horas: se descarta
        await Conversacion.findByIdAndUpdate(conversacion._id, {
          $set: { carrito: [], carritoTotal: 0, carritoActualizadoAt: null }
        });
        conversacion.carrito = [];
        conversacion.carritoTotal = 0;
      }
    }

    const esSaludo = /^(hola|buenas|buen[ao]s?|que tal|hey|hi|hello|saludos)\b/i.test(textoMensaje.trim());
    let avisoAntiFalsoConfirm = '';
    if ((conversacion.carrito || []).length > 0 && esSaludo && !carritoProcesado) {
      avisoAntiFalsoConfirm = '\n\nIMPORTANTE: El cliente acaba de enviar un saludo. No confirmes ni avances con el pedido anterior. Preguntale si desea retomar el pedido anterior o si quiere hacer uno nuevo.';
    }

    // ===== Extracción automática de datos del cliente con IA =====
    try {
      if (botHabilitado && process.env.GEMINI_API_KEY) {
        const promptExtract = `Analizá el siguiente mensaje de un cliente. Si contiene una dirección física (calle y número), indicála en el campo "direccion". Si contiene un piso o departamento, indicálo en el campo "pisoDepto". Si contiene un código postal o localidad, indicálo en el campo "codigoPostal". Respondé solo con un JSON válido con estos tres campos, usando string vacío cuando no se encuentre el dato.

Mensaje: "${textoMensaje}"

JSON:`;

        const rawText = (await generarTextoCola(promptExtract) || '').trim().replace(/```json/g, '').replace(/```/g, '').trim();
        const startIdx = rawText.indexOf('{');
        const endIdx = rawText.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          const jsonStr = rawText.substring(startIdx, endIdx + 1);
          const data = JSON.parse(jsonStr);
          const cambiosContacto = {};
          if (data && data.pisoDepto && typeof data.pisoDepto === 'string') {
            await Cliente.findByIdAndUpdate(contacto._id, { $set: { pisoDepto: data.pisoDepto } });
            contacto.pisoDepto = data.pisoDepto;
            cambiosContacto.pisoDepto = data.pisoDepto;
          }
          if (data && data.codigoPostal && typeof data.codigoPostal === 'string') {
            await Cliente.findByIdAndUpdate(contacto._id, { $set: { codigoPostal: data.codigoPostal } });
            contacto.codigoPostal = data.codigoPostal;
            cambiosContacto.codigoPostal = data.codigoPostal;
          }
          if (Object.keys(cambiosContacto).length > 0) {
            const ioContacto = req.app.get('io');
            if (ioContacto) {
              ioContacto.to(empresa._id.toString()).emit('contacto-actualizado', {
                contactoId: contacto._id,
                datos: cambiosContacto
              });
            }
          }
        }
      } else {
        // Sin API key de Gemini, no se extrae información automáticamente
      }
    } catch (error) {
      console.error('⚠️ Error al extraer datos del cliente con IA:', error);
    }

    console.log(`⏱️ Tiempo extracción IA: ${(performance.now() - t0).toFixed(0)} ms`);

    // Habilitación del bot para esta conversación (ya definida antes)
    // ===== Detectar intención de hablar con un humano =====
    if (botHabilitado && detectarIntencionHumano(textoMensaje)) {
      console.log(`🙋 Cliente pidió ser atendido por un humano: ${telefonoCliente}`);

      // Desactivar bot para esta conversación (Human Handoff)
      conversacion.botActivo = false;
      await conversacion.save();
      await Conversacion.findByIdAndUpdate(conversacion._id, {
        $set: { botActivo: false }
      });

      // Avisar al cliente
      const textoDerivacion = 'Te paso con un operador humano. Un momento por favor 🙌';
      const phoneNumberId = metadata?.phone_number_id || whatsappPhoneId;
      const accessToken = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;

      if (accessToken && phoneNumberId) {
        try {
          const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
          const payload = {
            messaging_product: 'whatsapp',
            to: telefonoCliente,
            type: 'text',
            text: { body: textoDerivacion }
          };
          const resp = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });
          const bodyResp = await resp.json().catch(() => ({}));
          if (resp.ok) {
            console.log('✅ Mensaje de derivación enviado a WhatsApp');
          } else {
            console.error('❌ Error al enviar derivación:', resp.status, bodyResp);
          }
        } catch (error) {
          console.error('❌ Error de red al enviar derivación:', error);
        }
      }

      // Guardar mensaje del sistema en BD
      const mensajeHandoffDb = await Mensaje.create({
        conversacionId: conversacion._id,
        remitente: 'ia',
        contenido: textoDerivacion
      });
      await Conversacion.findByIdAndUpdate(conversacion._id, {
        $set: { ultimoMensaje: textoDerivacion }
      });

      // Emitir eventos para actualizar el panel en tiempo real
      const ioHandoff = req.app.get('io');
      if (ioHandoff) {
        ioHandoff.to(empresa._id.toString()).emit('mensaje-nuevo', {
          conversacionId: conversacion._id,
          mensaje: {
            _id: mensajeHandoffDb._id,
            remitente: 'ia',
            contenido: textoDerivacion,
            estado: 'enviado',
            fecha: new Date()
          },
          conversacion: {
            _id: conversacion._id,
            ultimoMensaje: textoDerivacion,
            updatedAt: new Date()
          }
        });
        ioHandoff.to(empresa._id.toString()).emit('bot-actualizado', {
          conversacionId: conversacion._id,
          botActivo: false
        });
      }

      console.log(`✅ [HANDOFF] Conversación ${conversacion._id} derivada a humano.`);
      return;
    }

    // ===== Generar respuesta con Gemini (solo si el bot está activo) =====
    let respuestaIA = null;

    if (botHabilitado && process.env.GEMINI_API_KEY) {
      try {
        const menuTexto = productos.length
          ? productos.map(p => {
              const partes = [`- ${p.nombre} ($${p.precio})`];
              if (p.dimensions?.displayString) partes.push(`Medidas: ${p.dimensions.displayString}`);
              if (Array.isArray(p.extras) && p.extras.length > 0) partes.push(`Incluye: ${p.extras.join(', ')}`);
              if (p.envio?.tipo === 'gratis') partes.push('Envío gratis');
              else if (p.envio?.tipo === 'fijo') partes.push(`Envío $${Number(p.envio.costo || 0).toFixed(2)}`);
              else partes.push('Envío a consultar');
              if (p.stock === 0) partes.push('AGOTADO - NO DISPONIBLE');
              else if (p.stock > 0) partes.push(`Stock: ${p.stock}`);
              const tieneFotos = (Array.isArray(p.fotos) && p.fotos.length > 0) || p.fotoUrl;
              partes.push(tieneFotos ? 'Con foto' : 'Sin foto');
              return partes.join(' | ');
            }).join('\n')
          : 'No hay productos cargados en el catálogo.';

        // Obtener últimos mensajes para dar contexto a la IA
        const historialMensajes = await Mensaje.find({ conversacionId: conversacion._id })
          .sort({ createdAt: -1 })
          .limit(12)
          .lean();
        const historialTexto = historialMensajes.reverse().map(m => {
          const autor = m.remitente === 'cliente' ? 'Cliente' : (m.remitente === 'ia' || m.remitente === 'bot' ? 'Bot' : 'Sistema');
          return `${autor}: ${m.contenido}`;
        }).join('\n');

        const carritoActual = (conversacion.carrito || []).map(item =>
          `- ${item.nombre} (cantidad: ${item.cantidad || 1}, precio unitario: $${item.precioUnitario || 0})`
        ).join('\n') || 'Vacío';
        const carritoTotal = conversacion.carritoTotal || 0;

        const estadoLocal = localAbierto
          ? 'ABIERTO'
          : 'CERRADO en este momento';

        const instruccionesUsuario = (empresa.promptIA && empresa.promptIA.trim() !== '')
          ? empresa.promptIA.trim()
          : PROMPT_IA_DEFAULT_REGLAS;

        // Los horarios viven SOLO en la Empresa. Ya no hay fallback al Usuario.
        const horariosTexto = formatearHorarios(empresa.horariosEstructurados || []);

        const atajosCombinados = combinarAtajos(usuario, empresa);
        const atajosTexto = atajosCombinados.map(a => `- ${a.comando} → ${a.respuesta}`).join('\n');

        let prompt = PROMPT_IA_CONTEXTO
          .replace('{instrucciones}', instruccionesUsuario)
          .replaceAll('{nombreLocal}', empresa.nombre)
          .replaceAll('{estadoLocal}', estadoLocal)
          .replaceAll('{menuTexto}', menuTexto)
          .replaceAll('{carritoActual}', carritoActual)
          .replaceAll('{carritoTotal}', String(carritoTotal))
          .replaceAll('{historialTexto}', historialTexto)
          .replaceAll('{mensajeCliente}', textoMensaje)
          .replaceAll('{horarios}', horariosTexto)
          .replaceAll('{atajos}', atajosTexto);

        prompt += avisoAntiFalsoConfirm;

        respuestaIA = await generarTextoCola(prompt);
      } catch (err) {
        console.error("❌ Error al generar respuesta con Gemini:", err);
      }
    }

    // Parsear salida estructurada del modelo (texto o imagen)
    let tipoRespuestaIA = 'texto';
    let productoFotoIA = null;
    let urlArchivoIA = '';
    let derivarIA = false;
    if (respuestaIA) {
      const raw = String(respuestaIA).trim().replace(/```json/gi, '').replace(/```/g, '').trim();
      if (raw.startsWith('{') && raw.endsWith('}')) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            if (parsed.tipo === 'imagen' && parsed.producto) {
              tipoRespuestaIA = 'imagen';
              productoFotoIA = String(parsed.producto).trim();
              respuestaIA = (typeof parsed.caption === 'string') ? parsed.caption.trim() : '';
            } else if (parsed.tipo === 'texto' && typeof parsed.respuesta === 'string') {
              respuestaIA = parsed.respuesta.trim();
              if (parsed.derivar === true) derivarIA = true;
            }
          }
        } catch (_) {
          // No era JSON: se mantiene el texto tal cual
        }
      }
    }

    // ===== Pre-chequeo de stock ANTES de enviar la respuesta =====
    // Si el carrito tiene items y a alguno le falta stock, corregimos el mensaje
    // y bloqueamos el guardado automático del pedido.
    let stockInsuficiente = false;
    if (botHabilitado && Array.isArray(conversacion.carrito) && conversacion.carrito.length > 0) {
      const chequeo = await verificarStockCarrito(conversacion.carrito, empresa._id);
      if (!chequeo.ok) {
        stockInsuficiente = true;
        const nombres = chequeo.faltantes.map(f => f.nombre).join(', ');
        respuestaIA = `Uy, justo se agotó: ${nombres}. ¿Querés elegir otra cosa?`;
        tipoRespuestaIA = 'texto';
        productoFotoIA = null;
        urlArchivoIA = '';
      }
    }

    // ===== Derivación a humano pedida por la IA (no supo responder) =====
    // El bot sigue activo para no dejar al cliente colgado, pero el chat
    // queda marcado como "requiere atención" en el panel del operador.
    if (botHabilitado && !stockInsuficiente && derivarIA) {
      await Conversacion.findByIdAndUpdate(conversacion._id, {
        $set: { requiereAtencion: true }
      });
      conversacion.requiereAtencion = true;
      const ioAtencion = req.app.get('io');
      if (ioAtencion) {
        ioAtencion.to(empresa._id.toString()).emit('atencion-actualizada', {
          conversacionId: conversacion._id,
          requiereAtencion: true
        });
      }
    }

    if (respuestaIA || tipoRespuestaIA === 'imagen') {
      // Enviar la respuesta al cliente por WhatsApp
      const phoneNumberId = metadata?.phone_number_id || whatsappPhoneId;
      const accessToken = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;
      let msgIdIA = '';

      if (accessToken) {
        try {
          if (tipoRespuestaIA === 'imagen' && productoFotoIA) {
            // Buscar el producto por nombre exacto (o por coincidencia parcial)
            const nombreBuscado = productoFotoIA.toLowerCase();
            const productoFoto = productos.find(p => String(p.nombre || '').toLowerCase() === nombreBuscado)
              || productos.find(p => String(p.nombre || '').toLowerCase().includes(nombreBuscado));

            const fotosProducto = productoFoto
              ? ((Array.isArray(productoFoto.fotos) && productoFoto.fotos.length > 0)
                  ? productoFoto.fotos
                  : (productoFoto.fotoUrl ? [productoFoto.fotoUrl] : []))
              : [];

            if (productoFoto && fotosProducto.length > 0) {
              let primeraOk = false;
              for (let i = 0; i < fotosProducto.length; i++) {
                const caption = (i === 0) ? respuestaIA : '';
                const resultadoImg = await enviarImagenMeta(empresa, telefonoCliente, fotosProducto[i], caption);
                if (resultadoImg.ok) {
                  if (i === 0) {
                    msgIdIA = resultadoImg.msgId;
                    urlArchivoIA = fotosProducto[0];
                    primeraOk = true;
                  }
                } else {
                  console.error(`❌ Error al enviar imagen ${i + 1}:`, resultadoImg.error);
                }
              }
              if (primeraOk) {
                console.log(`✅ ${fotosProducto.length} foto(s) del producto "${productoFoto.nombre}" enviada(s) a WhatsApp`);
              } else {
                // Fallback: mandar el caption como texto (si hay)
                if (respuestaIA) {
                  const resultadoTexto = await enviarMensajeMeta(empresa, telefonoCliente, respuestaIA);
                  if (resultadoTexto.ok) msgIdIA = resultadoTexto.msgId;
                }
                tipoRespuestaIA = 'texto';
              }
            } else {
              // El producto no tiene foto o no se encontró: fallback a texto
              const textoFallback = respuestaIA || 'No tengo esa foto disponible en este momento.';
              const resultadoTexto = await enviarMensajeMeta(empresa, telefonoCliente, textoFallback);
              if (resultadoTexto.ok) msgIdIA = resultadoTexto.msgId;
              respuestaIA = textoFallback;
              tipoRespuestaIA = 'texto';
            }
          } else {
            const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
            const respuestaNormalizada = (respuestaIA || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const payload = {
              messaging_product: 'whatsapp',
              to: telefonoCliente,
              type: 'text',
              text: { body: respuestaNormalizada }
            };

            console.log(`📤 Enviando respuesta IA al teléfono ${telefonoCliente} usando phoneNumberId ${phoneNumberId}`);

            const resp = await fetch(url, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(payload)
            });

            const respBody = await resp.json().catch(() => ({}));
            msgIdIA = respBody?.messages?.[0]?.id || '';
            if (!resp.ok) {
              console.error('❌ Error al enviar respuesta IA a WhatsApp:', resp.status, respBody);
            } else {
              console.log('✅ Respuesta IA enviada a WhatsApp correctamente');
            }
          }
        } catch (error) {
          console.error('❌ Error de red al enviar respuesta IA a WhatsApp:', error);
        }
      } else {
        console.log('⚠️ Sin tokenMeta ni WHATSAPP_ACCESS_TOKEN, la respuesta IA no se envió al cliente');
      }

      // Guardar mensaje en la base de datos
      const contenidoIA = (tipoRespuestaIA === 'imagen')
        ? (respuestaIA || '📎 [Imagen]')
        : respuestaIA;
      const mensajeIADb = await Mensaje.create({
        conversacionId: conversacion._id,
        remitente: 'ia',
        contenido: contenidoIA,
        tipo: tipoRespuestaIA === 'imagen' ? 'imagen' : 'texto',
        urlArchivo: tipoRespuestaIA === 'imagen' ? urlArchivoIA : '',
        whatsappMsgId: msgIdIA
      });

      await Conversacion.findByIdAndUpdate(conversacion._id, { ultimoMensaje: contenidoIA });

      // ===== Guardar pedido automáticamente si ya están todos los datos =====
      try {
        const carritoActual = conversacion.carrito || [];
        const ultimosMsgsDir = await Mensaje.find({ conversacionId: conversacion._id })
          .sort({ createdAt: -1 })
          .limit(20)
          .lean();
        const textoReciente = ultimosMsgsDir
          .filter(m => m.remitente === 'cliente')
          .map(m => m.contenido)
          .join(' ');

        let direccionEntrega = '';
        if (process.env.GEMINI_API_KEY && textoReciente.trim()) {
          try {
            const promptDir = `Analizá el siguiente texto de un cliente y extraé SOLO su dirección de entrega completa (calle, número, piso, depto, localidad, etc.). Si no hay dirección, respondé exactamente "SIN DIRECCION". Texto: "${textoReciente}". Dirección:`;
            const respDir = await generarTextoCola(promptDir);
            const dirLimpia = (respDir || '').trim().replace(/^"|"$/g, '');
            if (dirLimpia && dirLimpia !== 'SIN DIRECCION') {
              direccionEntrega = dirLimpia;
            }
          } catch (e) {
            console.warn('⚠️ No se pudo extraer dirección con IA:', e.message);
          }
        }
        if (!direccionEntrega) {
          const match = textoReciente.match(/([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ ]+ \d+)/);
          if (match) direccionEntrega = match[1].trim();
        }
        const tieneDireccionCompleta = direccionEntrega.trim() !== '';
        if (!stockInsuficiente && carritoActual.length > 0 && tieneDireccionCompleta) {
          const totalCarrito = (conversacion.carritoTotal || 0) ||
            carritoActual.reduce((sum, it) => sum + (it.cantidad * it.precioUnitario), 0);

          // Detectar método de pago mencionado en los últimos mensajes
          let metodoPago = 'Pendiente';
          try {
            const ultimosMsgs = await Mensaje.find({ conversacionId: conversacion._id })
              .sort({ createdAt: -1 })
              .limit(10)
              .lean();
            for (const msg of ultimosMsgs) {
              const det = detectarMetodoPago(msg.contenido);
              if (det) {
                metodoPago = det;
                break;
              }
            }
          } catch (e) {
            console.warn('⚠️ No se pudo detectar método de pago:', e);
          }

          await guardarPedidoConfirmado({
            localId: usuario._id,
            empresaId: empresa._id,
            contactoId: contacto._id,
            conversacionId: conversacion._id,
            cliente: contacto.nombre || nombre,
            telefonoCliente: contacto.telefono,
            items: carritoActual,
            total: totalCarrito,
            metodoPago,
            estado: 'confirmado',
            direccionEntrega,
            notas: '',
            fechaTurno: '',
            fecha: new Date(),
            latitud: conversacion.latitud || null,
            longitud: conversacion.longitud || null
          });

          // Limpiar carrito y coordenadas después de confirmar
          await Conversacion.findByIdAndUpdate(conversacion._id, {
            $set: { carrito: [], carritoTotal: 0, latitud: null, longitud: null }
          });
          conversacion.carrito = [];
          conversacion.carritoTotal = 0;
          conversacion.latitud = null;
          conversacion.longitud = null;
          const ioCarrito2 = req.app.get('io');
          if (ioCarrito2) {
            ioCarrito2.to(empresa._id.toString()).emit('carrito-actualizado', {
              conversacionId: conversacion._id,
              carrito: [],
              total: 0
            });
            ioCarrito2.to(empresa._id.toString()).emit('pedido-actualizado', {
              conversacionId: conversacion._id
            });
          }
          console.log(`✅ [PEDIDO] Pedido guardado automáticamente para el cliente ${contacto.telefono}`);
        } else if (carritoActual.length > 0) {
          console.log('ℹ️ [PEDIDO] Hay items pero falta dirección del cliente');
        }
      } catch (error) {
        console.error('❌ Error al guardar pedido en BD:', error);
      }

      const io = req.app.get('io');
      if (io) {
        io.to(empresa._id.toString()).emit('mensaje-nuevo', {
          conversacionId: conversacion._id,
          mensaje: {
            _id: mensajeIADb._id,
            remitente: 'ia',
            contenido: contenidoIA,
            tipo: tipoRespuestaIA === 'imagen' ? 'imagen' : 'texto',
            urlArchivo: tipoRespuestaIA === 'imagen' ? urlArchivoIA : '',
            estado: 'enviado',
            fecha: new Date()
          },
          conversacion: {
            _id: conversacion._id,
            ultimoMensaje: contenidoIA,
            updatedAt: new Date()
          }
        });
      }
    }

    console.log("✅ [10] ¡ÉXITO! Mensaje guardado perfectamente en MongoDB.");
    return;
  } catch (error) {
    logger.error('🔥 [ERROR CATASTRÓFICO] Explotó el código en el Try/Catch:', error);
    // Si no se envió respuesta aún, responder 500 para que Meta reintente el mensaje.
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Error interno al procesar el mensaje' });
    }
    return;
  }
};

// ===== Enviar multimedia desde el dashboard =====
const enviarMensajeMedia = async (req, res) => {
  try {
    const { conversacionId } = req.body || {};
    const archivo = req.file;

    if (!conversacionId) {
      return res.status(400).json({ error: 'Falta conversacionId' });
    }
    if (!archivo) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }

    const conversacion = await Conversacion.findById(conversacionId)
      .populate('empresaId')
      .populate('contactoId');
    if (!conversacion) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    const empresaId = conversacion.empresaId?._id || conversacion.empresaId;
    const empresaIdStr = empresaId ? empresaId.toString() : '';
    const empresasPermitidas = req.empresas && req.empresas.length > 0 ? req.empresas : [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === empresaIdStr);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    const empresa = conversacion.empresaId;
    const contacto = conversacion.contactoId;

    const telefonoCliente = contacto?.telefono;
    const whatsappPhoneId = empresa?.whatsappPhoneId;
    const accessToken = empresa?.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;

    if (!whatsappPhoneId || !telefonoCliente || !accessToken) {
      return res.status(500).json({ error: 'Faltan datos de empresa, contacto o token para enviar el mensaje' });
    }

    const mimeType = archivo.mimetype || '';
    const ext = path.extname(archivo.originalname || '').toLowerCase();
    const esImagen = mimeType.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
    const esAudio = mimeType.startsWith('audio/') || ['.mp3', '.ogg', '.opus', '.m4a', '.amr'].includes(ext);
    const esVideo = mimeType.startsWith('video/') || ['.mp4', '.mov', '.avi', '.mkv'].includes(ext);
    let tipo = 'documento';
    if (esImagen) tipo = 'imagen';
    else if (esAudio) tipo = 'audio';
    else if (esVideo) tipo = 'video';
    // Tipo para la API de WhatsApp (valores del enum de Meta)
    const tipoApi = tipo === 'imagen' ? 'image' : tipo === 'audio' ? 'audio' : tipo === 'video' ? 'video' : 'document';

    // Subir archivo a WhatsApp (Media Upload API)
    const mediaForm = new FormData();
    mediaForm.append('messaging_product', 'whatsapp');
    mediaForm.append('type', mimeType);
    const fileBuffer = fs.readFileSync(archivo.path);
    mediaForm.append('file', new Blob([fileBuffer], { type: mimeType }), archivo.originalname || 'archivo');

    let mediaId = '';
    try {
      const urlSubida = `https://graph.facebook.com/v19.0/${whatsappPhoneId}/media`;
      const respSubida = await fetch(urlSubida, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        body: mediaForm
      });
      const dataSubida = await respSubida.json();
      if (!respSubida.ok) {
        console.error('❌ Error al subir media a WhatsApp:', dataSubida);
        return res.status(502).json({ error: 'No se pudo subir el archivo a WhatsApp', detalle: dataSubida });
      }
      mediaId = dataSubida.id;
    } catch (error) {
      console.error('❌ Error de red al subir media:', error);
      return res.status(502).json({ error: 'No se pudo conectar con WhatsApp' });
    }

    // Enviar mensaje multimedia al cliente
    const urlEnvio = `https://graph.facebook.com/v19.0/${whatsappPhoneId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: telefonoCliente,
      type: tipoApi
    };
    if (tipo === 'imagen') {
      payload.image = { id: mediaId, caption: '' };
    } else if (tipo === 'audio') {
      payload.audio = { id: mediaId };
    } else if (tipo === 'video') {
      payload.video = { id: mediaId };
    } else {
      payload.document = { id: mediaId, filename: archivo.originalname || 'archivo' };
    }

    let respuestaWhatsApp = null;
    let enviadoOK = false;
    try {
      const resp = await fetch(urlEnvio, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      respuestaWhatsApp = await resp.json();
      if (resp.ok) {
        enviadoOK = true;
      } else {
        console.error('Error al enviar multimedia a WhatsApp:', respuestaWhatsApp);
      }
    } catch (error) {
      console.error('Error de red enviando multimedia a la Graph API:', error);
      return res.status(502).json({ error: 'No se pudo comunicar con WhatsApp' });
    }

    if (!enviadoOK) {
      return res.status(502).json({ error: 'El envío del mensaje multimedia falló', detalle: respuestaWhatsApp });
    }

    // Guardar mensaje en la base de datos
    const urlArchivoLocal = `/uploads/${empresaIdStr}/${archivo.filename}`;
    const nuevoMensaje = await Mensaje.create({
      conversacionId: conversacion._id,
      remitente: 'empresa',
      contenido: esImagen ? '📎 [Imagen]' : (esAudio ? '📎 [Audio]' : (esVideo ? '📎 [Video]' : `📎 ${archivo.originalname || 'Documento'}`)),
      tipo,
      urlArchivo: urlArchivoLocal,
      whatsappMsgId: respuestaWhatsApp?.messages?.[0]?.id || ''
    });

    await Conversacion.findByIdAndUpdate(conversacion._id, {
      ultimoMensaje: nuevoMensaje.contenido,
      estado: 'Abierto'
    });

    const io = req.app.get('io');
    if (io) {
      io.to(empresaIdStr).emit('mensaje-nuevo', {
        conversacionId: conversacion._id,
        mensaje: {
          _id: nuevoMensaje._id,
          remitente: 'empresa',
          contenido: nuevoMensaje.contenido,
          tipo: nuevoMensaje.tipo,
          urlArchivo: nuevoMensaje.urlArchivo,
          fecha: new Date()
        },
        conversacion: {
          _id: conversacion._id,
          ultimoMensaje: nuevoMensaje.contenido,
          updatedAt: new Date()
        }
      });
    }

    return res.json({
      ok: true,
      mensaje: {
        _id: nuevoMensaje._id,
        remitente: nuevoMensaje.remitente,
        contenido: nuevoMensaje.contenido,
        tipo: nuevoMensaje.tipo,
        urlArchivo: nuevoMensaje.urlArchivo,
        fecha: nuevoMensaje.createdAt
      }
    });
  } catch (error) {
    console.error('Error al enviar multimedia:', error);
    return res.status(500).json({ error: 'Error interno al enviar multimedia' });
  }
};

// ===== Enviar mensaje desde el dashboard =====

async function enviarMensajeMeta(empresa, telefonoCliente, mensaje) {
  const whatsappPhoneId = empresa?.whatsappPhoneId;
  const accessToken = empresa?.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;

  if (!whatsappPhoneId || !telefonoCliente || !accessToken) {
    return { ok: false, error: 'Faltan datos de empresa, contacto o token para enviar el mensaje' };
  }

  try {
    const url = `https://graph.facebook.com/v19.0/${whatsappPhoneId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: telefonoCliente,
      type: 'text',
      text: { body: mensaje }
    };

    const resp = await breakerMeta.execute(() => fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }));

    const data = await resp.json();

    if (!resp.ok) {
      return { ok: false, error: data?.error?.message || `HTTP ${resp.status}` };
    }

    return { ok: true, data, msgId: data?.messages?.[0]?.id || '' };
  } catch (error) {
    return { ok: false, error: error.message || 'Error de red al comunicarse con WhatsApp' };
  }
}

// Sube una imagen local a WhatsApp y la envía al cliente.
// `rutaRelativa` es la ruta guardada en Producto.fotoUrl (ej: /uploads/<empresaId>/foto.jpg).
async function enviarImagenMeta(empresa, telefonoCliente, rutaRelativa, caption) {
  const whatsappPhoneId = empresa?.whatsappPhoneId;
  const accessToken = empresa?.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;

  if (!whatsappPhoneId || !telefonoCliente || !accessToken) {
    return { ok: false, error: 'Faltan datos de empresa, contacto o token para enviar la imagen' };
  }
  if (!rutaRelativa) {
    return { ok: false, error: 'Falta la ruta de la imagen' };
  }

  const relativa = String(rutaRelativa).replace(/^\//, '');
  const rutaCompleta = path.join(__dirname, '..', relativa);

  if (!fs.existsSync(rutaCompleta)) {
    return { ok: false, error: 'Archivo de imagen no encontrado en el servidor' };
  }

  const ext = path.extname(rutaCompleta).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
  };
  const mimeType = mimeMap[ext] || 'image/jpeg';

  try {
    const fileBuffer = fs.readFileSync(rutaCompleta);

    const mediaForm = new FormData();
    mediaForm.append('messaging_product', 'whatsapp');
    mediaForm.append('type', mimeType);
    mediaForm.append('file', new Blob([fileBuffer], { type: mimeType }), path.basename(rutaCompleta));

    const respSubida = await breakerMeta.execute(() => fetch(
      `https://graph.facebook.com/v19.0/${whatsappPhoneId}/media`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        body: mediaForm
      }
    ));
    const dataSubida = await respSubida.json().catch(() => ({}));
    if (!respSubida.ok || !dataSubida?.id) {
      return { ok: false, error: dataSubida?.error?.message || `HTTP ${respSubida.status} al subir la imagen` };
    }

    const mediaId = dataSubida.id;

    const respEnvio = await breakerMeta.execute(() => fetch(
      `https://graph.facebook.com/v19.0/${whatsappPhoneId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: telefonoCliente,
          type: 'image',
          image: { id: mediaId, caption: caption || '' }
        })
      }
    ));
    const dataEnvio = await respEnvio.json().catch(() => ({}));
    if (!respEnvio.ok) {
      return { ok: false, error: dataEnvio?.error?.message || `HTTP ${respEnvio.status} al enviar la imagen` };
    }

    return { ok: true, msgId: dataEnvio?.messages?.[0]?.id || '' };
  } catch (error) {
    return { ok: false, error: error.message || 'Error de red al enviar la imagen' };
  }
}

const enviarMensaje = async (req, res) => {
  try {
    logger.info('Enviar mensaje desde dashboard:', { conversacionId: req.body?.conversacionId });
    const { conversacionId, mensaje: mensajeBruto } = req.body || {};
    const mensajeLimpio = (mensajeBruto || '')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
    const mensaje = mensajeLimpio;
    if (!conversacionId || !mensaje || typeof mensaje !== 'string' || mensaje.length === 0) {
      return res.status(400).json({ error: 'Faltan datos: conversacionId y mensaje son requeridos' });
    }
    if (mensaje.length > 4000) {
      return res.status(400).json({ error: 'El mensaje no puede superar los 4000 caracteres' });
    }

    const conversacion = await Conversacion.findById(conversacionId)
      .populate('empresaId')
      .populate('contactoId');
    if (!conversacion) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    const empresaId = conversacion.empresaId?._id || conversacion.empresaId;
    const empresaIdStr = empresaId ? empresaId.toString() : '';
    const empresasPermitidas = req.empresas && req.empresas.length > 0 ? req.empresas : [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === empresaIdStr);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    const empresa = conversacion.empresaId;
    const contacto = conversacion.contactoId;

    const telefonoCliente = contacto?.telefono;
    const whatsappPhoneId = empresa?.whatsappPhoneId;
    const accessToken = empresa?.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;

    if (!whatsappPhoneId || !telefonoCliente) {
      return res.status(500).json({ error: 'Faltan datos de empresa o contacto para enviar el mensaje' });
    }

    const ventana = await verificarVentana(conversacion._id);
    if (!ventana) {
      return res.status(200).json({
        ok: false,
        ventanaCerrada: true,
        error: 'La ventana de 24h cerró. Usá una plantilla aprobada.'
      });
    }

    // ===== Control de monedero: si está bloqueado, no se pueden iniciar conversaciones nuevas =====
    try {
      const usuarioMonederoEnvio = await Usuario.findById(empresa.usuarioAppId).lean();
      if (usuarioMonederoEnvio?.monederoBloqueado) {
        const ultimoMensajeConv = await Mensaje.findOne({ conversacionId: conversacion._id })
          .sort({ createdAt: -1 })
          .lean();
        const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const esRespuestaGratuita = ultimoMensajeConv &&
          ultimoMensajeConv.remitente === 'cliente' &&
          new Date(ultimoMensajeConv.createdAt) > hace24h;
        if (!esRespuestaGratuita) {
          return res.status(403).json({ error: 'Monedero bloqueado: no podés iniciar conversaciones nuevas. Cargá saldo para desbloquear.' });
        }
      }
    } catch (errorMon) {
      console.error('Error al verificar monedero en envío:', errorMon);
    }
    // ====================================================================

    const resultado = await enviarMensajeMeta(empresa, telefonoCliente, mensaje);
    const enviado = resultado.ok;
    const respuestaWhatsApp = resultado.ok ? resultado.data : null;

    if (!enviado) {
      const mensajeFallido = await Mensaje.create({
        conversacionId: conversacion._id,
        remitente: 'empresa',
        contenido: mensaje,
        estado: 'fallido',
        errorDetalle: resultado.error || 'Error desconocido de Meta'
      });

      await Conversacion.findByIdAndUpdate(conversacion._id, {
        ultimoMensaje: mensaje,
        estado: 'Abierto'
      });

      const io = req.app.get('io');
      if (io) {
        io.to(empresaIdStr).emit('mensaje-nuevo', {
          conversacionId: conversacion._id,
          mensaje: {
            _id: mensajeFallido._id,
            remitente: 'empresa',
            contenido: mensaje,
            estado: 'fallido',
            errorDetalle: resultado.error || 'Error desconocido de Meta',
            fecha: new Date()
          },
          conversacion: {
            _id: conversacion._id,
            ultimoMensaje: mensaje,
            updatedAt: new Date()
          }
        });
      }

      return res.status(200).json({
        ok: true,
        fallido: true,
        error: 'No se pudo enviar el mensaje',
        mensaje: {
          _id: mensajeFallido._id,
          remitente: 'empresa',
          contenido: mensaje,
          estado: 'fallido',
          errorDetalle: 'Error interno',
          fecha: mensajeFallido.createdAt
        }
      });
    }

    // Si Meta confirma que esta conversación fue iniciada por el negocio, sumar al contador
    if (enviado && respuestaWhatsApp?.billing?.conversation_type === 'business_initiated') {
      await incrementarContadorConversaciones(conversacion.empresaId, conversacion._id);
      const empresaActual = await Empresa.findById(conversacion.empresaId).lean();
      const usados = empresaActual?.conversacionesUsadas24h || 0;
      const maximo = empresaActual?.limiteConversaciones24h || 250;
      if (usados >= maximo) {
        const alertaIo = req.app.get('io');
        if (alertaIo) {
          alertaIo.to(empresaIdStr).emit('limite-conversaciones-alcanzado', {
            usados,
            maximo
          });
        }
      }

    }

    const nuevoMensaje = await Mensaje.create({
      conversacionId: conversacion._id,
      remitente: 'empresa',
      contenido: mensaje,
      whatsappMsgId: respuestaWhatsApp?.messages?.[0]?.id || ''
    });

    await Conversacion.findByIdAndUpdate(conversacion._id, {
      $set: { ultimoMensaje: mensaje, estado: 'Abierto', requiereAtencion: false }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(empresaIdStr).emit('atencion-actualizada', {
        conversacionId: conversacion._id,
        requiereAtencion: false
      });
      io.to(empresaIdStr).emit('mensaje-nuevo', {
        conversacionId: conversacion._id,
        mensaje: {
          _id: nuevoMensaje._id,
          remitente: 'empresa',
          contenido: mensaje,
          estado: 'enviado',
          fecha: new Date()
        },
        conversacion: {
          _id: conversacion._id,
          ultimoMensaje: mensaje,
          updatedAt: new Date()
        }
      });
    }

    return res.json({
      ok: true,
      mensaje: {
        _id: nuevoMensaje._id,
        remitente: nuevoMensaje.remitente,
        contenido: nuevoMensaje.contenido,
        fecha: nuevoMensaje.createdAt
      }
    });
  } catch (error) {
    logger.error('Error al enviar mensaje:', error);
    return res.status(500).json({ error: 'Error interno al enviar mensaje' });
  }
};

// ===== Actualizar botActivo de la empresa =====
const actualizarBotActivo = async (req, res) => {
  try {
    const { botActivo } = req.body || {};
    if (typeof botActivo !== 'boolean') {
      return res.status(400).json({ error: 'botActivo debe ser un booleano' });
    }

    const idsEmpresas = (req.empresas && req.empresas.length > 0)
      ? req.empresas
      : (req.parrillaId || req.empresaId ? [req.parrillaId || req.empresaId] : []);
    if (idsEmpresas.length === 0) {
      return res.status(400).json({ error: 'No se identificó la empresa' });
    }

    const resultado = await Empresa.updateMany(
      { _id: { $in: idsEmpresas } },
      { $set: { botActivo } }
    );

    if (resultado.matchedCount === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    await Conversacion.updateMany(
      { empresaId: { $in: idsEmpresas } },
      { $set: { botActivo } }
    );

    await registrarAuditoria(req, idsEmpresas[0], 'cambio_bot_global', `Se actualizó el estado del bot a ${botActivo ? 'activo' : 'inactivo'}`, { botActivo, empresasAfectadas: idsEmpresas.length });

    return res.json({ ok: true, botActivo });
  } catch (error) {
    console.error('Error al actualizar botActivo:', error);
    return res.status(500).json({ error: 'Error interno al actualizar botActivo' });
  }
};

const actualizarBotActivoConversacion = async (req, res) => {
  try {
    const { id } = req.params;
    const { botActivo } = req.body || {};
    if (typeof botActivo !== 'boolean') {
      return res.status(400).json({ error: 'botActivo debe ser un booleano' });
    }

    const conversacion = await Conversacion.findById(id);
    if (!conversacion) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    // Validación multi-tenant: la conversación debe pertenecer a una empresa del usuario
    const empresaIdStr = conversacion.empresaId.toString();
    const empresasPermitidas = req.empresas || [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === empresaIdStr);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    const actualizacionBot = { botActivo };
    // Si el operador reactiva el bot, la conversación ya no requiere atención
    if (botActivo) actualizacionBot.requiereAtencion = false;
    await Conversacion.findByIdAndUpdate(id, { $set: actualizacionBot });

    await registrarAuditoria(req, empresaIdStr, 'cambio_bot_conversacion', `Bot de la conversación ${id} ${botActivo ? 'activado' : 'desactivado'}`, { conversacionId: id, botActivo });

    // Emitir evento para actualizar el panel en tiempo real
    const io = req.app.get('io');
    if (io) {
      io.to(empresaIdStr).emit('bot-actualizado', { conversacionId: id, botActivo });
      if (botActivo) {
        io.to(empresaIdStr).emit('atencion-actualizada', { conversacionId: id, requiereAtencion: false });
      }
    }

    return res.json({ ok: true, botActivo });
  } catch (error) {
    console.error('Error al actualizar botActivo de conversación:', error);
    return res.status(500).json({ error: 'Error interno al actualizar botActivo' });
  }
};

async function subirFotoWhatsApp(empresa, fotoPath, fileSize, fileType) {
  const token = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) {
    throw new Error('No se encontró token de WhatsApp para la empresa');
  }

  // Paso A: Crear sesión de subida
  const urlSesion = `https://graph.facebook.com/v19.0/app/uploads?file_length=${fileSize}&file_type=${encodeURIComponent(fileType)}`;
  const respSesion = await fetch(urlSesion, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!respSesion.ok) {
    const body = await respSesion.text();
    throw new Error(`Error creando sesión de upload: ${respSesion.status} ${body}`);
  }
  const dataSesion = await respSesion.json();
  const sessionId = dataSesion.id;
  if (!sessionId) {
    throw new Error('No se obtuvo session id de la respuesta de upload');
  }

  // Paso B: Subir binario
  const fileBuffer = fs.readFileSync(fotoPath);
  const respBinario = await fetch(`https://graph.facebook.com/v19.0/${sessionId}`, {
    method: 'POST',
    headers: {
      'Authorization': `OAuth ${token}`,
      'Content-Type': 'application/octet-stream'
    },
    body: fileBuffer
  });
  if (!respBinario.ok) {
    const body = await respBinario.text();
    throw new Error(`Error subiendo binario a Meta: ${respBinario.status} ${body}`);
  }
  const dataBinario = await respBinario.json();
  const handle = dataBinario.h;
  if (!handle) {
    throw new Error('No se obtuvo profile_picture_handle de la respuesta de binario');
  }
  return handle;
}

async function actualizarPerfilWhatsApp(empresa, estado, profilePictureHandle) {
  const token = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = empresa.whatsappPhoneId;
  if (!token || !phoneId) {
    throw new Error('Faltan credenciales para actualizar WhatsApp');
  }

  const url = `https://graph.facebook.com/v19.0/${phoneId}/whatsapp_business_profile`;
  const payload = {
    messaging_product: 'whatsapp'
  };
  if (estado !== undefined && estado !== null && estado !== '') {
    payload.about = estado;
  }
  if (profilePictureHandle) {
    payload.profile_picture_handle = profilePictureHandle;
  }

  console.log('📤 [META] Actualizando perfil WhatsApp...');
  console.log('📤 [META] URL:', url);
  console.log('📤 [META] Payload:', JSON.stringify(payload, null, 2));

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const respText = await resp.text();
  console.log('📥 [META] Respuesta del POST:', resp.status, respText);

  if (!resp.ok) {
    throw new Error(`Error actualizando perfil de WhatsApp: ${resp.status} ${respText}`);
  }

  // Verificar con GET si el about se aplicó realmente
  try {
    const urlGet = `https://graph.facebook.com/v19.0/${phoneId}/whatsapp_business_profile?fields=about`;
    const respGet = await fetch(urlGet, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const getText = await respGet.text();
    console.log('📥 [META] Respuesta del GET de verificación:', respGet.status, getText);
  } catch (e) {
    console.warn('⚠️ [META] No se pudo verificar el perfil con GET:', e.message);
  }

  return JSON.parse(respText);
}

const actualizarConfig = async (req, res) => {
  try {
    const empresaId = req.empresaId || (req.empresas && req.empresas[0]);
    if (!empresaId) {
      return res.status(400).json({ error: 'No se pudo identificar la empresa' });
    }

    const updates = {};

    if (req.body.nombre && typeof req.body.nombre === 'string') {
      updates.nombre = req.body.nombre.trim();
    }
    if (req.body.estado && typeof req.body.estado === 'string') {
      updates.estado = req.body.estado.trim();
    }
    if (typeof req.body.bienvenida === 'string') {
      updates.bienvenida = req.body.bienvenida.trim();
    }

    if (Array.isArray(req.body.horariosEstructurados)) {
      const horarios = req.body.horariosEstructurados.map(h => ({
        dia: (h.dia || '').trim().toLowerCase(),
        apertura: (h.apertura || '').trim(),
        cierre: (h.cierre || '').trim()
      })).filter(h => h.dia && h.apertura && h.cierre);
      updates.horariosEstructurados = horarios;
    }

    // Prompt: puede aplicar solo a la línea actual o a todas las líneas del usuario
    if (typeof req.body.promptIA === 'string') {
      const promptIA = req.body.promptIA.trim();
      if (req.body.aplicarATodasPrompt === true) {
        const idsEmpresas = req.empresas && req.empresas.length ? req.empresas : [empresaId];
        await Empresa.updateMany(
          { _id: { $in: idsEmpresas }, usuarioAppId: req.usuario.id },
          { $set: { promptIA } }
        );
      } else {
        updates.promptIA = promptIA;
      }
    }

    // Atajos: puede venir como array (JSON) o como string JSON (FormData)
    let atajos = null;
    if (Array.isArray(req.body.atajos)) {
      atajos = req.body.atajos
        .map(a => ({
          comando: (a.comando || '').trim(),
          respuesta: String(a.respuesta || '').replace(/<br\s*\/?>/gi, '\n').trim()
        }))
        .filter(a => a.comando && a.respuesta);
    } else if (typeof req.body.atajos === 'string' && req.body.atajos.trim() !== '') {
      try {
        const parsed = JSON.parse(req.body.atajos);
        if (Array.isArray(parsed)) {
          atajos = parsed
            .map(a => ({
              comando: (a.comando || '').trim(),
              respuesta: String(a.respuesta || '').replace(/<br\s*\/?>/gi, '\n').trim()
            }))
            .filter(a => a.comando && a.respuesta);
        }
      } catch (e) {
        return res.status(400).json({ error: 'El formato de atajos es inválido' });
      }
    }

    if (req.body.aplicarATodasAtajos === true) {
      if (atajos) {
        const idsEmpresas = req.empresas && req.empresas.length ? req.empresas : [empresaId];
        await Empresa.updateMany(
          { _id: { $in: idsEmpresas }, usuarioAppId: req.usuario.id },
          { $set: { atajos } }
        );
      }
    } else if (atajos) {
      updates.atajos = atajos;
    }

    if (typeof req.body.procesarImagenes === 'boolean') {
      updates.procesarImagenes = req.body.procesarImagenes;
    }
    if (typeof req.body.procesarAudios === 'boolean') {
      updates.procesarAudios = req.body.procesarAudios;
    }

    if (req.body.fotoPosicion && typeof req.body.fotoPosicion === 'string') {
      updates.fotoPosicion = req.body.fotoPosicion.trim();
    }

    if (req.file) {
      updates.fotoPerfil = `/uploads/${String(empresaId)}/${req.file.filename}`;
    }

    const estadoNuevo = (typeof req.body.estado === 'string') ? req.body.estado.trim() : null;
    const empresa = await Empresa.findByIdAndUpdate(empresaId, { $set: updates }, { new: true });
    if (!empresa) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    let warning = '';
    try {
      let profileHandle = null;
      if (req.file) {
        profileHandle = await subirFotoWhatsApp(empresa, req.file.path, req.file.size, req.file.mimetype);
      }
      await actualizarPerfilWhatsApp(empresa, estadoNuevo, profileHandle);
    } catch (error) {
      console.error('Error al sincronizar con WhatsApp:', error);
      warning = 'Guardado localmente, pero falló la actualización en WhatsApp';
    }
    return res.json({ ok: true, empresa, warning: warning || undefined });
  } catch (error) {
    console.error('Error al actualizar config:', error);
    return res.status(500).json({ error: 'Error interno al actualizar config' });
  }
};

async function actualizarCostosManual(req, res) {
  try {
    const empresaId = req.empresaId || (req.empresas && req.empresas[0]);
    if (!empresaId) return res.status(400).json({ error: 'No se pudo identificar la empresa' });
    const empresa = await Empresa.findById(empresaId);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    const costo = await actualizarCostosEmpresa(empresa);
    const updated = await Empresa.findById(empresaId).lean();
    return res.json({
      ok: true,
      meta: {
        costoTotal: updated.metaCostoTotal || (costo || 0),
        ultimaActualizacion: updated.metaUltimaActualizacion || null
      }
    });
  } catch (error) {
    console.error('Error al actualizar costos manualmente:', error);
    return res.status(500).json({ error: 'Error interno al actualizar costos' });
  }
}

const obtenerConfig = async (req, res) => {
  try {
    const empresaId = req.empresaId || (req.empresas && req.empresas[0]);
    if (!empresaId) {
      return res.status(400).json({ error: 'No se pudo identificar la empresa' });
    }

    const empresa = await Empresa.findById(empresaId).lean();
    if (!empresa) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    console.log('[obtenerConfig] empresaId:', empresaId);
    console.log('[obtenerConfig] horarios de EMPRESA:', empresa.horariosEstructurados);
    console.log('[obtenerConfig] usuarioAppId:', empresa.usuarioAppId);

    // Los horarios viven SOLO en la Empresa. El Usuario ya no se consulta como fallback.
    let horarios = (empresa.horariosEstructurados || []).map(h => ({
      ...h,
      dia: (h.dia || '').toLowerCase()
    }));

    console.log('[obtenerConfig] horarios FINAL que se devuelven:', horarios);

    // El usuario se sigue cargando para combinar los atajos automáticos (dirección, pago)
    let usuario = null;
    if (empresa.usuarioAppId) {
      usuario = await Usuario.findById(empresa.usuarioAppId).lean();
    }

    const atajos = combinarAtajos(usuario, empresa);

    return res.json({
      ok: true,
      config: {
        nombre: empresa.nombre || '',
        promptIA: empresa.promptIA && empresa.promptIA.trim() !== ''
          ? empresa.promptIA
          : PROMPT_IA_DEFAULT_REGLAS,
        atajos,
        estado: empresa.estado || '',
        bienvenida: empresa.bienvenida || '',
        fotoPerfil: empresa.fotoPerfil || '',
        fotoPosicion: empresa.fotoPosicion || '50% 50%',
        horariosEstructurados: horarios,
        abierto: empresa.abierto !== false,
        procesarImagenes: empresa.procesarImagenes === true,
        procesarAudios: empresa.procesarAudios === true,
        meta: {
          costoTotal: empresa.metaCostoTotal || 0,
          ultimaActualizacion: empresa.metaUltimaActualizacion || null
        }
      }
    });
  } catch (error) {
    console.error('Error al obtener config:', error);
    return res.status(500).json({ error: 'Error interno al obtener config' });
  }
};

// ===== Actualizar datos manuales del cliente =====
const actualizarContacto = async (req, res) => {
  try {
    const { contactoId } = req.params;
    const { direccion, pisoDepto, codigoPostal, nombre } = req.body || {};

    // Validar tipos y longitudes
    if (direccion !== undefined && (typeof direccion !== 'string' || direccion.trim().length > 200)) {
      return res.status(400).json({ error: 'direccion debe ser un string de máximo 200 caracteres' });
    }
    if (pisoDepto !== undefined && (typeof pisoDepto !== 'string' || pisoDepto.trim().length > 100)) {
      return res.status(400).json({ error: 'pisoDepto debe ser un string de máximo 100 caracteres' });
    }
    if (codigoPostal !== undefined && (typeof codigoPostal !== 'string' || codigoPostal.trim().length > 100)) {
      return res.status(400).json({ error: 'codigoPostal debe ser un string de máximo 100 caracteres' });
    }
    if (nombre !== undefined && (typeof nombre !== 'string' || nombre.trim() === '' || nombre.trim().length > 100)) {
      return res.status(400).json({ error: 'nombre debe ser un string no vacío de máximo 100 caracteres' });
    }

    const updates = {};
    if (typeof direccion === 'string') updates.direccion = direccion.trim();
    if (typeof pisoDepto === 'string') updates.pisoDepto = pisoDepto.trim();
    if (typeof codigoPostal === 'string') updates.codigoPostal = codigoPostal.trim();
    if (typeof nombre === 'string' && nombre.trim() !== '') updates.nombre = nombre.trim();

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Debes enviar al menos direccion, pisoDepto, codigoPostal o nombre' });
    }

    const contactoExistente = await Cliente.findById(contactoId);
    if (!contactoExistente) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    // Validación multi-tenant: el contacto debe pertenecer a una empresa del usuario
    const empresasPermitidas = req.empresas || [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === String(contactoExistente.empresaId));
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este contacto' });
    }

    const contacto = await Cliente.findByIdAndUpdate(
      contactoId,
      { $set: updates },
      { new: true }
    );
    await registrarAuditoria(req, contactoExistente.empresaId, 'contacto_actualizado', `Se actualizaron los datos del contacto ${contactoExistente.telefono}`, { contactoId, updates });

    return res.json({ ok: true, contacto });
  } catch (error) {
    console.error('Error al actualizar contacto:', error);
    return res.status(500).json({ error: 'Error interno al actualizar contacto' });
  }
};

// ===== Obtener pedido activo / último pedido de una conversación =====
const obtenerPedidoActivo = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(conversacionId)) {
      return res.status(400).json({ error: 'ID de conversación inválido' });
    }
    const conversacion = await Conversacion.findById(conversacionId);
    if (!conversacion) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    const empresaIdStr = conversacion.empresaId.toString();
    const empresasPermitidas = req.empresas && req.empresas.length > 0 ? req.empresas : [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === empresaIdStr);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    const pedido = await Pedido.findOne({
      conversacionId,
      empresaId: conversacion.empresaId,
      contactoId: conversacion.contactoId,
      estado: { $nin: ['Entregado', 'Cancelado'] }
    }).sort({ createdAt: -1 });

    return res.json({ ok: true, pedido });
  } catch (error) {
    console.error('Error al obtener pedido activo:', error);
    return res.status(500).json({ error: 'Error interno al obtener pedido activo' });
  }
};

const marcarAtendido = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID de conversación inválido' });
    }
    const conversacion = await Conversacion.findById(id);
    if (!conversacion) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }
    const empresaIdStr = conversacion.empresaId.toString();
    const empresasPermitidas = req.empresas && req.empresas.length > 0 ? req.empresas : [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === empresaIdStr);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }
    conversacion.estado = 'Resuelto';
    await conversacion.save();
    return res.json({ ok: true, conversacion });
  } catch (error) {
    console.error('Error al marcar atendido:', error);
    return res.status(500).json({ error: 'Error interno al marcar atendido' });
  }
};

const reabrirConversacion = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID de conversación inválido' });
    }
    const conversacion = await Conversacion.findById(id);
    if (!conversacion) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }
    const empresaIdStr = conversacion.empresaId.toString();
    const empresasPermitidas = req.empresas && req.empresas.length > 0 ? req.empresas : [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === empresaIdStr);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }
    conversacion.estado = 'Abierto';
    await conversacion.save();
    return res.json({ ok: true, conversacion });
  } catch (error) {
    console.error('Error al reabrir conversación:', error);
    return res.status(500).json({ error: 'Error interno al reabrir conversación' });
  }
};

// ===== Agregar etiqueta a un contacto =====
const agregarEtiqueta = async (req, res) => {
  try {
    const { contactoId } = req.params;
    const { etiqueta, aplicadaPor, sucursal } = req.body || {};

    if (!etiqueta || typeof etiqueta !== 'string' || etiqueta.trim() === '') {
      return res.status(400).json({ error: 'Etiqueta inválida' });
    }
    if (etiqueta.trim().length > 50) {
      return res.status(400).json({ error: 'La etiqueta no puede superar los 50 caracteres' });
    }

    const contacto = await Cliente.findById(contactoId);
    if (!contacto) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    // Validación multi-tenant
    const empresasPermitidas = req.empresas || [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === String(contacto.empresaId));
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este contacto' });
    }

    const nueva = etiqueta.trim();
    const actualizadas = Array.isArray(contacto.etiquetas) ? contacto.etiquetas : [];
    if (!actualizadas.some(e => (e.nombre || e) === nueva)) {
      const nuevaEtiqueta = {
        nombre: nueva,
        aplicadaPor: (aplicadaPor || '').trim(),
        fecha: new Date(),
        sucursal: (sucursal || '').trim()
      };
      actualizadas.push(nuevaEtiqueta);
      const updated = await Cliente.findByIdAndUpdate(contactoId, {
        $set: { etiquetas: actualizadas }
      }, { new: true });
      await registrarAuditoria(req, contacto.empresaId, 'etiqueta_agregada', `Se agregó la etiqueta "${nueva}" al contacto ${contacto.telefono}`, { contactoId, etiqueta: nueva, aplicadaPor });
      return res.json({ ok: true, etiquetas: updated.etiquetas });
    }

    return res.json({ ok: true, etiquetas: actualizadas });
  } catch (error) {
    console.error('Error al agregar etiqueta:', error);
    return res.status(500).json({ error: 'Error interno al agregar etiqueta' });
  }
};

// ===== Eliminar etiqueta de un contacto =====
const eliminarEtiqueta = async (req, res) => {
  try {
    const { contactoId, etiqueta } = req.params;

    if (!etiqueta) {
      return res.status(400).json({ error: 'Etiqueta requerida' });
    }

    const contacto = await Cliente.findById(contactoId);
    if (!contacto) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    // Validación multi-tenant
    const empresasPermitidas = req.empresas || [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === String(contacto.empresaId));
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este contacto' });
    }

    const actuales = Array.isArray(contacto.etiquetas) ? contacto.etiquetas : [];
    const filtradas = actuales.filter(e => (e.nombre || e) !== etiqueta);
    await Cliente.findByIdAndUpdate(contactoId, { $set: { etiquetas: filtradas } }, { new: true });
    await registrarAuditoria(req, contacto.empresaId, 'etiqueta_eliminada', `Se eliminó la etiqueta "${etiqueta}" del contacto ${contacto.telefono}`, { contactoId, etiqueta });

    return res.json({ ok: true, etiquetas: filtradas });
  } catch (error) {
    console.error('Error al eliminar etiqueta:', error);
    return res.status(500).json({ error: 'Error interno al eliminar etiqueta' });
  }
};

// ===== Eliminar nota interna de un contacto =====
const eliminarNota = async (req, res) => {
  try {
    const { contactoId, nota: mensajeId } = req.params;

    if (!mensajeId || !mongoose.Types.ObjectId.isValid(mensajeId)) {
      return res.status(400).json({ error: 'ID de mensaje inválido' });
    }

    const contacto = await Cliente.findById(contactoId);
    if (!contacto) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    const empresasPermitidas = req.empresas || [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === String(contacto.empresaId));
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este contacto' });
    }

    const mensaje = await Mensaje.findById(mensajeId);
    if (!mensaje || mensaje.remitente !== 'nota_interna') {
      return res.status(404).json({ error: 'Nota interna no encontrada' });
    }

    const conversacion = await Conversacion.findOne({
      _id: mensaje.conversacionId,
      contactoId,
      empresaId: contacto.empresaId
    });
    if (!conversacion) {
      return res.status(403).json({ error: 'No tienes acceso a esta nota' });
    }

    await Mensaje.findByIdAndDelete(mensajeId);
    await registrarAuditoria(req, contacto.empresaId, 'nota_eliminada', `Se eliminó una nota interna del contacto ${contacto.telefono}`, { contactoId, mensajeId });

    return res.json({ ok: true });
  } catch (error) {
    console.error('Error al eliminar nota:', error);
    return res.status(500).json({ error: 'Error interno al eliminar nota' });
  }
};

// ===== Agregar nota interna a un contacto =====
const agregarNota = async (req, res) => {
  try {
    const { contactoId } = req.params;
    const { nota } = req.body || {};

    if (!nota || typeof nota !== 'string' || nota.trim() === '') {
      return res.status(400).json({ error: 'Nota inválida' });
    }
    if (nota.length > 1000) {
      return res.status(400).json({ error: 'La nota no puede superar los 1000 caracteres' });
    }

    const contacto = await Cliente.findById(contactoId);
    if (!contacto) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    const empresasPermitidas = req.empresas || [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === String(contacto.empresaId));
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este contacto' });
    }

    // Buscar la última conversación del contacto
    let conversacion = await Conversacion.findOne({
      empresaId: contacto.empresaId,
      contactoId
    }).sort({ createdAt: -1 });

    if (!conversacion) {
      // Si no existe, crear una conversación vacía
      const empresa = await Empresa.findById(contacto.empresaId);
      conversacion = await obtenerOCrearConversacion({
        empresaId: contacto.empresaId,
        contactoId,
        lineaReceptora: empresa?.whatsappPhoneId || '',
        numeroReceptor: '',
        botActivo: empresa?.botActivo !== false,
        estado: 'Abierto',
        ultimoMensaje: ''
      });
    }

    const nuevoMensaje = await Mensaje.create({
      conversacionId: conversacion._id,
      remitente: 'nota_interna',
      contenido: nota.trim()
    });
    await registrarAuditoria(req, contacto.empresaId, 'nota_agregada', `Se agregó una nota interna al contacto ${contacto.telefono}`, { contactoId, mensajeId: nuevoMensaje._id, conversacionId: conversacion._id, nota: nota.trim() });

    return res.status(201).json({ ok: true, mensaje: nuevoMensaje });
  } catch (error) {
    console.error('Error al agregar nota:', error);
    return res.status(500).json({ error: 'Error interno al agregar nota' });
  }
};

const bloquearCliente = async (req, res) => {
  try {
    const { contactoId } = req.params;
    const contactoExistente = await Cliente.findById(contactoId);
    if (!contactoExistente) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    // Validación multi-tenant
    const empresasPermitidas = req.empresas || [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === String(contactoExistente.empresaId));
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este contacto' });
    }

    const contacto = await Cliente.findByIdAndUpdate(
      contactoId,
      { $set: { bloqueado: true } },
      { new: true }
    );
    await registrarAuditoria(req, contactoExistente.empresaId, 'cliente_bloqueado', `Se bloqueó al cliente ${contactoExistente.telefono}`, { contactoId, telefono: contactoExistente.telefono });
    return res.json({ ok: true, bloqueado: true, contacto });
  } catch (error) {
    console.error('Error al bloquear cliente:', error);
    return res.status(500).json({ error: 'Error interno al bloquear cliente' });
  }
};

const desbloquearCliente = async (req, res) => {
  try {
    const { contactoId } = req.params;
    const contactoExistente = await Cliente.findById(contactoId);
    if (!contactoExistente) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    // Validación multi-tenant
    const empresasPermitidas = req.empresas || [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === String(contactoExistente.empresaId));
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este contacto' });
    }

    const contacto = await Cliente.findByIdAndUpdate(
      contactoId,
      { $set: { bloqueado: false } },
      { new: true }
    );
    await registrarAuditoria(req, contactoExistente.empresaId, 'cliente_desbloqueado', `Se desbloqueó al cliente ${contactoExistente.telefono}`, { contactoId, telefono: contactoExistente.telefono });
    return res.json({ ok: true, bloqueado: false, contacto });
  } catch (error) {
    console.error('Error al desbloquear cliente:', error);
    return res.status(500).json({ error: 'Error interno al desbloquear cliente' });
  }
};

const crearContactoManual = async (req, res) => {
  try {
    const empresaId = req.empresaId || (req.empresas && req.empresas[0]);
    if (!empresaId) {
      return res.status(400).json({ error: 'No se pudo identificar la empresa' });
    }

    const { nombre = '', telefono = '', direccion = '', etiquetas = [] } = req.body || {};

    if (typeof nombre !== 'string' || nombre.length > 100) {
      return res.status(400).json({ error: 'El nombre debe ser un string de máximo 100 caracteres' });
    }
    if (telefono === undefined || telefono === null || String(telefono).trim() === '') {
      return res.status(400).json({ error: 'Teléfono inválido' });
    }
    if (typeof direccion !== 'string' || direccion.length > 200) {
      return res.status(400).json({ error: 'La dirección debe ser un string de máximo 200 caracteres' });
    }
    if (!Array.isArray(etiquetas) || etiquetas.some(e => typeof e !== 'string' || e.length > 50)) {
      return res.status(400).json({ error: 'Las etiquetas deben ser un array de strings de máximo 50 caracteres' });
    }

    const telefonoLimpio = String(telefono || '').replace(/\D/g, '');
    if (!telefonoLimpio || telefonoLimpio.length < 6) {
      return res.status(400).json({ error: 'Teléfono inválido' });
    }

    const contactoExistente = await Cliente.findOne({ empresaId, telefono: telefonoLimpio });
    if (contactoExistente) {
      return res.status(409).json({ error: 'Ya existe un contacto con ese teléfono en esta empresa' });
    }

    const contacto = await Cliente.create({
      empresaId,
      telefono: telefonoLimpio,
      nombre: nombre || 'Cliente',
      direccion: direccion || '',
      etiquetas: Array.isArray(etiquetas)
        ? etiquetas
            .filter(e => typeof e === 'string' && e.trim() !== '')
            .map(nombreEtiqueta => ({
              nombre: nombreEtiqueta.trim(),
              aplicadaPor: 'manual',
              fecha: new Date(),
              sucursal: ''
            }))
        : []
    });

    const empresa = await Empresa.findById(empresaId);
    let conversacion = await obtenerOCrearConversacion({
      empresaId,
      contactoId: contacto._id,
      lineaReceptora: empresa?.whatsappPhoneId || '',
      numeroReceptor: empresa?.whatsappPhoneId || '',
      botActivo: empresa?.botActivo !== false,
      estado: 'Abierto',
      ultimoMensaje: ''
    });

    const io = req.app.get('io');
    if (io) {
      io.to(empresaId.toString()).emit('contacto-creado', {
        contacto,
        conversacionId: conversacion._id
      });
    }
    await registrarAuditoria(req, empresaId, 'contacto_creado', `Se creó el contacto ${telefonoLimpio}`, { contactoId: contacto._id, telefono: telefonoLimpio, nombre: contacto.nombre });

    return res.status(201).json({ ok: true, contacto, conversacionId: conversacion._id });
  } catch (error) {
    console.error('Error al crear contacto manual:', error);
    return res.status(500).json({ error: 'Error interno al crear contacto' });
  }
};

const obtenerMonedero = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id).lean();
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const empresas = await Empresa.find({ usuarioAppId: usuario._id.toString() }).lean();
    const costoTotal = usuario.costoCicloActualUsd || 0;
    const saldo = usuario.saldoUsd || 0;
    const deuda = usuario.deudaPendienteUsd || 0;
    const tolerancia = usuario.deudaToleradaUsd || 5;

    return res.json({
      ok: true,
      monedero: {
        saldoUsd: saldo,
        costoUsdCiclo: costoTotal,
        deudaPendienteUsd: deuda,
        deudaToleradaUsd: tolerancia,
        saldoRestanteUsd: (saldo + Math.max(0, tolerancia - deuda)).toFixed(4),
        monederoBloqueado: usuario.monederoBloqueado || false,
        fechaCicloFacturacion: usuario.fechaCicloFacturacion,
        empresas: empresas.map(e => ({ nombre: e.nombre, costo: e.metaCostoTotal || 0 }))
      }
    });
  } catch (error) {
    console.error('Error al obtener monedero:', error);
    return res.status(500).json({ error: 'Error interno al obtener monedero' });
  }
};

const cargarSaldoMonedero = async (req, res) => {
  try {
    // ===== NUEVO: solo el admin puede cargar saldo =====
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo el admin puede cargar saldo' });
    }
    // ===== FIN NUEVO =====

    const { montoUsd, usuariodId } = req.body || {};
    const usuarioId = usuariodId || req.usuario.id;
    const monto = parseFloat(montoUsd);
    if (!monto || isNaN(monto) || monto <= 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }

    const usuario = await Usuario.findById(usuarioId);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    let deudaNueva = usuario.deudaPendienteUsd || 0;
    let saldoNuevo = usuario.saldoUsd || 0;
    const costoCiclo = usuario.costoCicloActualUsd || 0;

    // Aplicar el costo acumulado del ciclo antes de cargar el nuevo saldo
    if (costoCiclo > 0) {
      if (saldoNuevo >= costoCiclo) {
        saldoNuevo -= costoCiclo;
      } else {
        deudaNueva += (costoCiclo - saldoNuevo);
        saldoNuevo = 0;
      }
    }

    // Ahora cargar el nuevo monto, primero paga la deuda pendiente
    let restante = monto;
    if (deudaNueva > 0) {
      const pagoDeuda = Math.min(deudaNueva, restante);
      deudaNueva -= pagoDeuda;
      restante -= pagoDeuda;
    }
    saldoNuevo += restante;

    await Usuario.findByIdAndUpdate(usuarioId, {
      $set: {
        saldoUsd: saldoNuevo,
        deudaPendienteUsd: deudaNueva,
        costoCicloActualUsd: 0,
        monederoBloqueado: false,
        fechaCicloFacturacion: new Date(),
        avisoEnviado: false
      }
    });

    await Empresa.updateMany(
      { usuarioAppId: usuarioId.toString() },
      { $set: { botActivo: true } }
    );

    return res.json({
      ok: true,
      monedero: {
        saldoUsd: saldoNuevo,
        deudaPendienteUsd: deudaNueva,
        deudaToleradaUsd: usuario.deudaToleradaUsd || 5,
        monederoBloqueado: false
      },
      message: 'Saldo cargado correctamente'
    });
  } catch (error) {
    console.error('Error al cargar saldo:', error);
    return res.status(500).json({ error: 'Error interno al cargar saldo' });
  }
};

async function obtenerPlantillas(req, res) {
  try {
    const empresaId = req.empresaId || (req.empresas && req.empresas[0]);
    if (!empresaId) return res.status(400).json({ error: 'No se identificó la empresa' });

    const empresa = await Empresa.findById(empresaId).lean();
    if (!empresa?.wabaId || !empresa?.tokenMeta) {
      return res.status(400).json({ error: 'Faltan wabaId o tokenMeta' });
    }

    const url = `https://graph.facebook.com/v19.0/${empresa.wabaId}/message_templates`;
    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${empresa.tokenMeta}` }
    });
    const data = await resp.json();

    if (!resp.ok) {
      return res.status(502).json({ error: data?.error?.message || 'Error al obtener plantillas' });
    }

    const plantillas = (data.data || [])
      .filter(t => t.status === 'APPROVED')
      .map(t => ({
        id: t.id,
        nombre: t.name,
        lenguaje: t.language,
        categoria: t.category,
        texto: t.components?.find(c => c.type === 'BODY')?.text || ''
      }));

    return res.json({ ok: true, plantillas });
  } catch (error) {
    console.error('Error al obtener plantillas:', error);
    return res.status(500).json({ error: 'Error interno al obtener plantillas' });
  }
}

async function generarPedidoManual(req, res) {
  try {
    const { conversacionId } = req.body || {};
    if (!conversacionId) return res.status(400).json({ error: 'Falta conversacionId' });

    const conversacion = await Conversacion.findById(conversacionId);
    if (!conversacion) return res.status(404).json({ error: 'Conversación no encontrada' });

    const empresaIdStr = conversacion.empresaId.toString();
    const empresasPermitidas = req.empresas || [];
    if (!empresasPermitidas.some(e => String(e) === empresaIdStr)) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    const empresa = await Empresa.findById(conversacion.empresaId);
    const usuario = await Usuario.findById(empresa.usuarioAppId).lean();
    const productos = await Producto.find({ empresaId: empresa._id }).lean();

    const contacto = await Cliente.findById(conversacion.contactoId);
    if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado' });

    const desde = new Date(Date.now() - 60 * 60 * 1000);
    const mensajes = await Mensaje.find({
      conversacionId: conversacion._id,
      remitente: { $nin: ['nota_interna'] },
      createdAt: { $gte: desde }
    }).sort({ createdAt: 1 }).lean();

    if (mensajes.length === 0) {
      return res.status(422).json({ error: 'No hay mensajes recientes para analizar' });
    }

    const textoConversacion = mensajes
      .map(m => `${m.remitente === 'cliente' ? 'Cliente' : 'Bot/Operador'}: ${m.contenido}`)
      .join('\n');

    const menuTexto = productos.length
      ? productos.map(p => `- ${p.nombre} ($${p.precio})`).join('\n')
      : 'No hay productos cargados';

    const prompt = `Actuás como sistema de punto de venta. Analizá la siguiente conversación:
"""${textoConversacion}"""

Interpretá el pedido final del cliente y devolvé SOLO un JSON (sin texto adicional) con la estructura:
{"items":[{"nombre":"...", "cantidad":2, "precioUnitario":10}],"total":40}

Reglas:
- Incluí únicamente los productos que el cliente confirmó explícitamente.
- Si no hay un pedido claro, devolvé null.
- No inventes items ni precios que no estén en el catálogo.
- Precio unitario debe ser el precio del catálogo.

Catálogo:
${menuTexto}

JSON:`;

    const raw = (await generarTextoCola(prompt) || '').trim()
      .replace(/```json/g, '').replace(/```/g, '').trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) {
      return res.status(422).json({ error: 'No se pudo interpretar un pedido de la conversación' });
    }

    let data;
    try {
      data = JSON.parse(raw.substring(start, end + 1));
    } catch (e) {
      return res.status(422).json({ error: 'Respuesta de IA inválida' });
    }

    if (!data || !Array.isArray(data.items) || data.items.length === 0) {
      return res.status(422).json({ error: 'No se detectaron productos en la conversación' });
    }

    const items = data.items.map(item => {
      const prod = productos.find(p => p.nombre.toLowerCase() === String(item.nombre || '').toLowerCase());
      if (!prod) return null;
      return {
        nombre: prod.nombre,
        cantidad: Math.max(1, parseInt(item.cantidad) || 1),
        precioUnitario: prod.precio
      };
    }).filter(Boolean);

    if (items.length === 0) {
      return res.status(422).json({ error: 'Los productos detectados no están en el catálogo' });
    }

    const total = items.reduce((sum, it) => sum + (it.cantidad * it.precioUnitario), 0);

    let direccion = '';
    const texto = mensajes.map(m => m.contenido).join(' ');
    if (process.env.GEMINI_API_KEY) {
      try {
        const promptDir = `Analizá el siguiente texto de una conversación y extraé SOLO la dirección de entrega del cliente (calle, número, piso, depto, localidad, etc.). Si no hay dirección, respondé exactamente "SIN DIRECCION". Texto: "${texto}". Dirección:`;
        const respDir = await generarTextoCola(promptDir);
        const dirLimpia = (respDir || '').trim().replace(/^"|"$/g, '');
        if (dirLimpia && dirLimpia !== 'SIN DIRECCION') {
          direccion = dirLimpia;
        }
      } catch (e) {
        console.warn('⚠️ No se pudo extraer dirección del texto:', e.message);
      }
    }
    if (!direccion) {
      const match = texto.match(/([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ ]+ \d+)/);
      if (match) direccion = match[1].trim();
    }

    let pedido;
    try {
      pedido = await guardarPedidoConfirmado({
        localId: usuario?._id,
        empresaId: empresa._id,
        contactoId: contacto._id,
        conversacionId: conversacion._id,
        cliente: contacto.nombre || 'Cliente',
        telefonoCliente: contacto.telefono,
        items,
        total,
        metodoPago: 'Pendiente',
        estado: 'confirmado',
        direccionEntrega: direccion,
        notas: '',
        fechaTurno: '',
        fecha: new Date(),
        latitud: conversacion.latitud || null,
        longitud: conversacion.longitud || null
      });
    } catch (e) {
      if (e.code === 'SIN_STOCK') {
        const nombres = (e.faltantes || []).map(f => f.nombre).join(', ');
        return res.status(422).json({ error: `No hay stock suficiente: ${nombres}`, faltantes: e.faltantes });
      }
      throw e;
    }

    await Conversacion.findByIdAndUpdate(conversacion._id, {
      $set: { carrito: [], carritoTotal: 0, latitud: null, longitud: null }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(empresaIdStr).emit('pedido-actualizado', {
        conversacionId: conversacion._id,
        pedidoId: pedido._id,
        estado: 'confirmado'
      });
    }

    return res.json({ ok: true, pedido });
  } catch (error) {
    console.error('Error al generar pedido manual:', error);
    return res.status(500).json({ error: 'Error interno al generar pedido' });
  }
}

async function reenviarMensaje(req, res) {
  try {
    const { mensajeId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(mensajeId)) {
      return res.status(400).json({ error: 'ID de mensaje inválido' });
    }

    const mensaje = await Mensaje.findById(mensajeId);
    if (!mensaje) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    const conversacion = await Conversacion.findById(mensaje.conversacionId)
      .populate('empresaId')
      .populate('contactoId');
    if (!conversacion) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    const empresaIdStr = conversacion.empresaId?._id?.toString() || conversacion.empresaId.toString();
    const empresasPermitidas = req.empresas || [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === empresaIdStr);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    const empresa = conversacion.empresaId;
    const contacto = conversacion.contactoId;
    const telefonoCliente = contacto?.telefono;
    const textoMensaje = mensaje.contenido;

    const resultado = await enviarMensajeMeta(empresa, telefonoCliente, textoMensaje);

    if (!resultado.ok) {
      await Mensaje.findByIdAndUpdate(mensajeId, {
        $set: {
          estado: 'fallido',
          errorDetalle: resultado.error || 'Error desconocido de Meta'
        }
      });

      const io = req.app.get('io');
      if (io) {
        io.to(empresaIdStr).emit('mensaje-estado', {
          mensajeId: mensajeId,
          conversacionId: mensaje.conversacionId,
          estado: 'fallido',
          errorDetalle: resultado.error,
          fechaEstado: new Date()
        });
      }

      return res.status(200).json({
        ok: true,
        fallido: true,
        error: 'No se pudo reenviar el mensaje',
        mensajeId
      });
    }

    await Mensaje.findByIdAndUpdate(mensajeId, {
      $set: {
        estado: 'enviado',
        errorDetalle: '',
        whatsappMsgId: resultado.msgId,
        fechaEstado: new Date()
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(empresaIdStr).emit('mensaje-estado', {
        mensajeId: mensajeId,
        conversacionId: mensaje.conversacionId,
        estado: 'enviado',
        fechaEstado: new Date()
      });
    }

    return res.json({ ok: true, mensajeId, estado: 'enviado', whatsappMsgId: resultado.msgId });
  } catch (error) {
    console.error('Error al reenviar mensaje:', error);
    return res.status(500).json({ error: 'Error interno al reenviar mensaje' });
  }
}

async function enviarPlantilla(req, res) {
  try {
    const { conversacionId, plantillaId, variables = [] } = req.body || {};
    if (!conversacionId || !plantillaId) {
      return res.status(400).json({ error: 'Faltan conversacionId y plantillaId' });
    }

    const conversacion = await Conversacion.findById(conversacionId)
      .populate('empresaId')
      .populate('contactoId');
    if (!conversacion) return res.status(404).json({ error: 'Conversación no encontrada' });

    const empresaId = conversacion.empresaId?._id || conversacion.empresaId;
    const empresaIdStr = empresaId ? empresaId.toString() : '';
    const empresasPermitidas = req.empresas || [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === empresaIdStr);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    const empresa = conversacion.empresaId;
    const contacto = conversacion.contactoId;

    const telefonoCliente = contacto?.telefono;
    const whatsappPhoneId = empresa?.whatsappPhoneId;
    const wabaId = empresa?.wabaId;
    const accessToken = empresa?.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;
    if (!whatsappPhoneId || !telefonoCliente || !accessToken || !wabaId) {
      return res.status(500).json({ error: 'Faltan credenciales de la empresa (wabaId, token, etc.)' });
    }

    // Obtener plantillas desde Meta para encontrar la solicitada
    const urlPlantillas = `https://graph.facebook.com/v19.0/${wabaId}/message_templates`;
    const respPlantillas = await fetch(urlPlantillas, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const dataPlantillas = await respPlantillas.json();
    if (!respPlantillas.ok) {
      return res.status(502).json({ error: dataPlantillas?.error?.message || 'Error al obtener plantillas' });
    }
    const plantilla = (dataPlantillas.data || []).find(t => String(t.id) === String(plantillaId));
    if (!plantilla) {
      return res.status(404).json({ error: 'Plantilla no encontrada o no aprobada' });
    }

    const bodyComponent = plantilla.components?.find(c => c.type === 'BODY');
    if (!bodyComponent || !bodyComponent.text) {
      return res.status(400).json({ error: 'La plantilla no tiene componente BODY' });
    }

    // Armar parámetros a partir de las variables
    const cantidadVariables = (bodyComponent.text.match(/\{\{[0-9]+\}\}/g) || []).length;
    const parameters = [];
    for (let i = 0; i < cantidadVariables; i++) {
      parameters.push({
        type: 'text',
        text: variables[i] || ''
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: telefonoCliente,
      type: 'template',
      template: {
        name: plantilla.name,
        language: { code: plantilla.language },
        components: [
          {
            type: 'body',
            parameters
          }
        ]
      }
    };

    const respEnvio = await fetch(`https://graph.facebook.com/v19.0/${whatsappPhoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const bodyEnvio = await respEnvio.json();
    if (!respEnvio.ok) {
      return res.status(502).json({ error: bodyEnvio?.error?.message || 'Error al enviar plantilla' });
    }

    // Armar texto final reemplazando variables
    let textoFinal = bodyComponent.text;
    variables.forEach((v, i) => {
      textoFinal = textoFinal.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), v);
    });

    const nuevoMensaje = await Mensaje.create({
      conversacionId: conversacion._id,
      remitente: 'empresa',
      contenido: textoFinal,
      whatsappMsgId: bodyEnvio?.messages?.[0]?.id || '',
      estado: 'enviado'
    });

    await Conversacion.findByIdAndUpdate(conversacion._id, {
      $set: {
        ultimoMensaje: textoFinal,
        estado: 'Abierto'
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(empresa._id.toString()).emit('mensaje-nuevo', {
        conversacionId: conversacion._id,
        mensaje: {
          _id: nuevoMensaje._id,
          remitente: 'empresa',
          contenido: textoFinal,
          estado: 'enviado',
          fecha: new Date()
        },
        conversacion: {
          _id: conversacion._id,
          ultimoMensaje: textoFinal,
          updatedAt: new Date()
        }
      });
    }

    return res.json({ ok: true, mensaje: nuevoMensaje });
  } catch (error) {
    console.error('Error al enviar plantilla:', error);
    return res.status(500).json({ error: 'Error interno al enviar plantilla' });
  }
}


const subirFotoContacto = async (req, res) => {
  try {
    const { contactoId } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }
    const contactoExistente = await Cliente.findById(contactoId);
    if (!contactoExistente) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }
    const empresasPermitidas = req.empresas || [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === String(contactoExistente.empresaId));
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a este contacto' });
    }
    const empresaId = contactoExistente.empresaId.toString();
    const uploadDir = path.join(__dirname, '..', 'uploads', empresaId, 'contactos');
    fs.mkdirSync(uploadDir, { recursive: true });
    const nombreArchivo = `${contactoId}.jpg`;
    const rutaArchivo = path.join(uploadDir, nombreArchivo);
    // Copiar el archivo subido
    fs.copyFileSync(req.file.path, rutaArchivo);
    fs.unlinkSync(req.file.path);
    const urlArchivo = `/uploads/${empresaId}/contactos/${nombreArchivo}`;
    await Cliente.findByIdAndUpdate(contactoId, { $set: { fotoPerfil: urlArchivo } });
    const io = req.app.get('io');
    if (io) {
      io.to(empresaId).emit('contacto-foto-actualizada', { contactoId, fotoPerfil: urlArchivo });
    }
    return res.json({ ok: true, fotoPerfil: urlArchivo });
  } catch (error) {
    console.error('Error al subir foto de contacto:', error);
    return res.status(500).json({ error: 'Error interno al subir foto' });
  }
};

module.exports = {
  subirFotoContacto,
  verificarFirmaMeta,
  verificarWebhook,
  recibirMensaje,
  enviarMensaje,
  enviarMensajeMedia,
  enviarMensajeMeta,
  enviarPlantilla,
  reenviarMensaje,
  actualizarBotActivo,
  actualizarBotActivoConversacion,
  actualizarContacto,
  obtenerPedidoActivo,
  marcarAtendido,
  reabrirConversacion,
  agregarEtiqueta,
  eliminarEtiqueta,
  agregarNota,
  eliminarNota,
  bloquearCliente,
  desbloquearCliente,
  crearContactoManual,
  obtenerPlantillas,
  obtenerMonedero,
  cargarSaldoMonedero,
  actualizarCostosManual,
  actualizarConfig,
  obtenerUsoConversaciones,
  obtenerConfig,
  generarPedidoManual
};
