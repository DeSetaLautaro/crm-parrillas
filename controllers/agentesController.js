const Usuario = require('../models/usuario');
const Empresa = require('../models/Empresa');
const { registrarAuditoria } = require('../services/auditoriaService');

// GET /api/admin/agentes
async function listarAgentes(req, res) {
  try {
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo admin' });
    }
    const adminId = req.usuario.id;
    const agentes = await Usuario.find({ rol: 'agente', adminId }).lean();
    const resultado = agentes.map(a => ({
      _id: a._id,
      nombre: a.nombre,
      telefono: a.telefono,
      email: a.email,
      empresasAcceso: a.empresasAcceso || [],
      activo: a.activo,
      fechaRegistro: a.fechaRegistro
    }));
    return res.json({ ok: true, agentes: resultado });
  } catch (error) {
    console.error('Error listando agentes:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
}

// POST /api/admin/agentes
async function crearAgente(req, res) {
  try {
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo admin' });
    }
    const { nombre, telefono, pin, empresasAcceso = [] } = req.body || {};
    if (!nombre || !telefono || !pin) {
      return res.status(400).json({ error: 'Faltan datos: nombre, telefono y pin son obligatorios' });
    }

    // Validar que las empresas asignadas pertenezcan al admin
    const empresasValidas = await Empresa.find({
      _id: { $in: empresasAcceso },
      usuarioAppId: req.usuario.id.toString()
    }).lean();
    const idsValidos = empresasValidas.map(e => e._id.toString());

    // Generar email único (el modelo lo requiere)
    const email = `agente_${String(telefono).replace(/\D/g, '')}@local.local`;

    // Verificar que no exista un agente con ese teléfono
    const existente = await Usuario.findOne({ telefono: telefono.trim() });
    if (existente) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese teléfono' });
    }

    const agente = new Usuario({
      nombre,
      telefono: telefono.trim(),
      email,
      password: pin,
      pinCrm: pin,
      rol: 'agente',
      adminId: req.usuario.id,
      empresasAcceso: idsValidos,
      nombreDelLocal: nombre,
      slug: `agente-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      activo: true
    });
    await agente.save();
    await registrarAuditoria(req, req.usuario.id, 'agente_creado', `Se creó el agente ${nombre}`, { agenteId: agente._id, telefono: agente.telefono, empresasAcceso: idsValidos });

    return res.status(201).json({
      ok: true,
      agente: {
        _id: agente._id,
        nombre,
        telefono: agente.telefono,
        email,
        empresasAcceso: idsValidos,
        activo: true
      }
    });
  } catch (error) {
    console.error('Error creando agente:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
}

// PUT /api/admin/agentes/:id
async function actualizarAgente(req, res) {
  try {
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo admin' });
    }
    const { id } = req.params;
    const { nombre, telefono, pin, empresasAcceso, activo } = req.body || {};

    const agente = await Usuario.findOne({ _id: id, rol: 'agente', adminId: req.usuario.id });
    if (!agente) {
      return res.status(404).json({ error: 'Agente no encontrado' });
    }

    if (nombre) agente.nombre = nombre;
    if (telefono) agente.telefono = telefono;
    if (pin) agente.pinCrm = pin;
    if (Array.isArray(empresasAcceso)) {
      const empresasValidas = await Empresa.find({
        _id: { $in: empresasAcceso },
        usuarioAppId: req.usuario.id.toString()
      }).lean();
      agente.empresasAcceso = empresasValidas.map(e => e._id.toString());
    }
    if (typeof activo === 'boolean') agente.activo = activo;
    await agente.save();
    await registrarAuditoria(req, req.usuario.id, 'agente_actualizado', `Se actualizó el agente ${agente.nombre}`, { agenteId: agente._id, cambios: req.body });

    return res.json({
      ok: true,
      agente: {
        _id: agente._id,
        nombre: agente.nombre,
        telefono: agente.telefono,
        email: agente.email,
        empresasAcceso: agente.empresasAcceso,
        activo: agente.activo
      }
    });
  } catch (error) {
    console.error('Error actualizando agente:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
}

// DELETE /api/admin/agentes/:id (desactiva, no borra)
async function desactivarAgente(req, res) {
  try {
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo admin' });
    }
    const { id } = req.params;
    const agente = await Usuario.findOne({ _id: id, rol: 'agente', adminId: req.usuario.id });
    if (!agente) {
      return res.status(404).json({ error: 'Agente no encontrado' });
    }
    agente.activo = false;
    await agente.save();
    await registrarAuditoria(req, req.usuario.id, 'agente_desactivado', `Se desactivó el agente ${agente.nombre}`, { agenteId: agente._id });
    return res.json({ ok: true, desactivado: true });
  } catch (error) {
    console.error('Error desactivando agente:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
}

module.exports = {
  listarAgentes,
  crearAgente,
  actualizarAgente,
  desactivarAgente
};
