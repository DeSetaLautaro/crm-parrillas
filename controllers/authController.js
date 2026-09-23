const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Empresa = require('../models/Empresa');
const Usuario = require('../models/usuario');
const { registrarAuditoria } = require('../services/auditoriaService');

const loginConPin = async (req, res) => {
  try {
    const { telefono, pin } = req.body || {};

    if (!telefono || typeof telefono !== 'string' || telefono.trim() === '') {
      return res.status(400).json({ error: 'El teléfono de WhatsApp es obligatorio' });
    }
    if (telefono.length > 30) {
      return res.status(400).json({ error: 'El teléfono no puede superar los 30 caracteres' });
    }
    if (!pin || typeof pin !== 'string' || pin.trim() === '') {
      return res.status(400).json({ error: 'El PIN es obligatorio' });
    }
    if (pin.length > 20) {
      return res.status(400).json({ error: 'El PIN no puede superar los 20 caracteres' });
    }

    // 1. Buscar el Usuario por su número de WhatsApp (teléfono)
    const usuario = await Usuario.findOne({ telefono: telefono.trim() });
    if (!usuario) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    console.log("nombre usuario", usuario.nombre);
    console.log("pin usuario", usuario.pinCrm);
    
    // 2. Verificar el PIN hasheado del usuario
    const pinValido = await bcrypt.compare(pin.trim(), usuario.pinCrm);
    console.log("hash", pinValido);
    if (!pinValido) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // 3. Buscar TODAS las empresas (líneas de WhatsApp) del usuario según su rol
    let empresasIds = [];
    if (usuario.rol === 'agente') {
      if (usuario.activo === false) {
        return res.status(403).json({ error: 'Usuario desactivado' });
      }
      const acceso = usuario.empresasAcceso || [];
      const empresasAcceso = await Empresa.find({ _id: { $in: acceso } }).lean();
      empresasIds = empresasAcceso.map(e => e._id.toString());
      if (empresasIds.length === 0) {
        return res.status(403).json({ error: 'No tenés líneas asignadas' });
      }
    } else {
      const empresas = await Empresa.find({ usuarioAppId: usuario._id.toString() }).lean();
      empresasIds = empresas.map(e => e._id.toString());
      if (empresasIds.length === 0) {
        return res.status(404).json({ error: 'El usuario no tiene líneas de WhatsApp asociadas' });
      }
    }

    // 4. Generar token con los datos necesarios
    const token = jwt.sign(
      {
        userId: usuario._id.toString(),
        empresaId: empresasIds[0],
        empresas: empresasIds,
        email: usuario.email,
        rol: usuario.rol,
        adminId: usuario.adminId ? usuario.adminId.toString() : null
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    await registrarAuditoria(req, empresasIds[0] || null, 'login_pin', `Login con PIN del usuario ${usuario.nombre}`, { usuarioId: usuario._id.toString(), rol: usuario.rol, empresas: empresasIds });

    return res.json({
      ok: true,
      token,
      usuario: {
        id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email,
        nombreDelLocal: usuario.nombreDelLocal,
        rubro: usuario.rubro || '',
        rol: usuario.rol,
        adminId: usuario.adminId ? usuario.adminId.toString() : null,
        empresasAcceso: (usuario.empresasAcceso || []).map(e => e.toString())
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ error: 'Error interno al iniciar sesión' });
  }
};

module.exports = { loginConPin };
