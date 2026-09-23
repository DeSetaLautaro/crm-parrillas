const mongoose = require('mongoose');
const Conversacion = require('../models/Conversacion');
const Mensaje = require('../models/Mensaje');
const Cliente = require('../models/Cliente');
const Empresa = require('../models/Empresa');
const Pedido = require('../models/Pedido');


/**
 * GET /api/conversaciones
 * Devuelve todas las conversaciones de la Parrilla del usuario logueado,
 * incluyendo cada array de mensajes.
 */
const obtenerConversaciones = async (req, res) => {
  try {
    console.log('[obtenerConversaciones] ===== INICIO =====');
    console.log('[obtenerConversaciones] req.empresas:', req.empresas);
    console.log('[obtenerConversaciones] req.empresaId:', req.empresaId);
    console.log('[obtenerConversaciones] req.parrillaId:', req.parrillaId);
    console.log('[obtenerConversaciones] req.usuario:', req.usuario ? { id: req.usuario.id, rol: req.usuario.rol, nombre: req.usuario.nombre } : null);

    const empresaId = req.empresaId || req.parrillaId;
    if (!empresaId) {
      console.log('[obtenerConversaciones] ❌ No se pudo identificar empresaId');
      return res.status(400).json({ error: 'No se pudo identificar la Empresa asociada al usuario' });
    }

    const empresasRaw = req.empresas && req.empresas.length > 0 ? req.empresas : [empresaId];
    const empresas = empresasRaw.map(id => {
      try { return new mongoose.Types.ObjectId(id); } catch { return id; }
    });
    console.log('[obtenerConversaciones] empresasRaw:', empresasRaw);
    console.log('[obtenerConversaciones] empresas convertidas:', empresas.map(e => String(e)));
    const query = { empresaId: { $in: empresas } };
    console.log('[obtenerConversaciones] query:', JSON.stringify(query, null, 2));

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const skip = (page - 1) * limit;

    const [conversacionesFind, total] = await Promise.all([
      Conversacion.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Conversacion.countDocuments(query)
    ]);
    console.log('[obtenerConversaciones] conversacionesFind devueltas:', conversacionesFind.length);
    console.log('[obtenerConversaciones] total (countDocuments):', total);

    // Traer mensajes de las conversaciones de esta página en una sola consulta
    const idsConversaciones = conversacionesFind.map(c => c._id);
    const mensajesPorConversacion = idsConversaciones.length > 0
      ? await Mensaje.aggregate([
          { $match: { conversacionId: { $in: idsConversaciones } } },
          { $sort: { _id: -1 } },
          { $group: { _id: '$conversacionId', mensajes: { $push: '$$ROOT' } } },
          { $project: { mensajes: { $slice: ['$mensajes', 51] } } }
        ])
      : [];

    // Calcular ventana de 24h para cada conversación
    const ultimoMensajeCliente = idsConversaciones.length > 0
      ? await Mensaje.aggregate([
          { $match: { conversacionId: { $in: idsConversaciones }, remitente: 'cliente' } },
          { $sort: { createdAt: -1 } },
          { $group: { _id: '$conversacionId', ultimaFecha: { $first: '$createdAt' } } }
        ])
      : [];
    const mapaVentana = new Map();
    const ahoraVentana = Date.now();
    ultimoMensajeCliente.forEach(item => {
      const abierta = (ahoraVentana - new Date(item.ultimaFecha).getTime()) < 24 * 60 * 60 * 1000;
      mapaVentana.set(String(item._id), abierta);
    });
    const mapaMensajes = new Map(mensajesPorConversacion.map(g => [String(g._id), g.mensajes]));

    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pedidosCancelados = await Pedido.find({
      empresaId: { $in: empresas },
      estado: 'Cancelado',
      updatedAt: { $gte: hace24h }
    }).lean();
    const canceladosPorConv = new Map();
    pedidosCancelados.forEach(p => {
      if (p.conversacionId) {
        canceladosPorConv.set(p.conversacionId.toString(), p);
      }
    });

    const empresasDocs = await Empresa.find({ _id: { $in: empresas } }).lean();
    const empresasInfo = empresasDocs.map(e => ({
      _id: e._id.toString(),
      nombre: e.nombre,
      whatsappPhoneId: e.whatsappPhoneId
    }));

    // Cargar contactos presentes en esta página
    const idsContactos = conversacionesFind.map(c => c.contactoId).filter(Boolean);
    const contactos = await Cliente.find({ _id: { $in: idsContactos } }).lean();
    const mapaContactos = new Map(contactos.map(c => [String(c._id), c]));

    const conversacionesConMensajes = conversacionesFind.map(conv => {
      const contacto = mapaContactos.get(String(conv.contactoId)) || {};
      const mensajesDesc = Array.isArray(mapaMensajes.get(String(conv._id))) ? mapaMensajes.get(String(conv._id)) : [];
      // Los mensajes vienen ordenados descendente; limitamos a 50 y los invertimos
      const mensajesAsc = mensajesDesc.slice(0, 50).reverse();
      const tieneMas = mensajesDesc.length > 50;
      return {
        _id: conv._id,
        empresaId: conv.empresaId,
        contactoId: conv.contactoId,
        contacto: {
          _id: conv.contactoId,
          nombre: contacto.nombre || '',
          telefono: contacto.telefono || '',
          direccion: contacto.direccion || '',
          pisoDepto: contacto.pisoDepto || '',
          codigoPostal: contacto.codigoPostal || '',
          etiquetas: Array.isArray(contacto.etiquetas) ? contacto.etiquetas : [],
          notas: Array.isArray(contacto.notas) ? contacto.notas : []
        },
        lineaReceptora: conv.lineaReceptora,
        numeroReceptor: conv.numeroReceptor || '',
        botActivo: conv.botActivo,
        estado: conv.estado,
        ultimoMensaje: conv.ultimoMensaje,
        updatedAt: conv.updatedAt,
        tieneCancelacionReciente: canceladosPorConv.has(conv._id.toString()),
        ventanaAbierta: mapaVentana.get(String(conv._id)) ?? false,
        tieneMas,
        mensajes: mensajesAsc.map(m => ({
          _id: m._id,
          remitente: m.remitente,
          contenido: m.contenido,
          fecha: m.createdAt,
          estado: m.estado || 'enviado',
          fechaEstado: m.fechaEstado || null,
          tipo: m.tipo || 'texto',
          urlArchivo: m.urlArchivo || ''
        }))
      };
    });

    console.log('[obtenerConversaciones] ✅ Respondiendo con conversacionesConMensajes:', conversacionesConMensajes.length);
    return res.json({
      ok: true,
      conversaciones: conversacionesConMensajes,
      empresas: empresasInfo,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error al obtener conversaciones:', error);
    return res.status(500).json({ error: 'Error interno al obtener conversaciones' });
  }
};

const obtenerMensajesConversacion = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const before = req.query.before || null;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID de conversación inválido' });
    }

    const conversacion = await Conversacion.findById(id);
    if (!conversacion) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    const empresaIdStr = conversacion.empresaId.toString();
    const empresasPermitidas = req.empresas || [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === empresaIdStr);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    let ventanaAbierta = false;
    const ultimoCliente = await Mensaje.findOne({
      conversacionId: id,
      remitente: 'cliente'
    }).sort({ createdAt: -1 }).lean();
    if (ultimoCliente) {
      const limite = new Date(ultimoCliente.createdAt).getTime() + 24 * 60 * 60 * 1000;
      ventanaAbierta = Date.now() < limite;
    }

    const filtro = { conversacionId: id };
    if (before) {
      if (!mongoose.Types.ObjectId.isValid(before)) {
        return res.status(400).json({ error: 'ID de mensaje inválido' });
      }
      filtro._id = { $lt: new mongoose.Types.ObjectId(before) };
    }

    console.log('[obtenerMensajesConversacion] before:', before);
    console.log('[obtenerMensajesConversacion] filtro:', JSON.stringify(filtro));
    console.log('[obtenerMensajesConversacion] limit:', limit);

    const mensajes = await Mensaje.find(filtro)
      .sort({ _id: -1 })
      .limit(limit)
      .lean();

    console.log('[obtenerMensajesConversacion] mensajes encontrados:', mensajes.length);
    if (mensajes.length > 0) {
      console.log('[obtenerMensajesConversacion] primer mensaje devuelto:', mensajes[0]._id.toString());
      console.log('[obtenerMensajesConversacion] último mensaje devuelto:', mensajes[mensajes.length - 1]._id.toString());
    }

    const hasMore = mensajes.length === limit;
    mensajes.reverse();

    return res.json({
      ok: true,
      ventanaAbierta,
      mensajes: mensajes.map(m => ({
        _id: m._id,
        remitente: m.remitente,
        contenido: m.contenido,
        fecha: m.createdAt,
        estado: m.estado || 'enviado',
        fechaEstado: m.fechaEstado || null,
        tipo: m.tipo || 'texto',
        urlArchivo: m.urlArchivo || ''
      })),
      hasMore,
      total: mensajes.length
    });
  } catch (error) {
    console.error('Error al obtener mensajes de conversación:', error);
    return res.status(500).json({ error: 'Error interno al obtener mensajes' });
  }
};

