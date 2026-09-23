const fs = require('fs');
const path = require('path');

// Niveles: error 0, warn 1, info 2, debug 3
const niveles = { error: 0, warn: 1, info: 2, debug: 3 };
const NIVEL_CONFIGURADO = (process.env.LOG_LEVEL || 'info').toLowerCase();
const nivelUmbral = niveles[NIVEL_CONFIGURADO] ?? niveles.info;

const DIR_LOGS = path.join(__dirname, 'logs');
if (!fs.existsSync(DIR_LOGS)) {
  fs.mkdirSync(DIR_LOGS, { recursive: true });
}

let streamActual = null;
let fechaActual = null;

function obtenerStream() {
  const hoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  if (fechaActual !== hoy || !streamActual || streamActual.destroyed) {
    if (streamActual && !streamActual.destroyed) {
      streamActual.end();
    }
    fechaActual = hoy;
    streamActual = fs.createWriteStream(path.join(DIR_LOGS, `${hoy}.log`), { flags: 'a' });
  }
  return streamActual;
}

function crearEntrada(level, msg, meta = {}) {
  return {
    timestamp: new Date().toISOString(),
    level,
    message: msg,
    ...(meta && Object.keys(meta).length ? meta : {})
  };
}

function formatearEntrada(level, msg, meta) {
  return JSON.stringify(crearEntrada(level, msg, meta)) + '\n';
}

async function enviarWebhook(level, entrada) {
  const url = process.env.LOG_WEBHOOK_URL;
  if (!url) return;
  const nivelWebhook = (process.env.LOG_WEBHOOK_LEVEL || 'warn').toLowerCase();
  if (niveles[level] > (niveles[nivelWebhook] ?? niveles.warn)) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entrada)
    });
  } catch (e) {
    // Nunca romper el flujo por un error de webhook
    console.error('Error al enviar log al webhook:', e.message);
  }
}

function log(level, msg, meta = {}) {
  if (niveles[level] > nivelUmbral) return;

  const entrada = crearEntrada(level, msg, meta);
  const timestamp = entrada.timestamp;

  // Consola
  if (meta && Object.keys(meta).length) {
    console[level](`[${timestamp}] ${level.toUpperCase()}: ${msg}`, meta);
  } else {
    console[level](`[${timestamp}] ${level.toUpperCase()}: ${msg}`);
  }

  // Archivo con rotación diaria
  try {
    const stream = obtenerStream();
    stream.write(formatearEntrada(level, msg, meta));
  } catch (e) {
    console.error('Error escribiendo log a archivo:', e.message);
  }

  // Webhook opcional (Sentry, Logtail, Datadog, etc.)
  enviarWebhook(level, entrada);
}

module.exports = {
  error: (msg, meta) => log('error', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta)
};
