const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth');
const {
  listarProductos,
  obtenerProducto,
  crearProducto,
  actualizarProducto,
  eliminarProducto
} = require('../controllers/productoController');

// Todas las rutas exigen JWT y filtran por la empresa del usuario
router.get('/', auth, listarProductos);
router.get('/:id', auth, obtenerProducto);
router.post('/', auth, crearProducto);
router.put('/:id', auth, actualizarProducto);
router.delete('/:id', auth, eliminarProducto);

module.exports = router;
