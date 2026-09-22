const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

function crearLimiterUsuario(windowMs, max) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Para usuarios autenticados usamos su id; para el resto, el helper
    // ipKeyGenerator agrupa las IPv6 por subred y evita el bypass por rotación.
    keyGenerator: (req) => req.usuario?.id || ipKeyGenerator(req.ip)
  });
}

module.exports = {
  limitarEnvioMensaje: crearLimiterUsuario(60 * 1000, 60),
  limitarEnvioMedia: crearLimiterUsuario(60 * 1000, 20),
  limitarEnvioDifusion: crearLimiterUsuario(60 * 1000, 5),
  limitarReenvio: crearLimiterUsuario(60 * 1000, 30),
  limitarCrearPedido: crearLimiterUsuario(60 * 1000, 30)
};
