const rateLimit = require('express-rate-limit');

function crearLimiterUsuario(windowMs, max) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.usuario?.id || req.ip
  });
}

module.exports = {
  limitarEnvioMensaje: crearLimiterUsuario(60 * 1000, 60),
  limitarEnvioMedia: crearLimiterUsuario(60 * 1000, 20),
  limitarEnvioDifusion: crearLimiterUsuario(60 * 1000, 5),
  limitarReenvio: crearLimiterUsuario(60 * 1000, 30),
  limitarCrearPedido: crearLimiterUsuario(60 * 1000, 30)
};
