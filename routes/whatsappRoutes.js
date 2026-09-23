const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ============================================================
// Validación de tipo real de archivo (magic numbers)
// ============================================================
function detectarTipoReal(buffer) {
  // Devuelve un string con el tipo real detectado o null
  const b = buffer;
  if (!b || b.length < 4) return null;

  // JPEG
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif';
  // WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  // OGG
  if (b[0] === 0x4F && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return 'ogg';
  // MP3 (ID3)
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return 'mp3';
  // MP4 / M4A / MOV (ftyp)
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'mp4';
  // AMR
  if (b[0] === 0x23 && b[1] === 0x21 && b[2] === 0x41 && b[3] === 0x4D && b[4] === 0x52) return 'amr';
  // WAV
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45) return 'wav';
  // PDF
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2D) return 'pdf';
  // DOCX / XLSX (ZIP)
  if (b[0] === 0x50 && b[1] === 0x4B) {
    const str = b.toString('latin1').slice(0, 512);
    if (str.includes('word/')) return 'docx';
    if (str.includes('xl/')) return 'xlsx';
    return 'zip';
  }
  return null;
}

async function validarArchivoReal(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió archivo' });
  }
  try {
    const fd = await fs.promises.open(req.file.path, 'r');
    const buffer = Buffer.alloc(512);
    await fd.read(buffer, 0, 512, 0);
    await fd.close();

    const tipoReal = detectarTipoReal(buffer);
    const extReal = tipoReal || '';
    const tiposPermitidosReales = ['jpeg','png','gif','webp','ogg','mp3','mp4','amr','wav','pdf','docx','xlsx'];
    if (!tiposPermitidosReales.includes(extReal)) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'Tipo de archivo real no permitido' });
    }

    // Extensión real detectada (normalizamos a .jpg por convención)
    const extAReal = extReal === 'jpeg' ? '.jpg' : `.${extReal}`;
    if (!req.file.path.toLowerCase().endsWith(extAReal)) {
      const nuevoPath = req.file.path.replace(/\.[^/.]+$/, extAReal);
      await fs.promises.rename(req.file.path, nuevoPath);
      req.file.path = nuevoPath;
      req.file.filename = path.basename(nuevoPath);
    }

    next();
  } catch (error) {
    console.error('Error al validar archivo:', error);
    await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(500).json({ error: 'Error al validar archivo' });
  }
}

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const empresaId = String(req.empresaId || (req.empresas && req.empresas[0]) || 'sin-empresa');
    if (!empresaId || empresaId === 'sin-empresa') {
      return cb(new Error('No se pudo identificar la empresa'));
    }
    const dir = path.join(uploadDir, empresaId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function(req, file, cb) {
    const ext = path.extname(file.originalname);
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const tiposPermitidos = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'audio/ogg',
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/amr',
      'audio/wav',
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (tiposPermitidos.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error('Tipo de archivo no permitido. Solo se permiten imágenes, audio, video, PDF, Word o Excel.');
      err.status = 400;
      cb(err, false);
    }
  }
});

const auth = require('../middlewares/auth');
const {
  limitarEnvioMensaje,
  limitarEnvioMedia,
  limitarReenvio,
  limitarCrearPedido
} = require('../middlewares/rateLimiters');
const { loginConPin } = require('../controllers/authController');
const {
  verificarFirmaMeta,
  verificarWebhook,
  recibirMensaje,
  enviarMensaje,
  enviarMensajeMedia,
  enviarPlantilla,
  reenviarMensaje,
  actualizarBotActivo,
  actualizarBotActivoConversacion,
  actualizarContacto,
  subirFotoContacto,
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
} = require('../controllers/whatsappController');

// Verificación del webhook (GET)
router.get('/webhook', verificarWebhook);

// Recepción de mensajes entrantes (POST)
router.post('/webhook', verificarFirmaMeta, recibirMensaje);

// Login con PIN para acceder al CRM
router.post('/login-pin', loginConPin);

// Obtener uso de conversaciones en las últimas 24 h
router.get('/uso-conversaciones', auth, obtenerUsoConversaciones);
router.get('/meta/actualizar-costos', auth, actualizarCostosManual);

// Crear contacto manualmente desde el panel
router.post('/contactos', auth, crearContactoManual);

// Envío de mensaje desde el dashboard (POST)
router.post('/enviar', auth, limitarEnvioMensaje, enviarMensaje);

// Envío de multimedia desde el dashboard (POST)
router.post('/enviar-media', auth, limitarEnvioMedia, (req, res, next) => {
  const empresaId = req.empresaId || (req.empresas && req.empresas[0]);
  if (!empresaId) {
    return res.status(403).json({ error: 'No se pudo identificar la empresa' });
  }
  req.empresaId = String(empresaId);
  next();
}, upload.single('archivo'), validarArchivoReal, enviarMensajeMedia);
router.post('/enviar-plantilla', auth, enviarPlantilla);

// Reenviar mensaje fallido (POST)
router.post('/reenviar/:mensajeId', auth, limitarReenvio, reenviarMensaje);

// Actualización del estado botActivo de la empresa (PUT)
router.put('/bot-activo', auth, actualizarBotActivo);
router.put('/conversacion/:id/bot-activo', auth, actualizarBotActivoConversacion);

// Actualización de datos manuales de un cliente (PUT)
router.put('/contacto/:contactoId', auth, actualizarContacto);
router.put('/contacto/:contactoId/foto', auth, (req, res, next) => {
  const empresaId = req.empresaId || (req.empresas && req.empresas[0]);
  if (!empresaId) {
    return res.status(403).json({ error: 'No se pudo identificar la empresa' });
  }
  req.empresaId = String(empresaId);
  next();
}, upload.single('foto'), validarArchivoReal, subirFotoContacto);

// Obtener pedido en curso / último pedido de una conversación (GET)
router.get('/conversacion/:conversacionId/pedido-activo', auth, obtenerPedidoActivo);

// Marcar conversación como atendida (PUT)
router.put('/conversacion/:id/atender', auth, marcarAtendido);

// Reabrir conversación atendida (PUT)
router.put('/conversacion/:id/reabrir', auth, reabrirConversacion);

// Agregar etiqueta a un contacto (POST)
router.post('/contacto/:contactoId/etiquetas', auth, agregarEtiqueta);

// Eliminar etiqueta de un contacto (DELETE)
router.delete('/contacto/:contactoId/etiquetas/:etiqueta', auth, eliminarEtiqueta);

// Agregar nota interna a un contacto (POST)
router.post('/contacto/:contactoId/notas', auth, agregarNota);

// Eliminar nota interna de un contacto (DELETE)
router.delete('/contacto/:contactoId/notas/:nota', auth, eliminarNota);

// Bloquear cliente (PUT)
router.put('/contacto/:contactoId/bloquear', auth, bloquearCliente);

// Desbloquear cliente (PUT)
router.put('/contacto/:contactoId/desbloquear', auth, desbloquearCliente);

// Generar pedido manualmente desde el panel (analiza la conversación con IA)
router.post('/generar-pedido', auth, limitarCrearPedido, generarPedidoManual);

// Obtener configuración actual (prompt, atajos, estado, bienvenida)
router.get('/config', auth, obtenerConfig);

// Actualizar configuración general (foto, estado, prompt y atajos)
router.put('/config', auth, upload.single('foto'), actualizarConfig);

// ===== Monedero =====
router.get('/plantillas', auth, obtenerPlantillas);
router.get('/monedero', auth, obtenerMonedero);
router.post('/admin/monedero/cargar', auth, cargarSaldoMonedero);

module.exports = router;

