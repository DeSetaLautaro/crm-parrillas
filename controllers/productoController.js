const mongoose = require('mongoose');
const Producto = require('../models/Producto');

const TIPOS_ENVIO = ['gratis', 'a_consultar', 'fijo'];

// Normaliza el bloque de envío: tipo válido y costo 0 salvo que sea fijo.
function normalizarEnvio(envio) {
  const tipo = envio && TIPOS_ENVIO.includes(envio.tipo) ? envio.tipo : 'a_consultar';
  if (tipo !== 'fijo') return { tipo, costo: 0 };
  return { tipo, costo: Number(envio.costo) || 0 };
}

// Convierte a número los campos de medidas, dejando undefined los que vienen vacíos.
function normalizarDimensiones(dimensions) {
  const d = dimensions || {};
  const numero = (valor) => {
    if (valor === '' || valor === null || valor === undefined) return undefined;
    const n = Number(valor);
    return Number.isNaN(n) ? undefined : n;
  };
  return {
    widthCm: numero(d.widthCm),
    depthCm: numero(d.depthCm),
    heightCm: numero(d.heightCm),
    diametroCm: numero(d.diametroCm),
    emparrilladoWidthCm: numero(d.emparrilladoWidthCm),
    emparrilladoDepthCm: numero(d.emparrilladoDepthCm),
    displayString: String(d.displayString || '').trim()
  };
}

// Devuelve un mensaje de error o null si los datos están bien.
function validarProducto(datos) {
  if (!datos.nombre || !String(datos.nombre).trim()) {
    return 'El nombre es obligatorio';
  }
  const precio = Number(datos.precio);
  if (Number.isNaN(precio) || precio < 0) {
    return 'El precio no es válido';
  }
  if (!datos.dimensions || !String(datos.dimensions.displayString || '').trim()) {
    return 'El texto de medidas (displayString) es obligatorio';
  }
  if (datos.envio && datos.envio.tipo === 'fijo' && !(Number(datos.envio.costo) > 0)) {
    return 'Si el envío es fijo, el costo debe ser mayor a 0';
  }
  return null;
}

function limpiarExtras(extras) {
  if (!Array.isArray(extras)) return [];
  return extras.map(e => String(e).trim()).filter(Boolean);
}

// Lista todos los productos de la empresa del usuario autenticado.
async function listarProductos(req, res) {
  try {
    const empresaId = req.empresaId;
    if (!empresaId) {
      return res.status(403).json({ error: 'No se pudo identificar la empresa' });
    }
    const productos = await Producto.find({ empresaId }).sort({ createdAt: -1 }).lean();
    return res.json({ ok: true, productos });
  } catch (error) {
    console.error('Error al listar productos:', error);
    return res.status(500).json({ error: 'Error interno al listar productos' });
  }
}

async function obtenerProducto(req, res) {
  try {
    const empresaId = req.empresaId;
    if (!empresaId) {
      return res.status(403).json({ error: 'No se pudo identificar la empresa' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID de producto inválido' });
    }
    const producto = await Producto.findOne({ _id: req.params.id, empresaId }).lean();
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    return res.json({ ok: true, producto });
  } catch (error) {
    console.error('Error al obtener producto:', error);
    return res.status(500).json({ error: 'Error interno al obtener producto' });
  }
}

async function crearProducto(req, res) {
  try {
    const empresaId = req.empresaId;
    if (!empresaId) {
      return res.status(403).json({ error: 'No se pudo identificar la empresa' });
    }

    const { nombre, precio, fotoUrl, extras, envio, dimensions } = req.body || {};

    const errorValidacion = validarProducto({ nombre, precio, dimensions, envio });
    if (errorValidacion) {
      return res.status(400).json({ error: errorValidacion });
    }

    const producto = new Producto({
      empresaId,
      nombre: String(nombre).trim(),
      precio: Number(precio),
      fotoUrl: String(fotoUrl || ''),
      extras: limpiarExtras(extras),
      envio: normalizarEnvio(envio),
      dimensions: normalizarDimensiones(dimensions)
    });

    await producto.save();
    return res.status(201).json({ ok: true, producto });
  } catch (error) {
    console.error('Error al crear producto:', error);
    return res.status(500).json({ error: 'Error interno al crear producto' });
  }
}

async function actualizarProducto(req, res) {
  try {
    const empresaId = req.empresaId;
    if (!empresaId) {
      return res.status(403).json({ error: 'No se pudo identificar la empresa' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID de producto inválido' });
    }

    const producto = await Producto.findOne({ _id: req.params.id, empresaId });
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const { nombre, precio, fotoUrl, extras, envio, dimensions } = req.body || {};

    const errorValidacion = validarProducto({ nombre, precio, dimensions, envio });
    if (errorValidacion) {
      return res.status(400).json({ error: errorValidacion });
    }

    // Asignamos campo por campo y guardamos con .save() para que corran
    // los validadores del schema (por ejemplo el de envio.costo).
    producto.nombre = String(nombre).trim();
    producto.precio = Number(precio);
    if (fotoUrl !== undefined) producto.fotoUrl = String(fotoUrl || '');
    producto.extras = limpiarExtras(extras);
    producto.envio = normalizarEnvio(envio);
    producto.dimensions = normalizarDimensiones(dimensions);

    await producto.save();
    return res.json({ ok: true, producto });
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    return res.status(500).json({ error: 'Error interno al actualizar producto' });
  }
}

async function eliminarProducto(req, res) {
  try {
    const empresaId = req.empresaId;
    if (!empresaId) {
      return res.status(403).json({ error: 'No se pudo identificar la empresa' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID de producto inválido' });
    }

    const producto = await Producto.findOneAndDelete({ _id: req.params.id, empresaId });
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    return res.json({ ok: true, eliminado: producto._id });
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    return res.status(500).json({ error: 'Error interno al eliminar producto' });
  }
}

module.exports = {
  listarProductos,
  obtenerProducto,
  crearProducto,
  actualizarProducto,
  eliminarProducto
};
