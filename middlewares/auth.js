const jwt = require('jsonwebtoken');
const Usuario = require('../models/usuario');
const Empresa = require('../models/Empresa');

/**
 * Middleware de autenticación basado en JWT.
 * Carga las empresas según el rol del usuario:
 * - admin: todas sus empresas (usuarioAppId)
 * - agente: solo las asignadas en empresasAcceso
 */
module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const tokenHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tokenQuery = req.query.token || null;
  const token = tokenHeader || tokenQuery || null;

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = payload;
    req.usuario.id = payload.userId || payload.id || payload._id || payload.sub;

    if (!req.usuario.id) {
      return res.status(403).json({ error: 'El token no contiene un identificador de usuario válido' });
    }

    // Buscar el usuario fresco en BD para obtener rol, activo y accesos
    const usuario = await Usuario.findById(req.usuario.id).lean();
    if (!usuario) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    if (usuario.activo === false) {
      return res.status(403).json({ error: 'Usuario desactivado' });
    }

    let empresas = [];
    if (usuario.rol === 'admin') {
      empresas = await Empresa.find({ usuarioAppId: usuario._id.toString() }).lean();
    } else if (usuario.rol === 'agente') {
      const idsAcceso = usuario.empresasAcceso || [];
      empresas = await Empresa.find({ _id: { $in: idsAcceso } }).lean();
      if (empresas.length === 0) {
        return res.status(403).json({ error: 'No tenés líneas asignadas' });
      }
    } else {
      return res.status(403).json({ error: 'Rol inválido' });
    }

    req.empresas = empresas.map(e => e._id.toString());
    req.empresaId = req.empresas[0] || null;
    req.parrillaId = req.empresaId;
    req.usuario.rol = usuario.rol;
    req.usuario.adminId = usuario.adminId || null;

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};
