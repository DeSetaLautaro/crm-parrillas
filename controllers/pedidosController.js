const Pedido = require('../models/Pedido');
const Conversacion = require('../models/Conversacion');
const Producto = require('../models/Producto');

// Descuenta stock por item (match por nombre + empresa). Si a alguno no le alcanza,
// revierte los descuentos ya aplicados y devuelve la lista de faltantes.
async function descontarStock(items, empresaId) {
  const aplicados = [];
  const faltantes = [];

  for (const item of items || []) {
    const cantidad = Math.max(1, parseInt(item.cantidad) || 1);
    const nombre = String(item.nombre || '').trim();
    if (!nombre || !empresaId) continue;

    const prod = await Producto.findOne({ empresaId, nombre });
    if (!prod || prod.stock === null || prod.stock === undefined) continue;

    const actualizado = await Producto.findOneAndUpdate(
      { _id: prod._id, stock: { $gte: cantidad } },
      { $inc: { stock: -cantidad } },
      { new: true }
    );

    if (!actualizado) {
      faltantes.push({ nombre, cantidad, disponible: prod.stock });
      continue;
    }
    aplicados.push({ nombre, cantidad });
  }

  if (faltantes.length > 0) {
    for (const a of aplicados) {
      await Producto.findOneAndUpdate(
        { empresaId, nombre: a.nombre },
        { $inc: { stock: a.cantidad } }
      );
    }
    return { ok: false, faltantes };
  }

  return { ok: true, faltantes: [] };
}

// Devuelve el stock de un pedido cancelado (solo afecta productos con stock definido).
async function reintegrarStock(items, empresaId) {
  for (const item of items || []) {
    const cantidad = Math.max(1, parseInt(item.cantidad) || 1);
    const nombre = String(item.nombre || '').trim();
    if (!nombre || !empresaId) continue;

    await Producto.findOneAndUpdate(
      { empresaId, nombre, stock: { $ne: null } },
      { $inc: { stock: cantidad } }
    );
  }
}

// Crear pedido confirmado (usada internamente cuando el bot confirma).
// Re-verifica stock de forma atómica: si no alcanza, lanza error SIN_STOCK y no guarda.
async function guardarPedidoConfirmado(datos) {
  const direccionEntrega = datos.direccionEntrega || datos.direccion || '';
  const { direccion, ...resto } = datos;

  const descuento = await descontarStock(datos.items, datos.empresaId);
  if (!descuento.ok) {
    const err = new Error('Stock insuficiente');
    err.code = 'SIN_STOCK';
    err.faltantes = descuento.faltantes;
    throw err;
  }

  try {
    const pedido = new Pedido({
      ...resto,
      direccionEntrega,
      estado: datos.estado || 'confirmado'
    });
    await pedido.save();
    return pedido;
  } catch (e) {
    // Si falla el guardado, devolvemos el stock ya descontado
    await reintegrarStock(datos.items, datos.empresaId);
    throw e;
  }
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

    let pedido;
    try {
      pedido = await guardarPedidoConfirmado({
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
    } catch (e) {
      if (e.code === 'SIN_STOCK') {
        return res.status(409).json({ error: 'No hay stock suficiente', faltantes: e.faltantes });
      }
      throw e;
    }

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
  descontarStock,
  reintegrarStock,
  confirmarPedido,
  obtenerPedidosPorTelefono,
  actualizarEstadoPedido
};
