const express = require('express');
const router = express.Router();
const {
  listarAgentes,
  crearAgente,
  actualizarAgente,
  desactivarAgente
} = require('../controllers/agentesController');

// Todas las rutas usan auth y verifican rol admin dentro del controlador
router.get('/', listarAgentes);
router.post('/', crearAgente);
router.put('/:id', actualizarAgente);
router.delete('/:id', desactivarAgente);

module.exports = router;
