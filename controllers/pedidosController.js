const Pedido = require('../models/Pedido');
const Conversacion = require('../models/Conversacion');

// Crear pedido confirmado (usada internamente cuando el bot confirma)
async function guardarPedidoConfirmado(datos) {
  const direccionEntrega = datos.direccionEntrega || datos.direccion || '';
  const { direccion, ...resto } = datos;
  const pedido = new Pedido({
    ...resto,
    direccionEntrega,
    estado: datos.estado || 'confirmado'
  });
  await pedido.save();
  return pedido;
}

// Endpoint POST /api/pedidos (cumple el flujo de confirmación)
async function confirmarPedido(req, res) {
  try {
    const localId = req.usuario.id || req.userId;
    if (!localId) {
      return res.status(400).json({ error: 'No se pudo identificar el local' });
    }
    const {
      cliente = '',
      telefonoCliente = '',
      items = [],
      total = 0,
      metodoPago = '',
      direccion = '',
      direccionEntrega = '',
      notas = '',
      fechaTurno = '',
      fecha = new Date(),
      empresaId = null,
      contactoId = null
    } = req.body || {};

    const empresaIdFinal = req.empresaId || empresaId;
    const contactoIdFinal = req.body?.contactoId || contactoId;

    const pedido = await guardarPedidoConfirmado({
      localId,
      empresaId: empresaIdFinal,
      contactoId: contactoIdFinal,
      cliente,
      telefonoCliente,
      items,
      total,
      metodoPago,
      estado: 'confirmado',
      direccionEntrega: direccionEntrega || direccion,
      notas,
      fechaTurno,
      fecha
    });

    return res.status(201).json({ ok: true, pedido });
  } catch (error) {
    console.error('Error al confirmar pedido:', error);
    return res.status(500).json({ error: 'Error interno al confirmar pedido' });
  }
}

// Endpoint GET /api/pedidos/cliente/:telefono
async function obtenerPedidosPorTelefono(req, res) {
  try {
    const { telefono } = req.params;
    const localId = req.usuario.id || req.userId;
    const empresaId = req.empresaId || null;
    const contactoId = req.query.contactoId || null;
    if (!localId) {
      return res.status(400).json({ error: 'No se pudo identificar el local' });
    }

    const query = { localId };
    if (empresaId) query.empresaId = empresaId;
    if (contactoId) {
      query.contactoId = contactoId;
    } else if (telefono) {
      query.telefonoCliente = telefono;
    }

    const pedidos = await Pedido.find(query).sort({ fecha: -1 }).lean();

    return res.json({ ok: true, pedidos });
  } catch (error) {
    console.error('Error al obtener pedidos por telefono:', error);
    return res.status(500).json({ error: 'Error interno al obtener pedidos' });
  }
}

async function actualizarEstadoPedido(req, res) {
  try {
    const { id } = req.params;
    const { estado } = req.body || {};

    const estadosPermitidos = ['confirmado', 'en_preparacion', 'en_camino', 'entregado', 'cancelado'];
    if (!estadosPermitidos.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido. Permitidos: confirmado, en_preparacion, en_camino, entregado, cancelado' });
    }

    const pedido = await Pedido.findById(id);
    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    pedido.estado = estado;
    pedido.fechaEstado = new Date();
    if (estado === 'entregado') pedido.fechaEntrega = new Date();
    await pedido.save();

    // Emitir evento en tiempo real
    const io = req.app.get('io');
    if (io) {
      let conversacionId = pedido.conversacionId;
      if (!conversacionId && pedido.empresaId && pedido.contactoId) {
        const conv = await Conversacion.findOne({
          empresaId: pedido.empresaId,
          contactoId: pedido.contactoId
        }).sort({ createdAt: -1 }).lean();
        conversacionId = conv?._id;
      }
      if (conversacionId) {
        io.to(pedido.empresaId.toString()).emit('pedido-actualizado', {
          conversacionId: conversacionId.toString(),
          pedidoId: pedido._id,
          estado,
          pedido: pedido.toObject()
        });
      }
    }

    return res.json({ ok: true, pedido });
  } catch (error) {
    console.error('Error al actualizar estado del pedido:', error);
    return res.status(500).json({ error: 'Error interno al actualizar estado' });
  }
}

module.exports = {
  guardarPedidoConfirmado,
  confirmarPedido,
  obtenerPedidosPorTelefono,
  actualizarEstadoPedido
};
