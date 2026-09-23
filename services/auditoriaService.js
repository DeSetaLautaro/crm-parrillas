const AuditLog = require('../models/AuditLog');

async function registrarAuditoria(req, empresaId, accion, descripcion, metadata = {}) {
  try {
    const usuario = req.usuario || {};
    const ip = req.ip || (req.connection && req.connection.remoteAddress) || '';
    await AuditLog.create({
      empresaId: empresaId || null,
      usuarioId: usuario.id ? String(usuario.id) : '',
      usuarioNombre: (usuario.nombre || usuario.nombreDelLocal || '').toString(),
      rol: usuario.rol || '',
      accion,
      descripcion,
      metadata,
      ip
    });
  } catch (error) {
    console.error('Error al registrar auditoría:', error);
  }
}

module.exports = { registrarAuditoria };
