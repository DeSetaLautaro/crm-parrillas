const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const {
  obtenerPedidosPorTelefono,
  confirmarPedido,
  actualizarEstadoPedido
} = require('../controllers/pedidosController');

// Confirmar un pedido (llamado cuando el bot confirma una orden)
router.post('/', auth, confirmarPedido);

// Obtener pedidos de un cliente por número de teléfono
router.get('/cliente/:telefono', auth, obtenerPedidosPorTelefono);

// Actualizar estado de un pedido (en preparación, en camino, entregado, cancelado, etc.)
router.patch('/:id/estado', auth, actualizarEstadoPedido);

module.exports = router;