const buscarMensajes = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Falta el parámetro q' });
    }

    const empresasRaw = req.empresas && req.empresas.length > 0 ? req.empresas : [];
    if (!empresasRaw.length) {
      return res.status(400).json({ error: 'No se pudo identificar la empresa' });
    }
    const empresas = empresasRaw.map(id => {
      try { return new mongoose.Types.ObjectId(id); } catch { return id; }
    });

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const conversaciones = await Conversacion.aggregate([
      { $match: { empresaId: { $in: empresas } } },
      {
        $lookup: {
          from: 'mensajes',
          let: { convId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$conversacionId', '$$convId'] } } },
            { $match: { contenido: { $regex: escaped, $options: 'i' } } },
            { $sort: { _id: -1 } },
            { $limit: 5 },
            { $project: { _id: 1, remitente: 1, contenido: 1, createdAt: 1, tipo: 1, urlArchivo: 1, estado: 1 } }
          ],
          as: 'mensajesMatch'
        }
      },
      { $match: { 'mensajesMatch.0': { $exists: true } } },
      {
        $lookup: {
          from: 'clientes',
          localField: 'contactoId',
          foreignField: '_id',
          as: 'contacto'
        }
      },
      { $unwind: { path: '$contacto', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          empresaId: 1,
          contactoId: 1,
          lineaReceptora: 1,
          numeroReceptor: 1,
          botActivo: 1,
          estado: 1,
          ultimoMensaje: 1,
          updatedAt: 1,
          contacto: { _id: 1, nombre: 1, telefono: 1, etiquetas: 1 },
          mensajes: '$mensajesMatch'
        }
      }
    ]);

    return res.json({ ok: true, conversaciones });
  } catch (error) {
    console.error('Error al buscar mensajes:', error);
    return res.status(500).json({ error: 'Error interno al buscar mensajes' });
  }
};

module.exports = {
  obtenerConversaciones,
  obtenerMensajesConversacion,
  buscarMensajes
};
