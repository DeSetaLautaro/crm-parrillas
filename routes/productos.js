const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const auth = require('../middlewares/auth');
const {
  listarProductos,
  obtenerProducto,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  subirFotoProducto
} = require('../controllers/productoController');

// ===== Multer para subir fotos de productos =====
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const empresaId = req.empresaId || (req.empresas && req.empresas[0]);
    if (!empresaId) {
      return cb(new Error('No se pudo identificar la empresa'));
    }
    const dir = path.join(uploadDir, String(empresaId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `producto-${unique}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(null, true);
    }
    const err = new Error('Solo se permiten imágenes JPG, PNG, WEBP o GIF');
    err.status = 400;
    cb(err, false);
  }
});

// Asegura que req.empresaId esté seteado antes de correr multer
function asegurarEmpresa(req, res, next) {
  const empresaId = req.empresaId || (req.empresas && req.empresas[0]);
  if (!empresaId) {
    return res.status(403).json({ error: 'No se pudo identificar la empresa' });
  }
  req.empresaId = String(empresaId);
  next();
}

// Subir foto de producto. Devuelve la ruta relativa para guardar en fotoUrl.
// Va antes de las rutas con :id para que /subir-foto no matchee con /:id.
router.post('/subir-foto', auth, asegurarEmpresa, upload.single('foto'), subirFotoProducto);

// Todas las rutas exigen JWT y filtran por la empresa del usuario
router.get('/', auth, listarProductos);
router.get('/:id', auth, obtenerProducto);
router.post('/', auth, crearProducto);
router.put('/:id', auth, actualizarProducto);
router.delete('/:id', auth, eliminarProducto);

module.exports = router;
