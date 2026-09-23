const Mensaje = require('../models/Mensaje');
const Conversacion = require('../models/Conversacion');
const Empresa = require('../models/Empresa');
const Cliente = require('../models/Cliente');

// Intentamos importar la función de envío de Meta. Si el controlador aún no la exporta,
// lo dejamos en null para no romper el servidor.
let enviarMensajeMeta = null;
try {
  ({ enviarMensajeMeta } = require('../controllers/whatsappController'));
} catch (e) {
  console.warn('⚠️ No se pudo importar enviarMensajeMeta desde whatsappController, reintentos automáticos desactivados.');
}

const MAX_INTENTOS = 5;

async function procesarReintentos(io) {
  const ahora = new Date();
  const pendientes = await Mensaje.find({
    estado: 'fallido',
    intentosReintento: { $lt: MAX_INTENTOS },
    $or: [
      { proximoReintento: null },
      { proximoReintento: { $lte: ahora } }
    ]
  }).limit(20);

  for (const mensaje of pendientes) {
    // Si no tiene programado, lo programamos para ahora
    if (!mensaje.proximoReintento) {
      mensaje.proximoReintento = ahora;
    }

    const conversacion = await Conversacion.findById(mensaje.conversacionId);
    if (!conversacion) continue;
    const empresa = await Empresa.findById(conversacion.empresaId);
    if (!empresa) continue;

    const cliente = await Cliente.findById(conversacion.contactoId);
    if (!cliente || !cliente.telefono) {
      console.warn('⚠️ Cliente no encontrado para reintento de mensaje', mensaje._id);
      continue;
    }

    if (!enviarMensajeMeta) {
      console.warn('⚠️ enviarMensajeMeta no definido, omitiendo reintento para mensaje', mensaje._id);
      continue;
    }

    const resultado = await enviarMensajeMeta(empresa, cliente.telefono, mensaje.contenido);

    if (resultado.ok) {
      mensaje.estado = 'enviado';
      mensaje.intentosReintento = 0;
      mensaje.proximoReintento = null;
      mensaje.ultimoError = '';
      await mensaje.save();

      if (io) {
        io.to(empresa._id.toString()).emit('mensaje-estado', {
          mensajeId: mensaje._id,
          conversacionId: conversacion._id,
          estado: 'enviado',
          fechaEstado: new Date()
        });
      }
    } else {
      mensaje.intentosReintento++;
      const delayBase = Math.pow(2, mensaje.intentosReintento) * 1000;
      let delayMs = delayBase;
      if (resultado.retryAfter) {
        const retry = parseInt(resultado.retryAfter, 10);
        if (!isNaN(retry) && retry > 0) {
          delayMs = retry * 1000;
        }
      }
      mensaje.proximoReintento = new Date(Date.now() + delayMs);
      mensaje.ultimoError = typeof resultado.error === 'string'
        ? resultado.error.slice(0, 200)
        : JSON.stringify(resultado.error).slice(0, 200);
      await mensaje.save();

      if (io) {
        io.to(empresa._id.toString()).emit('mensaje-estado', {
          mensajeId: mensaje._id,
          conversacionId: conversacion._id,
          estado: 'fallido',
          fechaEstado: new Date(),
          errorDetalle: mensaje.ultimoError
        });
      }
    }
  }
}

module.exports = { procesarReintentos };
