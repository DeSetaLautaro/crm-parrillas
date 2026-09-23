const cron = require('node-cron');
const Empresa = require('../models/Empresa');

function obtenerDiaActual() {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return dias[new Date().getDay()];
}

function obtenerHoraActual() {
  const ahora = new Date();
  const horas = String(ahora.getHours()).padStart(2, '0');
  const minutos = String(ahora.getMinutes()).padStart(2, '0');
  return `${horas}:${minutos}`;
}

async function ejecutarActualizacionHorarios() {
  const diaActual = obtenerDiaActual();
  const horaActual = obtenerHoraActual();

  try {
    const empresas = await Empresa.find({
      horariosEstructurados: {
        $elemMatch: {
          dia: { $regex: new RegExp('^' + diaActual + '$', 'i') },
          $or: [
            { apertura: horaActual },
            { cierre: horaActual }
          ]
        }
      }
    });

    for (const empresa of empresas) {
      const horario = empresa.horariosEstructurados.find(h =>
        h.dia && h.dia.toLowerCase() === diaActual &&
        (h.apertura === horaActual || h.cierre === horaActual)
      );

      if (!horario) continue;

      if (horario.apertura === horaActual) {
        empresa.abierto = true;
        console.log(`[${horaActual}] Empresa ${empresa.nombre} ha ABIERTO automáticamente`);
      } else if (horario.cierre === horaActual) {
        empresa.abierto = false;
        console.log(`[${horaActual}] Empresa ${empresa.nombre} ha CERRADO automáticamente`);
      } else {
        continue;
      }

      await empresa.save();
    }
  } catch (error) {
    console.error('Error en la actualización automática de horarios:', error);
  }
}

function iniciarCronHorarios() {
  cron.schedule('* * * * *', ejecutarActualizacionHorarios);
  console.log('🕐 Cron de horarios iniciado (cada minuto)');
}

module.exports = { iniciarCronHorarios, ejecutarActualizacionHorarios };
