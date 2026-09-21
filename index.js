require('dotenv').config();
const logger = require('./logger');

// Verificar variables críticas antes de arrancar
const esProduccion = process.env.NODE_ENV === 'production';

const variablesObligatorias = [
  'JWT_SECRET',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'MONGODB_URI'
];

if (esProduccion) {
  variablesObligatorias.push('GEMINI_API_KEY');
}

const faltantes = variablesObligatorias.filter(v => !process.env[v]);
if (faltantes.length > 0) {
  logger.error(`❌ Faltan variables de entorno obligatorias: ${faltantes.join(', ')}`);
  process.exit(1);
}

// Validaciones semánticas adicionales
if (esProduccion) {
  const cors = process.env.CORS_ORIGIN;
  if (!cors || cors === '*') {
    logger.error('❌ En producción debés configurar CORS_ORIGIN con dominios específicos (no "*").');
    process.exit(1);
  }
  const origenes = cors.split(',').map(s => s.trim()).filter(Boolean);
  if (origenes.length === 0 || origenes.some(o => !/^https?:\/\//.test(o))) {
    logger.error('❌ CORS_ORIGIN debe ser una lista de URLs válidas separadas por coma (ej: https://panel.midominio.com).');
    process.exit(1);
  }
}

if (process.env.MONGODB_URI && !/^mongodb(\+srv)?:\/\//.test(process.env.MONGODB_URI)) {
  logger.error('❌ MONGODB_URI debe comenzar con mongodb:// o mongodb+srv://');
  process.exit(1);
}

const nivelesLog = ['error', 'warn', 'info', 'debug'];
const logLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
if (!nivelesLog.includes(logLevel)) {
  logger.warn(`⚠️ LOG_LEVEL "${process.env.LOG_LEVEL}" no es válido, se usará "info".`);
  process.env.LOG_LEVEL = 'info';
}

const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const whatsappRoutes = require('./routes/whatsappRoutes');
const pedidosRoutes = require('./routes/pedidosRoutes');
const difusionRoutes = require('./routes/difusionRoutes');
const agentesRoutes = require('./routes/agentesRoutes');
const productosRoutes = require('./routes/productos');
const auth = require('./middlewares/auth');
const cron = require('node-cron');
const { iniciarCronHorarios } = require('./services/horariosCron');
const { actualizarCostosDeTodasLasEmpresas } = require('./services/metaAnalyticsService');
const { obtenerConversaciones, obtenerMensajesConversacion, buscarMensajes } = require('./controllers/conversacionesController');
const { enviarDifusionesProgramadas } = require('./controllers/difusionController');
const { procesarReintentos } = require('./services/reenvioService');
const { colaIA } = require('./services/iaQueue');

const app = express();

// Necesario para que Express sepa que estamos detrás de un proxy/reverse proxy
// y así obtener la IP real del cliente en rate limit y logs.
app.set('trust proxy', 1);

// Helmet bloquea cabeceras HTTP vulnerables de forma automática
app.use(helmet());

app.get('/health', async (req, res) => {
  const health = {
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {}
  };

  // ===== MongoDB =====
  const mongoState = mongoose.connection.readyState;
  const mongoLabels = ['desconectado', 'conectado', 'conectando', 'desconectando'];
  const mongoOk = mongoState === 1;
  health.checks.mongo = { ok: mongoOk, estado: mongoLabels[mongoState] || 'desconocido' };
  if (!mongoOk) health.ok = false;

  // ===== Uso de memoria =====
  const mem = process.memoryUsage();
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const maxHeapMB = parseInt(process.env.HEALTH_MAX_HEAP_MB || '1024', 10);
  const memOk = mem.heapUsed < maxHeapMB * 1024 * 1024;
  health.checks.memoria = {
    ok: memOk,
    heapTotalMB,
    heapUsedMB,
    rssMB,
    maxHeapMB
  };
  if (!memOk) health.ok = false;

  // ===== Espacio en disco para uploads =====
  const uploadsDir = path.join(__dirname, 'uploads');
  try {
    const stats = await fs.promises.statfs(uploadsDir);
    const totalBytes = stats.blocks * stats.bsize;
    const availableBytes = stats.bavail * stats.bsize;
    const totalGB = totalBytes / 1024 / 1024 / 1024;
    const availableGB = availableBytes / 1024 / 1024 / 1024;
    const minAvailableGB = parseFloat(process.env.HEALTH_MIN_DISK_GB || '1');
    const diskOk = availableGB >= minAvailableGB;
    health.checks.disco = {
      ok: diskOk,
      totalGB: Math.round(totalGB * 100) / 100,
      availableGB: Math.round(availableGB * 100) / 100,
      minAvailableGB
    };
    if (!diskOk) health.ok = false;
  } catch (e) {
    health.checks.disco = { ok: false, error: e.message };
    health.ok = false;
  }

  // ===== Cola de IA =====
  try {
    const estadoIA = colaIA.obtenerEstado();
    const maxColaAdmitida = parseInt(process.env.HEALTH_MAX_IA_QUEUE || '50', 10);
    const iaOk = estadoIA.enEspera <= maxColaAdmitida;
    health.checks.colaIa = {
      ok: iaOk,
      activas: estadoIA.activas,
      enEspera: estadoIA.enEspera,
      maxColaPermitida: maxColaAdmitida,
      totalLanzadas: estadoIA.lanzadas,
      totalErrores: estadoIA.errores
    };
    if (!iaOk) health.ok = false;
  } catch (e) {
    health.checks.colaIa = { ok: false, error: e.message };
    health.ok = false;
  }

  // ===== API de Meta (solo si hay credenciales globales) =====
  const metaToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const metaWaba = process.env.WHATSAPP_WABA_ID;
  if (!metaToken || !metaWaba) {
    health.checks.metaApi = { ok: true, estado: 'no_configurado' };
  } else {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const url = `https://graph.facebook.com/v19.0/${metaWaba}?fields=id`;
      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${metaToken}` },
        signal: controller.signal
      });
      clearTimeout(timeout);
      const ok = resp.ok;
      health.checks.metaApi = { ok, status: resp.status, estado: ok ? 'accesible' : 'error' };
      if (!ok) health.ok = false;
    } catch (e) {
      health.checks.metaApi = { ok: false, estado: 'error', error: e.message };
      health.ok = false;
    }
  }

  res.status(health.ok ? 200 : 503).json(health);
});

// CORS define explícitamente quién puede consumir la API.
// En producción podés setear CORS_ORIGIN = https://tu-dominio.com (separado por comas)
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['*'];
app.use(cors({
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: !allowedOrigins.includes('*')
}));

// Rate Limiting previene ataques de fuerza bruta
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 500, // Máximo 500 peticiones por IP en ese bloque de tiempo
    message: 'Demasiados intentos. Por favor, esperá 15 minutos.'
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Demasiados intentos de login. Esperá 15 minutos y volvé a intentar.'
});

// Aplicación del limitador a la ruta general de la API/Webhook
app.use('/api', limiter);

// Solicitudes al login por PIN son particularmente sensibles
app.use('/api/whatsapp/login-pin', loginLimiter);

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
// ====== ESTÁTICOS (SOLO ARCHIVOS PERMITIDOS) ======
app.disable('x-powered-by');
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/panel.js', (req, res) => res.sendFile(path.join(__dirname, 'panel.js')));
app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'style.css')));
app.use('/views', express.static(path.join(__dirname, 'views')));

// Endpoint protegido para servidores de archivos subidos (fotos de perfil, etc.)

// Ruta original que ya incluye empresaId
app.get('/uploads/:empresaId/:filename', auth, (req, res) => {
  const { empresaId, filename } = req.params;
  const empresasPermitidas = req.empresas || [];
  if (!empresasPermitidas.some(e => String(e) === String(empresaId))) {
    return res.status(403).json({ error: 'No tienes acceso a este archivo' });
  }
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Nombre de archivo inválido' });
  }
  const filePath = path.join(__dirname, 'uploads', String(empresaId), filename);
  res.sendFile(filePath);
});

// Endpoint para listar conversaciones de la Parrilla (protegido)
app.get('/api/conversaciones', auth, obtenerConversaciones);
app.get('/api/conversaciones/:id/mensajes', auth, obtenerMensajesConversacion);
app.get('/api/mensajes/buscar', auth, buscarMensajes);

app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/difusiones', difusionRoutes);
app.use('/api/admin/agentes', auth, agentesRoutes);
app.use('/api/productos', productosRoutes);

// ===== Manejo de errores global =====
app.use((err, req, res, next) => {
  logger.error('Error global:', err);
  const status = err.status || 500;
  const mensaje = status === 500 ? 'Error interno del servidor' : err.message;
  res.status(status).json({ error: mensaje });
});

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/crm';

const server = http.createServer(app);
const io = new Server(server);
app.set('io', io);

io.on('connection', (socket) => {
  socket.on('join', (empresaId) => {
    if (empresaId) {
      const sala = String(empresaId);
      socket.join(sala);
      console.log(`📡 Socket unido a sala: ${sala}`);
    }
  });
});

mongoose.connect(MONGODB_URI)
  .then(() => {
    logger.info('MongoDB conectado correctamente');
    server.listen(PORT, () => {
      logger.info(`Servidor escuchando en el puerto ${PORT}`);
    });
    // Actualizar costos de Meta al iniciar
    actualizarCostosDeTodasLasEmpresas(io).catch(err => logger.error('Error al actualizar costos al inicio:', err));
    iniciarCronHorarios();
    cron.schedule('* * * * *', () => {
      enviarDifusionesProgramadas().catch(err => logger.error('Error en cron de difusiones programadas:', err));
    });
    cron.schedule('0 */2 * * *', () => {
      actualizarCostosDeTodasLasEmpresas(io).catch(err => logger.error('Error en cron de costos Meta:', err));
    });

    // Reintentos automáticos de mensajes fallidos cada 30 segundos
    cron.schedule('*/30 * * * * *', () => {
      procesarReintentos(io).catch(err => logger.error('Error en reintentos automáticos:', err));
    });
  })
  .catch((err) => {
    console.error('Error al conectar a MongoDB:', err.message);
    process.exit(1);
  });
