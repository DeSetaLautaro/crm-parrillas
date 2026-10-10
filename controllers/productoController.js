const mongoose = require('mongoose');
const Producto = require('../models/Producto');

const TIPOS_ENVIO = ['gratis', 'a_consultar', 'fijo'];
const MAX_FOTOS = 5;

// Normaliza el bloque de envío: tipo válido y costo 0 salvo que sea fijo.
function normalizarEnvio(envio) {
  const tipo = envio && TIPOS_ENVIO.includes(envio.tipo) ? envio.tipo : 'a_consultar';
  if (tipo !== 'fijo') return { tipo, costo: 0 };
  return { tipo, costo: Number(envio.costo) || 0 };
}

// Genera el texto de medidas que ve el cliente, a partir de los números cargados.
// Formato: "60x40 y 80 de alto, emparrillado 50x35"
function generarDisplayString(d) {
  const partes = [];

  if (Number.isFinite(d.widthCm) && Number.isFinite(d.depthCm)) {
    let base = `${d.widthCm}x${d.depthCm}`;
    if (Number.isFinite(d.heightCm)) base += ` y ${d.heightCm} de alto`;
    partes.push(base);
  } else if (Number.isFinite(d.heightCm)) {
    partes.push(`${d.heightCm} de alto`);
  } else if (Number.isFinite(d.widthCm)) {
    partes.push(`${d.widthCm} de ancho`);
  } else if (Number.isFinite(d.depthCm)) {
    partes.push(`${d.depthCm} de profundidad`);
  } else if (Number.isFinite(d.diametroCm)) {
    partes.push(`Ø ${d.diametroCm}`);
  }

  if (Number.isFinite(d.emparrilladoWidthCm) && Number.isFinite(d.emparrilladoDepthCm)) {
    partes.push(`emparrillado ${d.emparrilladoWidthCm}x${d.emparrilladoDepthCm}`);
  }

  return partes.join(', ');
}

// Convierte a número los campos de medidas, dejando undefined los que vienen vacíos.
// El displayString se calcula acá y nunca se toma del body.
function normalizarDimensiones(dimensions) {
  const d = dimensions || {};
  const numero = (valor) => {
    if (valor === '' || valor === null || valor === undefined) return undefined;
    const n = Number(valor);
    return Number.isNaN(n) ? undefined : n;
  };
  const normalizado = {
    widthCm: numero(d.widthCm),
    depthCm: numero(d.depthCm),
    heightCm: numero(d.heightCm),
    diametroCm: numero(d.diametroCm),
    emparrilladoWidthCm: numero(d.emparrilladoWidthCm),
    emparrilladoDepthCm: numero(d.emparrilladoDepthCm)
  };
  normalizado.displayString = generarDisplayString(normalizado);
  return normalizado;
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
  if (datos.envio && datos.envio.tipo === 'fijo' && !(Number(datos.envio.costo) > 0)) {
    return 'Si el envío es fijo, el costo debe ser mayor a 0';
  }
  return null;
}

function limpiarExtras(extras) {
  if (!Array.isArray(extras)) return [];
  return extras.map(e => String(e).trim()).filter(Boolean);
}

// Normaliza la lista de fotos de una parrilla (máximo 5).
// Acepta el array nuevo `fotos` o, como fallback, el `fotoUrl` viejo (una sola).
function normalizarFotos({ fotos, fotoUrl } = {}) {
  let lista = [];
  if (Array.isArray(fotos)) {
    lista = fotos.map(f => String(f || '').trim()).filter(Boolean);
  }
  if (lista.length === 0 && fotoUrl) {
    const f = String(fotoUrl).trim();
    if (f) lista = [f];
  }
  return lista.slice(0, MAX_FOTOS);
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

    const { nombre, precio, fotoUrl, fotos, extras, envio, dimensions, fbAdId } = req.body || {};

    const errorValidacion = validarProducto({ nombre, precio, dimensions, envio });
    if (errorValidacion) {
      return res.status(400).json({ error: errorValidacion });
    }

    const fotosNormalizadas = normalizarFotos({ fotos, fotoUrl });
    const producto = new Producto({
      empresaId,
      nombre: String(nombre).trim(),
      precio: Number(precio),
      fotos: fotosNormalizadas,
      fotoUrl: fotosNormalizadas[0] || '',
      fbAdId: String(fbAdId || '').trim(),
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

    const { nombre, precio, fotoUrl, fotos, extras, envio, dimensions, fbAdId } = req.body || {};

    const errorValidacion = validarProducto({ nombre, precio, dimensions, envio });
    if (errorValidacion) {
      return res.status(400).json({ error: errorValidacion });
    }

    // Asignamos campo por campo y guardamos con .save() para que corran
    // los validadores del schema (por ejemplo el de envio.costo).
    producto.nombre = String(nombre).trim();
    producto.precio = Number(precio);
    if (fotos !== undefined || fotoUrl !== undefined) {
      const fotosNormalizadas = normalizarFotos({ fotos, fotoUrl });
      producto.fotos = fotosNormalizadas;
      producto.fotoUrl = fotosNormalizadas[0] || '';
    }
    if (fbAdId !== undefined) producto.fbAdId = String(fbAdId || '').trim();
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

// Sube una foto de producto y devuelve la ruta relativa para guardar en fotoUrl.
async function subirFotoProducto(req, res) {
  try {
    const archivos = Array.isArray(req.files) ? req.files : (req.file ? [req.file] : []);
    if (archivos.length === 0) {
      return res.status(400).json({ error: 'No se recibió archivo' });
    }
    const empresaId = req.empresaId;
    if (!empresaId) {
      return res.status(403).json({ error: 'No se pudo identificar la empresa' });
    }
    const fotos = archivos.slice(0, MAX_FOTOS).map(f => `/uploads/${empresaId}/${f.filename}`);
    return res.status(201).json({ ok: true, fotos, fotoUrl: fotos[0] || '' });
  } catch (error) {
    console.error('Error al subir foto de producto:', error);
    return res.status(500).json({ error: 'Error interno al subir la foto' });
  }
}

module.exports = {
  listarProductos,
  obtenerProducto,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  subirFotoProducto
};
