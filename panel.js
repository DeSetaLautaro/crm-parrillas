// ============================================================
// CRM Omnicanal WhatsApp - Frontend Vanilla JS
// ============================================================

const USAR_MOCK_DATA = false;

let MOCK_PLANTILLAS = [
  { id: 'plantilla_bienvenida', nombre: 'Bienvenida', texto: 'Hola {{1}}, gracias por contactarnos' },
  { id: 'plantilla_promocion', nombre: 'Promoción del día', texto: 'Aprovechá nuestra promo {{1}}' },
  { id: 'plantilla_recordatorio', nombre: 'Recordatorio', texto: 'Te recordamos tu pedido para hoy {{1}}' }
];

// ===== Mock Data =====
// Basado en la estructura de los modelos definidos en proyecto.md

const MOCK_EMPRESA = {
  _id: 'emp1',
  nombre: 'Heladería Palermo',
  whatsappPhoneId: '5491100000000',
  promptIA: ''
};

const MOCK_USUARIO = {
  _id: 'emp1',
  nombreSucursal: 'Heladería Palermo',
  telefonosWhatsApp: ['Palermo', 'Recoleta']
};

const MOCK_CONTACTOS = [
  {
    _id: 'c1',
    empresaId: 'emp1',
    telefono: '5491100000001',
    nombre: 'Martina',
    etiquetas: ['VIP', 'Quejoso']
  },
  {
    _id: 'c2',
    empresaId: 'emp1',
    telefono: '5491100000002',
    nombre: 'Roberto',
    etiquetas: ['VIP']
  },
  {
    _id: 'c3',
    empresaId: 'emp1',
    telefono: '5491100000003',
    nombre: 'Sofía',
    etiquetas: []
  }
];

const MOCK_CONVERSACIONES = [
  {
    _id: 'conv1',
    empresaId: 'emp1',
    contactoId: 'c1',
    lineaReceptora: 'Palermo',
    botActivo: true,
    estado: 'Abierto',
    ultimoMensaje: 'Hola! Quería saber si todavía tenés el gusto de tiramisú',
    ultimaFecha: new Date('2024-08-13T14:35:00')
  },
  {
    _id: 'conv2',
    empresaId: 'emp1',
    contactoId: 'c2',
    lineaReceptora: 'Palermo',
    botActivo: false,
    estado: 'Abierto',
    ultimoMensaje: '¿Me podés pasar tu número?',
    ultimaFecha: new Date('2024-08-13T12:10:00')
  },
  {
    _id: 'conv3',
    empresaId: 'emp1',
    contactoId: 'c3',
    lineaReceptora: 'Recoleta',
    botActivo: true,
    estado: 'Resuelto',
    ultimoMensaje: '¡Gracias, ya me respondieron!',
    ultimaFecha: new Date('2024-08-12T09:20:00')
  }
];

const MOCK_MENSAJES = [
  { conversacionId: 'conv1', remitente: 'cliente', contenido: 'Hola! Quería saber si todavía tenés el gusto de tiramisú', fecha: new Date('2024-08-13T14:35:00') },
  { conversacionId: 'conv1', remitente: 'bot', contenido: '¡Hola Martina! Claro, tenemos tiramisú artesanal. ¿Te interesaría una docena?', fecha: new Date('2024-08-13T14:36:00') },
  { conversacionId: 'conv1', remitente: 'cliente', contenido: 'Sí, ¡perfecto! ¿Puedo encargar 6?', fecha: new Date('2024-08-13T14:38:00') },
  { conversacionId: 'conv1', remitente: 'nota_interna', contenido: 'Cliente VIP, recordar ofrecer descuento de temporada', fecha: new Date('2024-08-13T14:40:00') },
  { conversacionId: 'conv2', remitente: 'cliente', contenido: 'Hola, quería información sobre la delivery', fecha: new Date('2024-08-13T12:10:00') },
  { conversacionId: 'conv2', remitente: 'humano', contenido: 'Buenas Roberto, sí. ¿A qué dirección lo necesitás?', fecha: new Date('2024-08-13T12:11:00') },
  { conversacionId: 'conv3', remitente: 'cliente', contenido: 'Ya me respondieron, gracias!', fecha: new Date('2024-08-12T09:20:00') },
  { conversacionId: 'conv3', remitente: 'bot', contenido: '¡De nada! Que tengas buen día 😊', fecha: new Date('2024-08-12T09:21:00') }
];

// ===== Estado global =====
let CONTACTOS = [...MOCK_CONTACTOS];
let CONVERSACIONES = [...MOCK_CONVERSACIONES];
let MENSAJES = [...MOCK_MENSAJES];

let pestanaActiva = 'pendientes';
let chatActivoId = null;
let socket = null;
let miEmpresaId = null;
let whatsappSeleccionado = null;
let etiquetaFiltrada = null;
let usuarioActual = null;
let vistasCache = {};
let DIFUSION_CONTACTOS = [];
let DIFUSION_ETIQUETAS = [];
let editandoNombre = false;
let guardandoNombre = false;
let editandoEstado = false;
let guardandoEstado = false;
let editandoBienvenida = false;
let guardandoBienvenida = false;
let bienvenidaActual = '';
let mostrarTodasDifusiones = false;
let archivosPendientes = [];
let enviandoMensaje = false;
let cargandoMensajes = false;
let ventanaAbiertaGlobal = true;
let PLANTILLAS_META = [];
let modalPlantillaAbierto = false;
let EMPRESAS_INFO = [];
let AGENTES_GLOBAL = [];
let agenteEditandoId = null;

// ===== Interceptor global de fetch: maneja 401 automáticamente =====
const fetchOriginal = window.fetch.bind(window);
window.fetch = async (...args) => {
  const res = await fetchOriginal(...args);
  if (res.status === 401) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
    if (!url.includes('/login-pin') && !url.includes('/webhook')) {
      localStorage.removeItem('token');
      if (!document.body?.classList.contains('modo-login')) {
        mostrarModalLogin();
      }
    }
  }
  return res;
};

// ===== Notificaciones internas =====
let mensajesNoLeidos = 0;
let tituloOriginal = document.title;

// Variables para el recorte de foto de perfil
let fotoCropFile = null;
let fotoCropArrastrando = false;
let fotoCropOffsetX = 0;
let fotoCropOffsetY = 0;
let fotoCropMaxLeft = 0;
let fotoCropMaxTop = 0;
let fotoCropMinLeft = 0;
let fotoCropMinTop = 0;
let fotoCropImgBaseLeft = 0;
let fotoCropImgBaseTop = 0;
let fotoCropImgLeft = 0;
let fotoCropImgTop = 0;
let fotoCropTranslateX = 0;
let fotoCropTranslateY = 0;
let fotoCropDragStartX = 0;
let fotoCropDragStartY = 0;
let fotoCropDragStartTranslateX = 0;
let fotoCropDragStartTranslateY = 0;
let fotoCropMaxTranslateX = 0;
let fotoCropMinTranslateX = 0;
let fotoCropMaxTranslateY = 0;
let fotoCropMinTranslateY = 0;

// ===== Atajos rápidos para el mensaje =====
let ATAJOS_RAPIDOS = [];
let atajosMenuVisible = false;

// Prompt original por defecto (mismo que el backend PROMPT_IA_DEFAULT)
const PROMPT_DEFAULT = `- SIEMPRE pedí la dirección de entrega completa si todavía no la dio. No confirmes un pedido sin dirección.
- Preguntá cómo quiere pagar: efectivo o transferencia.
- No seas insistente con agregar productos. Si el cliente ya pidió o dijo que no quiere nada más, no vuelvas a ofrecerle más cosas.
- Si no encontrás la información en el catálogo, ofrecé contactar a un humano.
- Si el local está CERRADO, podés pasar el menú pero aclará de forma amable que no se están tomando pedidos hasta que abran. Igual podés registrar el pedido para cuando abran.
- IMPORTANTE: Si el carrito actual tiene items y ya tenés la dirección de entrega del cliente, confirmá el pedido automáticamente, informá el total, preguntá cómo quiere pagar (si no lo dijo) y despedite amablemente. No esperes a que el cliente diga "confirmo".`;

// ===== Helpers =====
function escaparHTML(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function normalizarNombreLocal(texto) {
  return (texto || '')
    .normalize('NFKC')          // convierte letras especiales a su forma normal
    .normalize('NFD')           // separa tildes
    .replace(/[\u0300-\u036f]/g, '') // quita tildes y diéresis
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function obtenerAvatar(nombre) {
  if (!nombre) return '?';
  const letras = nombre.match(/[A-Za-z0-9]/);
  if (letras) return letras[0].toUpperCase();
  const emojis = nombre.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  if (emojis) return emojis[0];
  return '?';
}

function autoAjustarTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  const maxAltura = 200;
  const nuevaAltura = Math.min(textarea.scrollHeight, maxAltura);
  textarea.style.height = nuevaAltura + 'px';
  textarea.style.overflowY = textarea.scrollHeight > maxAltura ? 'auto' : 'hidden';
}

function urlFotoConToken(url) {
  if (!url) return '';

  // Si la URL es del tipo /uploads/archivo (sin empresaId), la completamos
  let urlRectificada = url;
  const match = url.match(/^\/uploads\/([^/]+)$/);
  if (match && miEmpresaId) {
    urlRectificada = `/uploads/${miEmpresaId}/${match[1]}`;
  }

  const token = localStorage.getItem('token') || '';
  if (!token) return urlRectificada;
  const sep = urlRectificada.includes('?') ? '&' : '?';
  return `${urlRectificada}${sep}token=${encodeURIComponent(token)}`;
}

function mostrarToast(mensaje, tipo = 'info') {
  let contenedor = document.getElementById('toast-container');
  if (!contenedor) {
    contenedor = document.createElement('div');
    contenedor.id = 'toast-container';
    contenedor.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:10px;';
    document.body.appendChild(contenedor);
  }
  const toast = document.createElement('div');
  toast.style.cssText = `background:${tipo === 'error' ? '#ef4444' : '#3b82f6'};color:#fff;padding:14px 18px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.3);font-weight:bold;max-width:350px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;`;
  
  const textoSpan = document.createElement('span');
  textoSpan.textContent = mensaje;
  
  const btnCerrar = document.createElement('button');
  btnCerrar.textContent = '×';
  btnCerrar.style.cssText = 'background:transparent;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;padding:0 4px;';
  btnCerrar.addEventListener('click', () => toast.remove());
  
  toast.appendChild(textoSpan);
  toast.appendChild(btnCerrar);
  contenedor.appendChild(toast);
}

function reproducirSonidoNotificacion() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = 880;
    osc.type = 'sine';

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    osc.start();
    osc.stop(ctx.currentTime + 0.55);
    osc.onended = () => ctx.close();
  } catch (e) {
    console.warn('No se pudo reproducir sonido:', e);
  }
}

function actualizarBadgeTitulo() {
  document.title = mensajesNoLeidos > 0
    ? `(${mensajesNoLeidos}) ${tituloOriginal}`
    : tituloOriginal;
}

function marcarMensajesLeidos() {
  mensajesNoLeidos = 0;
  actualizarBadgeTitulo();
}

function solicitarPermisoNotificaciones() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(err =>
      console.warn('⚠️ No se pudo solicitar permiso de notificaciones:', err)
    );
  }
}

function notificarMensajeNuevo(payload) {
  if (!payload || !payload.mensaje) return;

  // Solo notificar mensajes entrantes de clientes
  if (payload.mensaje.remitente !== 'cliente') return;

  const conversacionId = payload.conversacionId;
  const esChatActivo = conversacionId === chatActivoId;
  const esVisible = !document.hidden;

  // Si el usuario está viendo el chat activo y la pestaña está enfocada, no notificar
  if (esChatActivo && esVisible) return;

  // 🔊 Sonido
  reproducirSonidoNotificacion();

  // 🔔 Badge en el título
  mensajesNoLeidos++;
  actualizarBadgeTitulo();

  // 💬 Notificación del sistema
  if ('Notification' in window && Notification.permission === 'granted') {
    const conv = getConversacionPorId(conversacionId);
    const contacto = conv ? getContactoPorId(conv.contactoId) : null;
    const nombre = (contacto && contacto.nombre) ? contacto.nombre : 'Cliente';
    const cuerpo = (payload.mensaje.contenido || '').slice(0, 120);

    const notificacion = new Notification(`Nuevo mensaje de ${nombre}`, {
      body: cuerpo,
      tag: 'chat-' + conversacionId,
      icon: '/favicon.ico' // Cambiá si tenés otro ícono
    });

    notificacion.onclick = () => {
      window.focus();
      if (conversacionId) {
        chatActivoId = conversacionId;
        renderTodo();
        marcarMensajesLeidos();
      }
      notificacion.close();
    };
  }
}

function getContactoPorId(id) {
  return CONTACTOS.find(c => c._id === id);
}

function getConversacionPorId(id) {
  return CONVERSACIONES.find(c => c._id === id);
}

function getMensajesDeConversacion(convId) {
  return MENSAJES.filter(m => m.conversacionId === convId);
}

function formatearHora(fecha) {
  return fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function formatearFechaTooltip(fecha) {
  return fecha.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

function filtrarPorContacto(conversaciones, texto) {
  const term = (texto || '').toLowerCase().trim();
  if (!term) return conversaciones;

  return conversaciones.filter(conv => {
    const contacto = getContactoPorId(conv.contactoId);
    const nombre = (contacto?.nombre || '').toLowerCase();
    const telefono = (contacto?.telefono || '').toLowerCase();
    const etiquetasTexto = (contacto?.etiquetas || []).map(e => (e.nombre || e).toLowerCase()).join(' ');
    return nombre.includes(term) || telefono.includes(term) || etiquetasTexto.includes(term);
  });
}

function filtrarPorMensaje(conversaciones, texto) {
  const term = (texto || '').toLowerCase().trim();
  if (!term) return [];

  return conversaciones.filter(conv => {
    const mensajes = MENSAJES.filter(m => m.conversacionId === conv._id);
    return mensajes.some(m => (m.contenido || '').toLowerCase().includes(term));
  });
}

function requiereAtencionHumana(conv) {
  if (conv.botActivo) return false;
  const msgs = getMensajesDeConversacion(conv._id);
  if (msgs.length === 0) return true;
  const ultimo = msgs[msgs.length - 1];
  return ultimo.remitente === 'cliente';
}

function botonAccionChat(conv) {
  if (conv.estado === 'Resuelto') {
    return `<button class="chat-item-accion" data-accion="reabrir" data-conv-id="${conv._id}" title="Volver a bot inactivo">↩️</button>`;
  }
  if (!conv.botActivo) {
    return `<button class="chat-item-accion" data-accion="atender" data-conv-id="${conv._id}" title="Marcar como atendido">✅</button>`;
  }
  return '';
}

// ===== Renderers =====
function colorFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${hash % 360}, 65%, 45%)`;
}

function buildChatItemHTML(conv, contacto, inicial, requiereAtencionClase, indicadorClase, activaClase) {
  const nombreSeguro = escaparHTML(normalizarNombreLocal(contacto.nombre || ''));
  const telefonoSeguro = escaparHTML(contacto.telefono || '');
  const ultimoSeguro = escaparHTML(conv.ultimoMensaje || '');
  const fotoPerfil = contacto.fotoPerfil || '';
  const inicialReal = fotoPerfil
    ? `<img src="${urlFotoConToken(fotoPerfil)}" alt="Avatar" class="chat-avatar-img" />`
    : obtenerAvatar(contacto.nombre || '?');
  const etiquetasSeguras = (contacto.etiquetas || []).map(et => {
    const nombre = et.nombre || et;
    return `<span class="chat-chip-etiqueta" data-etiqueta="${escaparHTML(nombre)}">${escaparHTML(nombre)}</span>`;
  }).join('');
  return `
          <div class="chat-item ${activaClase} ${requiereAtencionClase}" data-conv-id="${conv._id}">
            <div class="chat-item-avatar">${inicialReal}</div>
            <div class="chat-item-contenido">
              <div class="chat-item-titulo">
                <span class="chat-item-nombre">${nombreSeguro}</span>
                <span class="chat-item-hora">${formatearHora(conv.ultimaFecha)}</span>
              </div>
              <div class="chat-item-linea">${telefonoSeguro}</div>
              <div class="chat-item-ultimo">${ultimoSeguro}</div>
              ${conv.cancelacionReciente ? `<span style="display:inline-block; background:#ef4444; color:#fff; font-size:11px; padding:2px 8px; border-radius:10px; margin-top:4px;">🚫 Canceló pedido</span>` : ''}
              <div class="chat-item-etiquetas">${etiquetasSeguras}</div>
            </div>
            ${botonAccionChat(conv)}
            <div class="chat-item-indicador" style="background-color:${conv.botActivo ? '#10b981' : '#ef4444'}; border:1px solid ${conv.botActivo ? '#10b981' : '#ef4444'};" title="${conv.botActivo ? 'Bot activo' : 'Requiere humano'}"></div>
          </div>
        `;
}

function actualizarContadoresPestanas() {
  const contar = (pestana) => {
    let lista;
    if (pestana === 'todos') {
      lista = CONVERSACIONES.filter(c => c.estado === 'Abierto');
    } else if (pestana === 'pendientes') {
      lista = CONVERSACIONES.filter(c => !c.botActivo && c.estado !== 'Resuelto');
    } else if (pestana === 'resueltos') {
      lista = CONVERSACIONES.filter(c => c.estado === 'Resuelto');
    } else {
      lista = [];
    }

    if (whatsappSeleccionado) {
      lista = lista.filter(c => c.lineaReceptora === whatsappSeleccionado);
    }

    return lista.length;
  };

  document.querySelectorAll('.pestana-contador').forEach(span => {
    const pestana = span.dataset.contador;
    span.textContent = contar(pestana);
  });
}

function renderListaChats() {
  const container = document.getElementById('lista-chats');
  // Actualizamos contadores de las pestañas
  actualizarContadoresPestanas();
  console.log('[renderListaChats] pestanaActiva:', pestanaActiva, 'CONVERSACIONES:', CONVERSACIONES.length, 'pendientes:', CONVERSACIONES.filter(c => !c.botActivo).length, 'línea:', whatsappSeleccionado);
  let base;
  if (pestanaActiva === 'todos') {
    base = CONVERSACIONES.filter(c => c.estado === 'Abierto');
  } else if (pestanaActiva === 'pendientes') {
    base = CONVERSACIONES.filter(c => !c.botActivo && c.estado !== 'Resuelto');
  } else if (pestanaActiva === 'resueltos') {
    base = CONVERSACIONES.filter(c => c.estado === 'Resuelto');
  } else {
    base = CONVERSACIONES.filter(c => c.estado === 'Abierto');
  }
  const buscador = (document.getElementById('buscador') || {}).value || '';
  const filtrados = base.filter(c => {
    if (!whatsappSeleccionado) return true;
    if (!c.lineaReceptora) return true;
    return c.lineaReceptora === whatsappSeleccionado;
  });

  const conFiltroEtiqueta = etiquetaFiltrada
    ? filtrados.filter(c => {
        const contacto = getContactoPorId(c.contactoId);
        const etiquetas = (contacto?.etiquetas || []).map(e => (e.nombre || e).toLowerCase());
        return etiquetas.includes(etiquetaFiltrada.toLowerCase());
      })
    : filtrados;

  const filtrar = (lista) => lista.filter(c =>
    !whatsappSeleccionado ? true : c.lineaReceptora === whatsappSeleccionado
  );

  let htmlFinal = '';

  if (buscador.trim() !== '') {
    const porContacto = filtrar(filtrarPorContacto(conFiltroEtiqueta, buscador));
    const porMensaje = filtrar(filtrarPorMensaje(conFiltroEtiqueta, buscador));

    if (porContacto.length > 0) {
      htmlFinal += `<div class="resultado-seccion-titulo">Chats</div>`;
      htmlFinal += porContacto.map(conv => {
        const contacto = getContactoPorId(conv.contactoId);
        const inicial = (contacto.nombre || '?').charAt(0).toUpperCase();
        const requiereAtencionClase = requiereAtencionHumana(conv) ? 'requiere-atencion' : '';
        const indicadorClase = conv.botActivo ? 'activo' : 'requiere-atencion-ind';
        const activaClase = conv._id === chatActivoId ? 'activo' : '';
        return buildChatItemHTML(conv, contacto, inicial, requiereAtencionClase, indicadorClase, activaClase);
      }).join('');
    }

    if (porMensaje.length > 0) {
      htmlFinal += `<div class="resultado-seccion-titulo">Mensajes</div>`;
      htmlFinal += porMensaje.map(conv => {
        const contacto = getContactoPorId(conv.contactoId);
        const inicial = (contacto.nombre || '?').charAt(0).toUpperCase();
        const requiereAtencionClase = requiereAtencionHumana(conv) ? 'requiere-atencion' : '';
        const indicadorClase = conv.botActivo ? 'activo' : 'requiere-atencion-ind';
        const activaClase = conv._id === chatActivoId ? 'activo' : '';
        return buildChatItemHTML(conv, contacto, inicial, requiereAtencionClase, indicadorClase, activaClase);
      }).join('');
    }

    if (!porContacto.length && !porMensaje.length) {
      htmlFinal = '<div class="sin-resultados">Sin resultados</div>';
    }

    container.innerHTML = htmlFinal;

    document.querySelectorAll('.chat-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.chat-item-accion') || e.target.closest('.chat-chip-etiqueta')) return;
        chatActivoId = item.dataset.convId;
        marcarMensajesLeidos();
        renderTodo();
      });
    });

    return;
  }

  container.innerHTML = conFiltroEtiqueta.map(conv => {
    const contacto = getContactoPorId(conv.contactoId);
    const inicial = (contacto.nombre || '?').charAt(0).toUpperCase();
    const requiereAtencionClase = requiereAtencionHumana(conv) ? 'requiere-atencion' : '';
    const indicadorClase = conv.botActivo ? 'activo' : 'requiere-atencion-ind';
    const activaClase = conv._id === chatActivoId ? 'activo' : '';
    return buildChatItemHTML(conv, contacto, inicial, requiereAtencionClase, indicadorClase, activaClase);
  }).join('');

  document.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.chat-item-accion') || e.target.closest('.chat-chip-etiqueta')) return;
      chatActivoId = item.dataset.convId;
      marcarMensajesLeidos();
      renderTodo();
    });
  });
}

function armarHeaderMovil(contacto, conv) {
  const chatHeader = document.querySelector('.chat-header');
  if (!chatHeader) return;

  // Avatar con inicial al lado de la flecha "volver"
  let avatar = document.getElementById('chat-avatar-movil');
  if (!avatar) {
    avatar = document.createElement('div');
    avatar.id = 'chat-avatar-movil';
    avatar.className = 'chat-avatar-movil';
    const backBtn = document.getElementById('btn-volver');
    if (backBtn && backBtn.nextSibling) {
      chatHeader.insertBefore(avatar, backBtn.nextSibling);
    } else {
      chatHeader.insertBefore(avatar, chatHeader.firstChild?.nextSibling || chatHeader.firstChild);
    }
  }
  avatar.textContent = obtenerAvatar(contacto.nombre || '?');

 /* // Botón teléfono (solo visible en celular)
  let btnTel = document.getElementById('btn-llamar-movil');
  if (!btnTel) {
    btnTel = document.createElement('a');
    btnTel.id = 'btn-llamar-movil';
    btnTel.className = 'btn-llamar-movil';
    btnTel.textContent = '📞';
    btnTel.title = 'Llamar';
    const toggleWrap = document.querySelector('.toggle-wrapper');
    if (toggleWrap) toggleWrap.parentNode.insertBefore(btnTel, toggleWrap);
  }
  btnTel.href = `tel:${contacto.telefono || ''}`;*/

  // Botón "⋯" que abre el menú en celular
  let btnMenu = document.getElementById('btn-mas-movil');
  if (!btnMenu) {
    btnMenu = document.createElement('button');
    btnMenu.id = 'btn-mas-movil';
    btnMenu.className = 'btn-mas-movil';
    btnMenu.textContent = '⋯';
    btnMenu.title = 'Más opciones';
    const toggleWrap2 = document.querySelector('.toggle-wrapper');
    if (toggleWrap2) toggleWrap2.parentNode.insertBefore(btnMenu, toggleWrap2.nextSibling);
    btnMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('menu-movil');
      if (menu) menu.classList.toggle('hidden');
    });
  }

  // Menú flotante (Bloquear / Detalles / Notas)
  let menu = document.getElementById('menu-movil');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'menu-movil';
    menu.className = 'menu-movil hidden';
    document.body.appendChild(menu);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#menu-movil') && !e.target.closest('#btn-mas-movil')) {
        menu.classList.add('hidden');
      }
    });
  }

  const bloqueado = contacto.bloqueado;
  menu.innerHTML = `
    <div class="menu-movil-item" id="menu-movil-llamar">📞 Llamar</div>
    <div class="menu-movil-item" id="menu-movil-bloquear">${bloqueado ? '🔓 Desbloquear' : '🔒 Bloquear'}</div>
    <div class="menu-movil-item" id="menu-movil-detalles">👁 Ver detalles</div>
    <div class="menu-movil-item" id="menu-movil-notas">📝 Notas / Archivos</div>
  `;

  document.getElementById('menu-movil-bloquear').onclick = () => {
    menu.classList.add('hidden');
    confirmarBloqueoCliente();
  };

  document.getElementById('menu-movil-detalles').onclick = () => {
    menu.classList.add('hidden');
    abrirDetallesDesdeMenu();
  };

  document.getElementById('menu-movil-notas').onclick = () => {
    menu.classList.add('hidden');
    abrirArchivosNotasDesdeMenu();
  };

  document.getElementById('menu-movil-llamar').onclick = () => {
    menu.classList.add('hidden');
    window.location.href = `tel:${contacto.telefono || ''}`;
  };
}

function armarBotonCerrarPerfilMovil() {
  const perfilHeader = document.querySelector('.perfil-header');
  if (!perfilHeader) return;
  if (document.getElementById('btn-cerrar-perfil-movil')) return;
  const btn = document.createElement('button');
  btn.id = 'btn-cerrar-perfil-movil';
  btn.className = 'btn-cerrar-perfil-movil';
  btn.textContent = '←';
  btn.title = 'Volver al chat';
  btn.addEventListener('click', () => {
    document.getElementById('app').classList.remove('perfil-abierto');
    document.getElementById('modal-detalles')?.classList.add('hidden');
  });
  perfilHeader.insertBefore(btn, perfilHeader.firstChild);
}

function abrirDetallesDesdeMenu() {
  const app = document.getElementById('app');
  if (app) app.classList.add('perfil-abierto');
  abrirDetallesModal();
}

function abrirArchivosNotasDesdeMenu() {
  const app = document.getElementById('app');
  if (app) app.classList.add('perfil-abierto');
  const modal = document.getElementById('modal-detalles');
  if (modal) modal.classList.add('hidden');

  const panelNotas = document.getElementById('notas-panel');
  const panelArchivos = document.getElementById('archivos-panel');
  if (panelNotas) panelNotas.classList.remove('hidden');
  if (panelArchivos) panelArchivos.classList.add('hidden');
}

function renderChatActivo() {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;

  const contacto = getContactoPorId(conv.contactoId);
  const toggle = document.getElementById('toggle-bot');
  const estadoBot = document.getElementById('estado-bot');

  armarHeaderMovil(contacto, conv);

  document.getElementById('chat-nombre').textContent = normalizarNombreLocal(contacto.nombre || '');
  document.getElementById('chat-linea').textContent = contacto.telefono;

  // Mostrar etiquetas del contacto en el header del chat
  const lineaHeader = document.getElementById('chat-linea');
  let etiquetasHeader = document.getElementById('chat-etiquetas');
  if (!etiquetasHeader && lineaHeader && lineaHeader.parentNode) {
    etiquetasHeader = document.createElement('div');
    etiquetasHeader.id = 'chat-etiquetas';
    etiquetasHeader.className = 'chat-etiquetas';
    lineaHeader.parentNode.insertBefore(etiquetasHeader, lineaHeader.nextSibling);
  }
  if (etiquetasHeader) {
    const etiquetas = Array.isArray(contacto.etiquetas) ? contacto.etiquetas : [];
    etiquetasHeader.innerHTML = etiquetas.map(etiqueta => {
      const nombre = etiqueta.nombre || etiqueta;
      const etiquetaSegura = escaparHTML(nombre);
      const color = colorFromString(nombre);
      return `<span style="background:${color}22; border:1px solid ${color}; border-radius:12px; padding:2px 8px; font-size:12px; margin-right:4px; color:${color};">
                ${etiquetaSegura}
                <button class="etiqueta-remove" data-etiqueta="${etiquetaSegura}" style="background:none; border:none; color:inherit; margin-left:4px; cursor:pointer; font-size:12px;">×</button>
              </span>`;
    }).join('');
  }

  toggle.checked = conv.botActivo === true;
  const toggleWrapper = toggle.closest('.toggle');
  if (toggleWrapper) toggleWrapper.classList.toggle('activo', conv.botActivo === true);

  estadoBot.textContent = conv.botActivo ? 'Bot Activo' : 'Pausado';
  estadoBot.classList.remove('estado-activo', 'estado-pausado');
  estadoBot.classList.add(conv.botActivo ? 'estado-activo' : 'estado-pausado');

  // ===== Candado de cliente bloqueado =====
  let lockInd = document.getElementById('bloqueado-indicador');
  if (!lockInd) {
    const toggleEl = document.getElementById('toggle-bot');
    if (toggleEl && toggleEl.parentNode) {
      lockInd = document.createElement('span');
      lockInd.id = 'bloqueado-indicador';
      lockInd.style.marginLeft = '8px';
      lockInd.style.fontSize = '14px';
      lockInd.style.color = '#ef4444';
      toggleEl.parentNode.insertBefore(lockInd, toggleEl.nextSibling);
    }
  }
  if (lockInd) {
    if (contacto.bloqueado) {
      lockInd.textContent = ' 🔒';
      lockInd.title = 'Cliente bloqueado';
      lockInd.style.display = 'inline';
    } else {
      lockInd.textContent = '';
      lockInd.style.display = 'none';
    }
  }

  // Mensajes
  const areaMensajes = document.getElementById('area-mensajes');
  const mensajes = getMensajesDeConversacion(conv._id);
  console.log('[renderChatActivo] chat:', chatActivoId, '| mensajes en memoria:', mensajes.length);

  const mensajesHTML = mensajes.map(msg => {
    let claseBurbuja = '';
    if (msg.remitente === 'cliente') claseBurbuja = 'bubble-cliente';
    else if (['bot', 'humano', 'ia', 'empresa'].includes(msg.remitente)) claseBurbuja = 'bubble-humano';
    else if (msg.remitente === 'nota_interna') claseBurbuja = 'bubble-nota';

    const contenidoSeguro = escaparHTML(msg.contenido || '').replace(/\n/g, '<br>');
    let contenidoFinal = contenidoSeguro;
    if (msg.tipo === 'imagen' && msg.urlArchivo) {
      contenidoFinal = `<img src="${urlFotoConToken(msg.urlArchivo)}" alt="Imagen" style="max-width:220px; border-radius:8px; display:block; margin-bottom:4px; cursor:pointer;" onclick="window.open('${urlFotoConToken(msg.urlArchivo)}','_blank')">`;
    } else if (msg.tipo === 'audio' && msg.urlArchivo) {
      const duracionSeg = msg.duracionSegundos
        ? `<div style="font-size:12px; color:#6b7280; margin-top:2px;">`
        : '';
      contenidoFinal = `<audio controls preload="metadata" src="${urlFotoConToken(msg.urlArchivo)}" style="max-width:220px; display:block; margin-bottom:4px;"></audio>${duracionSeg}`;
    } else if (msg.tipo === 'video' && msg.urlArchivo) {
      contenidoFinal = `<video controls src="${urlFotoConToken(msg.urlArchivo)}" style="max-width:220px; border-radius:8px; display:block; margin-bottom:4px;"></video>`;
    } else if (msg.tipo === 'documento' && msg.urlArchivo) {
      contenidoFinal = `<a href="${urlFotoConToken(msg.urlArchivo)}" target="_blank" style="color:inherit;">${contenidoSeguro}</a>`;
    }
    let indicador = '';
    if (['bot','humano','ia','empresa'].includes(msg.remitente)) {
      if (msg.estado === 'fallido') {
        const tituloError = msg.errorDetalle ? escaparHTML(msg.errorDetalle) : 'Error al enviar. Hacé clic para reintentar.';
        indicador = `<span class="mensaje-reintentar" data-reintentar="${msg._id}" title="${tituloError}" style="font-size:16px; color:#ef4444; margin-left:6px; cursor:pointer; line-height:1;">🔄</span>`;
      } else {
        const estado = msg.estado || 'enviado';
        const simbolo = estado === 'leido' ? '✓✓' : (estado === 'entregado' ? '✓✓' : '✓');
        const color = estado === 'leido' ? '#34b7f1' : '#ffffff';
        const titulo = estado === 'leido' ? 'Leído' : (estado === 'entregado' ? 'Entregado' : 'Enviado');
        indicador = `<span class="mensaje-estado" title="${titulo}" style="font-size:13px; font-weight:bold; color:${color}; margin-left:6px; line-height:1;">${simbolo}</span>`;
      }
    }
    const estiloMedia = ((msg.tipo === 'imagen' || msg.tipo === 'audio' || msg.tipo === 'video') && msg.urlArchivo) ? ' style="background:transparent; padding:0; box-shadow:none; border:none;"' : '';
    return `<div class="bubble ${claseBurbuja}"${estiloMedia}>${contenidoFinal}${indicador}</div>`;
  }).join('');

  const botonCargarMas = conv.tieneMas
    ? `<div id="cargar-mas-wrapper" style="text-align:center; padding:6px;">
        <button id="cargar-mas-mensajes" class="cargar-mas-btn" style="background:transparent; border:1px solid #cbd5e1; border-radius:8px; padding:6px 12px; color:#2563eb; cursor:pointer; font-size:13px;">↥ Cargar mensajes anteriores</button>
      </div>`
    : '';

  areaMensajes.innerHTML = botonCargarMas + mensajesHTML;

  // Scroll al último mensaje al abrir el chat
  if (areaMensajes) {
    areaMensajes.scrollTop = areaMensajes.scrollHeight;
  }

  // Si existe el botón de paginación, ligarlo a la función correspondiente
  const btnCargarMas = document.getElementById('cargar-mas-mensajes');
  if (btnCargarMas) {
    btnCargarMas.addEventListener('click', cargarMasMensajes);
  }

  // Cargar los audios como blob para que el navegador pueda reproducirlos
  cargarAudiosConBlob(areaMensajes);

  // Habilitar campo de envío de mensajes para el chat activo
  const inputMensaje = document.getElementById('input-mensaje');
  const btnEnviar = document.getElementById('btn-enviar');
  if (inputMensaje && btnEnviar) {
    inputMensaje.disabled = false;
    btnEnviar.disabled = false;
  }

  // Etiquetas del perfil
  renderPerfil(contacto);

  // Mostrar carrito en vivo o último pedido confirmado
  renderPanelPedido(conv, contacto);
  actualizarAvisoVentana();
}

function renderPerfil(contacto) {
  const nombre = normalizarNombreLocal(contacto.nombre || '');
  const telefono = contacto.telefono || '';

  document.getElementById('perfil-nombre').value = nombre;
  document.getElementById('perfil-telefono').value = telefono;
  const inputDireccion = document.getElementById('perfil-direccion-input');
  const inputPisoDepto = document.getElementById('perfil-pisodpto-input');
  const inputCodigoPostal = document.getElementById('perfil-codigopostal-input');
  if (inputDireccion) inputDireccion.value = contacto.direccionFrecuente || contacto.direccion || '';
  if (inputPisoDepto) inputPisoDepto.value = contacto.pisoDepto || '';
  if (inputCodigoPostal) inputCodigoPostal.value = contacto.codigoPostal || '';
  const nombreTexto = document.getElementById('perfil-nombre-texto');
  if (nombreTexto) nombreTexto.textContent = nombre;
  const telefonoTexto = document.getElementById('perfil-telefono-texto');
  if (telefonoTexto) telefonoTexto.textContent = telefono;
  const avatar = document.getElementById('perfil-avatar');
  if (avatar) {
    if (contacto.fotoPerfil) {
      avatar.innerHTML = `<img src="${urlFotoConToken(contacto.fotoPerfil)}" class="avatar-foto-img" alt="avatar">`;
    } else {
      avatar.textContent = obtenerAvatar(nombre);
    }
  }

  const contEtiquetas = document.getElementById('lista-etiquetas');
  if (contEtiquetas) {
    // Las etiquetas se muestran en el header del chat, por eso acá no se muestra nada.
    contEtiquetas.innerHTML = '';
  }

  const contNotas = document.getElementById('lista-notas');
  if (contNotas) {
    const notasMensajes = chatActivoId
      ? MENSAJES.filter(m => m.conversacionId === chatActivoId && m.remitente === 'nota_interna')
      : [];
    if (notasMensajes.length === 0) {
      contNotas.innerHTML = '<span class="notas-vacio">Sin notas internas</span>';
    } else {
      contNotas.innerHTML = notasMensajes.map(m => {
        const nSeguro = escaparHTML(m.contenido || '');
        return `
        <div class="nota-item">
          <span class="nota-item-texto">${nSeguro}</span>
          <button class="nota-remove-btn" data-nota="${encodeURIComponent(m._id)}" title="Eliminar nota">×</button>
        </div>
      `;
      }).join('');
    }
  }

  // Mantener el botón original "Detalles" funcionando (no eliminar, evita fragilidad)
  const btnOriginalDetalles = document.getElementById('btn-detalles-modal');
  if (btnOriginalDetalles) {
    btnOriginalDetalles.onclick = () => {
      const perfilMenu = document.getElementById('perfil-menu');
      if (perfilMenu) perfilMenu.classList.add('hidden');
      abrirDetallesDesdeMenu();
    };
  }

  // Opción de bloqueo dentro del menú del perfil (tres puntos)
  const perfilMenu = document.getElementById('perfil-menu');
  if (perfilMenu) {
    let itemBloqueo = document.getElementById('menu-item-bloquear');
    if (!itemBloqueo) {
      itemBloqueo = document.createElement('div');
      itemBloqueo.id = 'menu-item-bloquear';
      itemBloqueo.className = 'perfil-menu-item';
      perfilMenu.appendChild(itemBloqueo);
    }
    itemBloqueo.textContent = contacto.bloqueado ? '🔓 Desbloquear' : '🔒 Bloquear';
    itemBloqueo.onclick = () => {
      perfilMenu.classList.add('hidden');
      confirmarBloqueoCliente();
    };
    // No se crea itemDetalles porque el botón original ya abre el modal
  }

    let itemArchivos = document.getElementById('menu-item-archivos');
    if (!itemArchivos) {
      itemArchivos = document.createElement('div');
      itemArchivos.id = 'menu-item-archivos';
      itemArchivos.className = 'perfil-menu-item';
      perfilMenu.appendChild(itemArchivos);
    }
    itemArchivos.textContent = '📝 Notas / Archivos';
    itemArchivos.onclick = () => {
      perfilMenu.classList.add('hidden');
      abrirArchivosNotasDesdeMenu();
    };

    let itemLlamar = document.getElementById('menu-item-llamar');
    if (!itemLlamar) {
      itemLlamar = document.createElement('div');
      itemLlamar.id = 'menu-item-llamar';
      itemLlamar.className = 'perfil-menu-item';
      perfilMenu.appendChild(itemLlamar);
    }
    itemLlamar.textContent = '📞 Llamar';
    itemLlamar.onclick = () => {
      perfilMenu.classList.add('hidden');
      window.location.href = `tel:${contacto.telefono || ''}`;
    };
}

function renderTodo() {
  renderListaChats();
  renderChatActivo();
  actualizarAvisoVentana();
  updateVisibilidad();

  const appEl = document.getElementById('app');
  if (appEl) {
    if (chatActivoId) {
      appEl.classList.add('chat-abierto');
    } else {
      appEl.classList.remove('chat-abierto');
    }
  }
}

// ===== Alternancia de vistas (Sidebar) =====
function ajustarVisibilidadSegunRol() {
  const esAgente = usuarioActual && usuarioActual.rol === 'agente';
  const ids = ['btn-config', 'btn-pagos', 'btn-difusion', 'admin-agentes-wrapper'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = esAgente ? 'none' : '';
  });
  if (!esAgente) {
    cargarAgentes();
  }
}

function actualizarTituloSidebar(vista) {
  let tituloMovil = document.getElementById('titulo-movil');
  if (!tituloMovil) {
    tituloMovil = document.createElement('div');
    tituloMovil.id = 'titulo-movil';
    const slimSidebar = document.getElementById('slim-sidebar');
    if (slimSidebar && slimSidebar.parentNode) {
      slimSidebar.parentNode.insertBefore(tituloMovil, slimSidebar);
    } else {
      document.body.appendChild(tituloMovil);
    }
  }

  // Mover el botón de menú (3 puntitos) dentro del título móvil
  const btnMenu = document.getElementById('btn-mobile-menu');
  if (btnMenu && tituloMovil && btnMenu.parentNode !== tituloMovil) {
    tituloMovil.appendChild(btnMenu);
  }

  // Asegurar un span para el texto del título
  let spanTitulo = tituloMovil.querySelector('.titulo-movil-texto');
  if (!spanTitulo) {
    spanTitulo = document.createElement('span');
    spanTitulo.className = 'titulo-movil-texto';
    tituloMovil.insertBefore(spanTitulo, tituloMovil.firstChild);
  }

  const titulos = {
    inbox: 'Chats',
    config: 'Configuración',
    perfil: 'Perfil',
    pagos: 'Pagos',
    difusion: 'Difusión'
  };
  spanTitulo.textContent = titulos[vista] || '';
}

function showView(vista) {
  actualizarTituloSidebar(vista);
  const inboxView = document.getElementById('inbox-view');
  const configView = document.getElementById('config-view');
  const perfilView = document.getElementById('perfil-view');
  const pagosView = document.getElementById('pagos-view');
  const difusionView = document.getElementById('difusion-view');
  const btnInbox = document.getElementById('btn-inbox');
  const btnConfig = document.getElementById('btn-config');
  const btnPerfil = document.getElementById('btn-perfil');
  const btnPagos = document.getElementById('btn-pagos');
  const btnDifusion = document.getElementById('btn-difusion');

  if (inboxView) inboxView.classList.add('hidden');
  if (configView) configView.classList.add('hidden');
  if (perfilView) perfilView.classList.add('hidden');
  if (pagosView) pagosView.classList.add('hidden');
  if (difusionView) difusionView.classList.add('hidden');
  if (btnInbox) btnInbox.classList.remove('activo');
  if (btnConfig) btnConfig.classList.remove('activo');
  if (btnPerfil) btnPerfil.classList.remove('activo');
  if (btnPagos) btnPagos.classList.remove('activo');
  if (btnDifusion) btnDifusion.classList.remove('activo');

  if (vista === 'inbox') {
    inboxView?.classList.remove('hidden');
    btnInbox?.classList.add('activo');
  } else if (vista === 'config') {
    configView?.classList.remove('hidden');
    btnConfig?.classList.add('activo');
    cargarConfiguracion();
  } else if (vista === 'perfil') {
    perfilView?.classList.remove('hidden');
    btnPerfil?.classList.add('activo');
    cargarConfiguracion();
  } else if (vista === 'pagos') {
    pagosView?.classList.remove('hidden');
    btnPagos?.classList.add('activo');
    cargarPagos();
  } else if (vista === 'difusion') {
    difusionView?.classList.remove('hidden');
    btnDifusion?.classList.add('activo');
    cargarDifusiones();
  }
}

function activarPanelConfig(panelId) {
  document.querySelectorAll('.config-item[data-panel]').forEach(i => i.classList.remove('activo'));
  const item = document.querySelector(`.config-item[data-panel="${panelId}"]`);
  if (item) item.classList.add('activo');
  document.querySelectorAll('.config-panel').forEach(p => p.classList.add('hidden'));
  const panel = document.getElementById(panelId);
  if (panel) panel.classList.remove('hidden');
}

function renderAtajos(atajos) {
  const tbody = document.getElementById('atajos-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  (atajos || []).forEach(atajo => {
    const tr = document.createElement('tr');
    const respuestaNormalizada = String(atajo.respuesta || '').replace(/<br\s*\/?>/gi, '\n');
    tr.innerHTML = `
      <td><input type="text" class="atajo-comando" value="${escaparHTML(atajo.comando)}"></td>
      <td><textarea class="atajo-respuesta" rows="2">${escaparHTML(respuestaNormalizada)}</textarea></td>
      <td>
        <button class="atajo-guardar" type="button" style="display:none;" title="Confirmar cambios">✓</button>
        <button class="atajo-eliminar" type="button">×</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function cargarConfiguracion() {
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch('/api/whatsapp/config', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      console.log('[cargarConfiguracion] HTTP error:', res.status);
      return;
    }
    const data = await res.json();
    const config = data.config || {};
    console.log('[cargarConfiguracion] respuesta completa:', data);
    console.log('[cargarConfiguracion] config:', config);
    console.log('[cargarConfiguracion] horariosEstructurados:', config.horariosEstructurados);

    const prompt = document.getElementById('prompt-ia');
    if (prompt) prompt.value = config.promptIA || '';

    const nombreDisplay = document.getElementById('perfil-nombre-display');
    if (nombreDisplay && config.nombre) nombreDisplay.textContent = normalizarNombreLocal(config.nombre);

    const fotoGrande = document.getElementById('perfil-foto-grande');
    if (fotoGrande && config.fotoPerfil) {
      fotoGrande.src = urlFotoConToken(config.fotoPerfil);
      fotoGrande.style.objectPosition = config.fotoPosicion || '50% 50%';
    }

    const fotoPreview = document.getElementById('config-foto-preview');
    if (fotoPreview && config.fotoPerfil) {
      fotoPreview.src = urlFotoConToken(config.fotoPerfil);
      fotoPreview.style.objectPosition = config.fotoPosicion || '50% 50%';
      fotoPreview.style.display = 'block';
    }

    renderAtajos(config.atajos || []);

    const horariosWrap = document.getElementById('horarios-container');
    console.log('[cargarConfiguracion] horarios-container existe?', !!horariosWrap);
    if (horariosWrap) {
      horariosWrap.innerHTML = '';
      const horarios = config.horariosEstructurados || [];
      const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
      dias.forEach(dia => {
        const row = horarios.find(h => h.dia && h.dia.toLowerCase() === dia);
        const apertura = row?.apertura || '';
        const cierre = row?.cierre || '';
        const div = document.createElement('div');
        div.className = 'horario-row';
        div.innerHTML = `
          <span class="horario-dia">${dia}</span>
          <input type="time" class="horario-apertura" value="${apertura}" data-dia="${dia}">
          <span>a</span>
          <input type="time" class="horario-cierre" value="${cierre}" data-dia="${dia}">
        `;
        horariosWrap.appendChild(div);
      });
    }

    const estadoDisplay = document.getElementById('perfil-estado-display');
    if (estadoDisplay && config.estado) estadoDisplay.textContent = config.estado;

    const bienvenidaDisplay = document.getElementById('perfil-bienvenida-display');
    if (bienvenidaDisplay) {
      bienvenidaActual = config.bienvenida || '';
      bienvenidaDisplay.textContent = bienvenidaActual;
    }

    const procesarAudiosCheck = document.getElementById('procesar-audios');
    if (procesarAudiosCheck) {
      procesarAudiosCheck.checked = (config.procesarAudios === true);
    }


    // Actualizar atajos rápidos para el autocompletado del input
    ATAJOS_RAPIDOS = (config.atajos || []).map(a => ({
      atajo: a.comando,
      mensaje: String(a.respuesta || '').replace(/<br\s*\/?>/gi, '\n')
    }));
  } catch (error) {
    console.error('Error al cargar configuración:', error);
  }
}

async function cargarPagos() {
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch('/api/whatsapp/config', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const meta = data.config?.meta || {};

    const costoEl = document.getElementById('meta-costo-total');
    if (costoEl) costoEl.textContent = meta.costoTotal || '0';

    const fechaEl = document.getElementById('meta-ultima-actualizacion');
    if (fechaEl && meta.ultimaActualizacion) {
      fechaEl.textContent = new Date(meta.ultimaActualizacion).toLocaleString('es-AR', {
        dateStyle: 'short',
        timeStyle: 'short'
      });
    } else if (fechaEl) {
      fechaEl.textContent = 'Sin datos';
    }

    // Escuchar click en "Actualizar ahora"
    const btnActualizar = document.getElementById('btn-actualizar-costos');
    if (btnActualizar && !btnActualizar.dataset.listener) {
      btnActualizar.dataset.listener = 'true';
      btnActualizar.addEventListener('click', actualizarCostosManual);
    }
  } catch (error) {
    console.error('Error al cargar pagos:', error);
  }

  // Cargar datos del monedero
  await cargarMonedero();
}

async function cargarOpcionesDifusion() {
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch('/api/difusiones/contactos', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    DIFUSION_CONTACTOS = (data.contactos || []).map(c => ({
      _id: c._id,
      nombre: c.nombre || '',
      telefono: c.telefono,
      etiquetas: (c.etiquetas || []).map(e => typeof e === 'string' ? e : e.nombre || '').filter(Boolean)
    }));
    DIFUSION_ETIQUETAS = (data.etiquetas || []).map(et => typeof et === 'string' ? et : et.nombre || '').filter(Boolean);
    renderOpcionesDifusion();
    actualizarContadorDestinatarios();
  } catch (error) {
    console.error('Error cargando opciones de difusión:', error);
  }
}

function renderOpcionesDifusion() {
  const etiquetaSelect = document.getElementById('difusion-etiqueta');
  if (etiquetaSelect) {
    etiquetaSelect.innerHTML = '<option value="">Seleccioná una etiqueta...</option>';
    DIFUSION_ETIQUETAS.forEach(et => {
      const opt = document.createElement('option');
      opt.value = et;
      opt.textContent = et;
      etiquetaSelect.appendChild(opt);
    });
  }
  const lista = document.getElementById('difusion-contactos-lista');
  if (!lista) return;
  lista.innerHTML = DIFUSION_CONTACTOS.map(c => `
    <label style="display:flex; align-items:center; gap:6px; padding:4px 0; cursor:pointer;">
      <input type="checkbox" class="difusion-contacto-check" value="${c._id}" />
      <span>${escaparHTML(c.nombre || 'Sin nombre')} (${escaparHTML(c.telefono)})</span>
    </label>
  `).join('');
  sincronizarCheckboxesConEtiqueta();
}

function obtenerIdsDestinatarios() {
  const ids = new Set();
  const destTodos = document.getElementById('difusion-dest-todos')?.checked;
  const destEtiqueta = document.getElementById('difusion-dest-etiqueta')?.checked;
  const destManual = document.getElementById('difusion-dest-manual')?.checked;

  if (destTodos) {
    DIFUSION_CONTACTOS.forEach(c => ids.add(c._id));
  }
  if (destEtiqueta) {
    const etiqueta = document.getElementById('difusion-etiqueta')?.value || '';
    if (etiqueta) {
      DIFUSION_CONTACTOS.filter(c => (c.etiquetas || []).includes(etiqueta)).forEach(c => ids.add(c._id));
    }
  }
  if (destManual) {
    document.querySelectorAll('.difusion-contacto-check:checked').forEach(cb => ids.add(cb.value));
  }
  return ids;
}

function actualizarContadorDestinatarios() {
  const span = document.getElementById('difusion-destinatarios-count');
  if (span) span.textContent = obtenerIdsDestinatarios().size;
}

function sincronizarCheckboxesConEtiqueta() {
  const etiqueta = document.getElementById('difusion-etiqueta')?.value || '';
  const destEtiqueta = document.getElementById('difusion-dest-etiqueta')?.checked || false;
  if (!destEtiqueta || !etiqueta) return;
  document.querySelectorAll('.difusion-contacto-check').forEach(cb => {
    const contacto = DIFUSION_CONTACTOS.find(c => c._id === cb.value);
    if (contacto && (contacto.etiquetas || []).includes(etiqueta)) {
      cb.checked = true;
    }
  });
  actualizarContadorDestinatarios();
}

function limpiarSeleccionManual() {
  document.querySelectorAll('.difusion-contacto-check').forEach(cb => cb.checked = false);
  actualizarContadorDestinatarios();
}

function cambiarModoEnvioDifusion() {
  const elegido = document.querySelector('input[name="difusion-modenvio"]:checked')?.value || 'ahora';
  const wrapper = document.getElementById('difusion-programacion-wrapper');
  const error = document.getElementById('difusion-fecha-error');
  if (wrapper) wrapper.style.display = elegido === 'programar' ? 'block' : 'none';
  if (error) error.style.display = 'none';
}

function validarFechaProgramacionDifusion() {
  const input = document.getElementById('difusion-fecha-programacion');
  const error = document.getElementById('difusion-fecha-error');
  if (!input || !error) return true;
  const valor = input.value;
  if (!valor) {
    error.textContent = 'Seleccioná fecha y hora';
    error.style.display = 'block';
    return false;
  }
  const fecha = new Date(valor);
  const ahora = new Date();
  if (fecha <= ahora) {
    error.textContent = 'La fecha debe ser a futuro';
    error.style.display = 'block';
    return false;
  }
  error.style.display = 'none';
  return true;
}

function poblarSelectPlantillas() {
  const select = document.getElementById('difusion-plantilla-select');
  if (!select) return;
  select.innerHTML = '';
  MOCK_PLANTILLAS.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.nombre;
    select.appendChild(opt);
  });
  mostrarVistaPreviaPlantilla();
}

async function cargarPlantillasDesdeMeta() {
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch('/api/whatsapp/plantillas', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok && data.plantillas && data.plantillas.length > 0) {
      PLANTILLAS_META = data.plantillas;
      MOCK_PLANTILLAS = data.plantillas;
      poblarSelectPlantillas();
    }
  } catch (error) {
    console.error('Error al cargar plantillas desde Meta:', error);
  }
}

function actualizarAvisoVentana() {
  const aviso = document.getElementById('aviso-ventana-cerrada');
  if (!aviso) return;
  const conv = getConversacionPorId(chatActivoId);
  if (conv && conv.ventanaAbierta === false) {
    aviso.classList.remove('hidden');
  } else {
    aviso.classList.add('hidden');
  }
}

async function abrirModalPlantillaChat() {
  const select = document.getElementById('plantilla-select-chat');
  const modal = document.getElementById('modal-plantilla-ventana');
  if (!select || !modal) return;

  select.innerHTML = '';
  if (PLANTILLAS_META.length === 0) {
    await cargarPlantillasDesdeMeta();
  }

  PLANTILLAS_META.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.nombre;
    select.appendChild(opt);
  });

  if (PLANTILLAS_META.length > 0) {
    select.value = PLANTILLAS_META[0].id;
    actualizarVariablesPlantillaChat();
  }

  modal.classList.remove('hidden');
}

function actualizarVariablesPlantillaChat() {
  const select = document.getElementById('plantilla-select-chat');
  const contenedor = document.getElementById('plantilla-variables-chat');
  if (!select || !contenedor) return;

  const plantilla = PLANTILLAS_META.find(p => p.id === select.value);
  contenedor.innerHTML = '';
  if (!plantilla) return;

  const matches = plantilla.texto.match(/\{\{[0-9]+\}\}/g) || [];
  const unicas = [...new Set(matches)];

  unicas.forEach(match => {
    const num = match.replace(/[{}]/g, '');
    const conv = getConversacionPorId(chatActivoId);
    const contacto = getContactoPorId(conv?.contactoId);
    let valor = '';
    if (num === '1' && contacto?.nombre) valor = contacto.nombre;

    const div = document.createElement('div');
    div.style.marginBottom = '8px';
    div.innerHTML = `
      <label style="font-size:13px; font-weight:bold;">{{${num}}}</label>
      <input type="text" class="plantilla-variable-input" data-var="${num}" value="${escaparHTML(valor)}" style="width:100%; padding:6px; border:1px solid #d1d5db; border-radius:6px; margin-top:4px;" />
    `;
    contenedor.appendChild(div);
  });

  const preview = document.createElement('div');
  preview.style.marginTop = '10px';
  preview.style.padding = '10px';
  preview.style.background = '#f3f4f6';
  preview.style.borderRadius = '6px';
  preview.style.fontSize = '13px';
  preview.innerHTML = `<strong>Preview:</strong><br><span id="plantilla-preview-texto">${escaparHTML(plantilla.texto.replace(/\{\{[0-9]+\}\}/g, '...'))}</span>`;
  contenedor.appendChild(preview);
}

async function enviarPlantillaDesdeChat() {
  const select = document.getElementById('plantilla-select-chat');
  const plantillaId = select?.value;
  if (!plantillaId || !chatActivoId) return;

  const variables = [];
  document.querySelectorAll('.plantilla-variable-input').forEach(input => {
    const num = parseInt(input.dataset.var);
    variables[num - 1] = input.value.trim();
  });
  const variablesFiltradas = variables.map(v => v || '');

  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch('/api/whatsapp/enviar-plantilla', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ conversacionId: chatActivoId, plantillaId, variables: variablesFiltradas })
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarToast(data.error || 'Error al enviar plantilla', 'error');
      return;
    }
    const conv = getConversacionPorId(chatActivoId);
    if (conv) conv.ventanaAbierta = true;
    document.getElementById('modal-plantilla-ventana').classList.add('hidden');
    await cargarConversaciones();
    mostrarToast('Plantilla enviada correctamente', 'info');
  } catch (error) {
    console.error('Error enviando plantilla:', error);
    mostrarToast('Error de red al enviar plantilla', 'error');
  }
}

function cambiarTipoMensaje() {
  const tipo = document.querySelector('input[name="difusion-tipo-mensaje"]:checked')?.value || 'libre';
  const divLibre = document.getElementById('difusion-mensaje-libre');
  const divPlantilla = document.getElementById('difusion-plantilla-wrapper');
  const preview = document.getElementById('difusion-plantilla-preview');
  if (tipo === 'plantilla') {
    if (divLibre) divLibre.style.display = 'none';
    if (divPlantilla) divPlantilla.style.display = 'block';
    if (preview) preview.style.display = 'block';
    mostrarVistaPreviaPlantilla();
  } else {
    if (divLibre) divLibre.style.display = 'block';
    if (divPlantilla) divPlantilla.style.display = 'none';
    if (preview) preview.style.display = 'none';
  }
}

function mostrarVistaPreviaPlantilla() {
  const select = document.getElementById('difusion-plantilla-select');
  const preview = document.getElementById('difusion-plantilla-preview');
  const textoEl = document.getElementById('difusion-plantilla-preview-texto');
  if (!select || !preview || !textoEl) return;
  const id = select.value;
  const plantilla = MOCK_PLANTILLAS.find(p => p.id === id);
  if (plantilla) {
    textoEl.textContent = plantilla.texto;
  } else {
    textoEl.textContent = '';
  }
}

async function cargarDifusiones() {
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch('/api/difusiones', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      console.log('[cargarDifusiones] HTTP error:', res.status);
      return;
    }
    const data = await res.json();
    const difusiones = data.difusiones || [];
    renderDifusiones(difusiones);
  } catch (error) {
    console.error('Error al cargar difusiones:', error);
  }
  await cargarOpcionesDifusion();
}

function renderDifusiones(difusiones) {
  const cont = document.getElementById('difusiones-lista');
  const btnHistorial = document.getElementById('btn-ver-historial');
  if (!cont) return;

  const total = difusiones.length;

  // Mostrar botón si hay alguna difusión
  if (btnHistorial) {
    if (total === 0) {
      btnHistorial.style.display = 'none';
      cont.innerHTML = '<span style="color:#9CA3AF;">Sin difusiones todavía</span>';
      return;
    }
    btnHistorial.style.display = 'block';
    const chevron = mostrarTodasDifusiones ? '▴' : '▾';
    btnHistorial.textContent = `${chevron} ${mostrarTodasDifusiones ? 'Ocultar historial' : 'Ver historial'}`;
  }

  // Lista oculta por defecto
  if (!mostrarTodasDifusiones) {
    cont.innerHTML = '';
    return;
  }

  cont.innerHTML = difusiones.map(d => {
    const fechaTexto = d.fechaEnvio
      ? `Enviada: ${new Date(d.fechaEnvio).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`
      : d.fechaProgramacion
        ? `Programada: ${new Date(d.fechaProgramacion).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`
        : `Creada: ${new Date(d.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`;
    const puedeEnviar = (d.estado === 'borrador' || d.estado === 'programada') && d.estado !== 'enviando';
    const enviados = d.destinatariosEnviados || 0;
    const totalDest = d.destinatariosTotal || 0;
    const estadoLabel = d.estado === 'completada' ? 'Completada' : (d.estado || '');
    const estadoClass = d.estado === 'completada' ? 'difusion-badge-ok' : 'difusion-badge-default';
    const btnEnviar = puedeEnviar
      ? `<button class="difusion-btn-enviar" data-enviar-difusion="${d._id}" style="background:transparent;border:none;color:#2563eb;cursor:pointer;font-size:12px;">Enviar</button>`
      : '';
    return `<div class="difusion-fila" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 8px;border-bottom:1px solid #f3f4f6;">
      <span class="difusion-fila-mensaje" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;color:#111827;">${escaparHTML(d.mensaje || '')}</span>
      <span class="difusion-fila-meta" style="color:#9CA3AF;font-size:12px;white-space:nowrap;">${fechaTexto}</span>
      <span class="difusion-fila-meta" style="color:#9CA3AF;font-size:12px;white-space:nowrap;">${enviados}/${totalDest}</span>
      ${btnEnviar}
      <span class="difusion-badge ${estadoClass}" style="font-size:10px;padding:2px 8px;border-radius:8px;white-space:nowrap;">${estadoLabel}</span>
    </div>`;
  }).join('');
}

async function crearDifusionDesdePanel() {
  const tipoMensaje = document.querySelector('input[name="difusion-tipo-mensaje"]:checked')?.value || 'libre';
  let mensaje = '';
  let plantillaId = '';
  if (tipoMensaje === 'plantilla') {
    plantillaId = document.getElementById('difusion-plantilla-select')?.value || '';
    const plantilla = MOCK_PLANTILLAS.find(p => p.id === plantillaId);
    if (!plantilla) {
      mostrarToast('Seleccioná una plantilla', 'error');
      return;
    }
    mensaje = plantilla.texto;
  } else {
    mensaje = document.getElementById('difusion-mensaje')?.value?.trim() || '';
    if (!mensaje) {
      mostrarToast('Escribí un mensaje para la difusión', 'error');
      return;
    }
  }
  const modos = [];
  if (document.getElementById('difusion-dest-todos')?.checked) modos.push('todos');
  if (document.getElementById('difusion-dest-etiqueta')?.checked) modos.push('etiqueta');
  if (document.getElementById('difusion-dest-manual')?.checked) modos.push('manual');

  if (modos.length === 0) {
    mostrarToast('Elegí al menos un tipo de destinatario', 'error');
    return;
  }

  const etiqueta = document.getElementById('difusion-etiqueta')?.value || '';
  const contactosIds = Array.from(document.querySelectorAll('.difusion-contacto-check:checked')).map(cb => cb.value);

  const modoEnvio = document.querySelector('input[name="difusion-modenvio"]:checked')?.value || 'ahora';
  let fechaProgramacion = '';
  if (modoEnvio === 'programar') {
    if (!validarFechaProgramacionDifusion()) {
      return;
    }
    fechaProgramacion = document.getElementById('difusion-fecha-programacion')?.value || '';
  }

  const payload = { mensaje, plantillaId, tipoMensaje, tipoDestinatario: modos };
  if (modos.includes('etiqueta')) payload.etiqueta = etiqueta;
  if (modos.includes('manual')) payload.contactosIds = contactosIds;
  if (fechaProgramacion) payload.fechaProgramacion = new Date(fechaProgramacion).toISOString();

  if (modos.includes('etiqueta') && !etiqueta) {
    mostrarToast('Elegí una etiqueta', 'error');
    return;
  }
  if (modos.includes('manual') && contactosIds.length === 0) {
    mostrarToast('Seleccioná al menos un contacto', 'error');
    return;
  }

  const token = localStorage.getItem('token') || '';
  let difusionId = null;
  try {
    const res = await fetch('/api/difusiones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarToast(data.error || 'Error al crear difusión', 'error');
      return;
    }
    difusionId = data.difusion._id;
  } catch (error) {
    console.error('Error de red al crear difusión:', error);
    mostrarToast('Error al crear difusión', 'error');
    return;
  }

  // Limpiar formulario
  document.getElementById('difusion-mensaje').value = '';
  const fechaInput = document.getElementById('difusion-fecha-programacion');
  if (fechaInput) fechaInput.value = '';
  limpiarSeleccionManual();

  if (modoEnvio === 'ahora' && difusionId) {
    await enviarDifusionDesdePanel(difusionId, true);
  } else {
    await cargarDifusiones();
    mostrarToast('Difusión programada correctamente', 'info');
  }
}

async function enviarDifusionDesdePanel(difusionId, mostrarExito = false) {
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/difusiones/${difusionId}/enviar`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) {
      const errores = data?.errores || [];
      if (Array.isArray(errores) && errores.length > 0) {
        const detalle = errores.map(e => `${e?.telefono || ''}: ${e?.error || e}`).join('\n');
        mostrarToast(`${data?.error || 'Error al enviar difusión'}\n\nDetalle:\n${detalle}`, 'error');
      } else {
        mostrarToast(data?.error || 'Error al enviar difusión', 'error');
      }
      await cargarDifusiones();
      return false;
    }
    await cargarDifusiones();
    if (mostrarExito) mostrarToast('Difusión enviada correctamente', 'info');
    return true;
  } catch (error) {
    console.error('Error enviando difusión:', error);
    mostrarToast('Error enviando difusión', 'error');
    return false;
  }
}

async function actualizarCostosManual() {
  const token = localStorage.getItem('token') || '';
  const btn = document.getElementById('btn-actualizar-costos');
  const estadoEl = document.getElementById('meta-actualizacion-estado');
  if (btn) btn.disabled = true;
  if (estadoEl) estadoEl.textContent = 'Actualizando...';
  try {
    const res = await fetch('/api/whatsapp/meta/actualizar-costos', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al actualizar costos');
    const meta = data.meta || {};
    const costoEl = document.getElementById('meta-costo-total');
    if (costoEl) costoEl.textContent = meta.costoTotal || '0';
    const fechaEl = document.getElementById('meta-ultima-actualizacion');
    if (fechaEl && meta.ultimaActualizacion) {
      fechaEl.textContent = new Date(meta.ultimaActualizacion).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    } else if (fechaEl) {
      fechaEl.textContent = 'Sin datos';
    }
    if (estadoEl) estadoEl.textContent = 'Actualizado correctamente';
  } catch (error) {
    console.error('Error al actualizar costos manualmente:', error);
    if (estadoEl) estadoEl.textContent = 'Error al actualizar costos';
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function cargarMonedero() {
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch('/api/whatsapp/monedero', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const mono = data.monedero || {};

    const saldoEl = document.getElementById('monedero-saldo');
    if (saldoEl) saldoEl.textContent = (mono.saldoUsd ?? 0).toFixed(2);

    const costoEl = document.getElementById('monedero-costo-ciclo');
    if (costoEl) costoEl.textContent = (mono.costoUsdCiclo ?? 0).toFixed(2);

    const deudaEl = document.getElementById('monedero-deuda');
    if (deudaEl) deudaEl.textContent = (mono.deudaPendienteUsd ?? 0).toFixed(2);

    const toleranciaEl = document.getElementById('monedero-tolerancia');
    if (toleranciaEl) toleranciaEl.textContent = (mono.deudaToleradaUsd ?? 5).toFixed(2);

    const bloqueadoMsg = document.getElementById('monedero-bloqueado-msg');
    if (bloqueadoMsg) {
      bloqueadoMsg.style.display = mono.monederoBloqueado ? 'block' : 'none';
    }

    const banner = document.getElementById('monedero-aviso-banner');
    if (banner) {
      if (mono.monederoBloqueado) {
        banner.style.display = 'none';
      } else {
        const ratio = mono.deudaToleradaUsd > 0 ? (mono.deudaPendienteUsd / mono.deudaToleradaUsd) : 0;
        if (ratio >= 0.7) {
          banner.textContent = `⚠️ Cargá saldo: ya usaste el ${Math.round(ratio * 100)}% de tu fiado.`;
          banner.style.display = 'block';
        } else {
          banner.style.display = 'none';
        }
      }
    }

    const btnCargar = document.getElementById('monedero-cargar-btn');
    if (btnCargar && !btnCargar.dataset.listener) {
      btnCargar.dataset.listener = 'true';
      btnCargar.addEventListener('click', cargarSaldoMonedero);
    }
  } catch (error) {
    console.error('Error al cargar monedero:', error);
  }
}

async function cargarSaldoMonedero() {
  const token = localStorage.getItem('token') || '';
  const input = document.getElementById('monedero-cargar-monto');
  const monto = parseFloat(input?.value || '');
  if (!monto || isNaN(monto) || monto <= 0) {
    mostrarToast('Ingresá un monto válido', 'error');
    return;
  }
  try {
    const res = await fetch('/api/whatsapp/admin/monedero/cargar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ montoUsd: monto })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al cargar saldo');
    if (input) input.value = '';
    mostrarToast(data.message || 'Saldo cargado', 'info');
    cargarMonedero();
  } catch (error) {
    console.error('Error al cargar saldo:', error);
    mostrarToast('Error al cargar saldo', 'error');
  }
}

async function guardarPromptDesdePanel() {
  const prompt = document.getElementById('prompt-ia');
  if (!prompt) return;
  const aplicarATodasPrompt = document.getElementById('aplicar-prompt-todas')?.checked || false;
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch('/api/whatsapp/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ promptIA: prompt.value, aplicarATodasPrompt })
    });
    if (!res.ok) throw new Error('Error al guardar prompt');
    mostrarToast('Prompt guardado correctamente', 'info');
  } catch (error) {
    console.error('Error al guardar prompt:', error);
  }
}

async function guardarAtajosDesdePanel({ mostrarCartel = true } = {}) {
  const tbody = document.getElementById('atajos-body');
  if (!tbody) return;
  const atajos = Array.from(tbody.querySelectorAll('tr')).map(tr => ({
    comando: tr.querySelector('.atajo-comando')?.value?.trim() || '',
    respuesta: tr.querySelector('.atajo-respuesta')?.value?.replace(/<br\s*\/?>/gi, '\n').trim() || ''
  })).filter(a => a.comando && a.respuesta);

  const aplicarATodasAtajos = document.getElementById('aplicar-atajos-todas')?.checked || false;

  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch('/api/whatsapp/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ atajos, aplicarATodasAtajos })
    });
    if (!res.ok) throw new Error('Error al guardar atajos');
    if (mostrarCartel) mostrarToast('Atajos guardados correctamente', 'info');

    // Actualizar la lista de atajos para el autocompletado en el chat
    ATAJOS_RAPIDOS = atajos.map(a => ({
      atajo: a.comando,
      mensaje: String(a.respuesta || '').replace(/<br\s*\/?>/gi, '\n')
    }));

    // Ocultar todos los tildes de confirmación
    tbody.querySelectorAll('.atajo-guardar').forEach(btn => {
      btn.style.display = 'none';
    });
  } catch (error) {
    console.error('Error al guardar atajos:', error);
  }
}

function guardarHorariosDesdePanel() {
  const inputsOpen = document.querySelectorAll('.horario-apertura');
  const inputsClose = document.querySelectorAll('.horario-cierre');
  const horarios = [];

  inputsOpen.forEach(inp => {
    const dia = inp.dataset.dia;
    const apertura = inp.value;
    const cierre = inputsClose.find(c => c.dataset.dia === dia)?.value || '';
    if (dia && apertura && cierre) {
      horarios.push({ dia, apertura, cierre });
    }
  });

  const token = localStorage.getItem('token') || '';
  fetch('/api/whatsapp/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ horariosEstructurados: horarios })
  })
    .then(res => res.json())
    .then(data => {
      if (data.ok) mostrarToast('Horarios guardados correctamente', 'info');
      else mostrarToast('Error al guardar horarios', 'error');
    })
    .catch(err => console.error(err));
}

function agregarAtajo() {
  const comando = document.getElementById('atajo-comando-input')?.value?.trim() || '';
  const respuesta = document.getElementById('atajo-respuesta-input')?.value?.replace(/<br\s*\/?>/gi, '\n').trim() || '';
  if (!comando || !respuesta) return;
  const tbody = document.getElementById('atajos-body');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="atajo-comando" value="${escaparHTML(comando)}"></td>
    <td><textarea class="atajo-respuesta" rows="2">${escaparHTML(respuesta)}</textarea></td>
    <td>
      <button class="atajo-guardar" type="button" style="display:none;" title="Confirmar cambios">✓</button>
      <button class="atajo-eliminar" type="button">×</button>
    </td>
  `;
  tbody.appendChild(tr);
  document.getElementById('atajo-comando-input').value = '';
  document.getElementById('atajo-respuesta-input').value = '';
  // Guardar automáticamente al agregar un nuevo atajo
  guardarAtajosDesdePanel();
}

function initConfigSidebar() {
  // Mostrar/ocultar paneles de configuración
  const configItems = document.querySelectorAll('.config-item[data-panel]');
  configItems.forEach(item => {
    item.addEventListener('click', () => {
      activarPanelConfig(item.dataset.panel);
    });
  });

  // Sliders de tono de comunicación
  const sliders = document.querySelectorAll('input[type="range"]');
  sliders.forEach(slider => {
    slider.addEventListener('input', (e) => {
      const valorSpan = document.getElementById(slider.id + '-valor');
      if (valorSpan) {
        valorSpan.textContent = e.target.value;
      }
    });
  });

  // Botones de guardado de prompt y atajos
  const btnGuardarPrompt = document.getElementById('btn-guardar-prompt');
  if (btnGuardarPrompt) btnGuardarPrompt.addEventListener('click', guardarPromptDesdePanel);

  const btnRestaurarPrompt = document.getElementById('btn-restaurar-prompt');
  if (btnRestaurarPrompt) {
    btnRestaurarPrompt.addEventListener('click', () => {
      const promptEl = document.getElementById('prompt-ia');
      if (promptEl) promptEl.value = PROMPT_DEFAULT;
    });
  }

  const btnGuardarAtajos = document.getElementById('btn-guardar-atajos');
  if (btnGuardarAtajos) btnGuardarAtajos.addEventListener('click', guardarAtajosDesdePanel);

  const btnAgregarAtajo = document.getElementById('atajo-agregar');
  if (btnAgregarAtajo) btnAgregarAtajo.addEventListener('click', agregarAtajo);

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('atajo-eliminar')) {
      e.target.closest('tr')?.remove();
      guardarAtajosDesdePanel({ mostrarCartel: false });
    }
  });

  // Mostrar tilde de confirmación al editar cualquier campo de atajo
  const atajosBody = document.getElementById('atajos-body');
  if (atajosBody) {
    atajosBody.addEventListener('input', (e) => {
      const target = e.target;
      if (target.classList.contains('atajo-comando') || target.classList.contains('atajo-respuesta')) {
        const tr = target.closest('tr');
        const btnGuardar = tr?.querySelector('.atajo-guardar');
        if (btnGuardar) btnGuardar.style.display = 'inline-flex';
      }
    });

    // Guardar al hacer clic en el tilde de confirmación
    atajosBody.addEventListener('click', (e) => {
      const btnGuardar = e.target.closest('.atajo-guardar');
      if (!btnGuardar) return;
      e.preventDefault();
      e.stopPropagation();
      guardarAtajosDesdePanel({ mostrarCartel: false });
    });
  }

  // Confirmación al aplicar atajos a todas las líneas
  const aplicarAtajosCheck = document.getElementById('aplicar-atajos-todas');
  if (aplicarAtajosCheck) {
    aplicarAtajosCheck.addEventListener('change', function(e) {
      if (e.target.checked) {
        const ok = confirm('¿Aplicar los atajos actuales a todas las líneas?\nSe guardarán automáticamente.');
        if (!ok) {
          e.target.checked = false;
          return;
        }
        guardarAtajosDesdePanel();
      }
    });
  }

  // Guardar preferencia de audios
  const btnGuardarAudios = document.getElementById('btn-guardar-audios');
  if (btnGuardarAudios) {
    btnGuardarAudios.addEventListener('click', async () => {
      const token = localStorage.getItem('token') || '';
      const procesarAudios = document.getElementById('procesar-audios')?.checked || false;
      try {
        const res = await fetch('/api/whatsapp/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ procesarAudios })
        });
        if (!res.ok) throw new Error('Error al guardar preferencia de audios');
        alert('Preferencia de audios guardada correctamente');
      } catch (error) {
        console.error('Error al guardar preferencia de audios:', error);
      }
    });
  }

  // Cargar configuración guardada al abrir la pantalla
  cargarConfiguracion();
}

async function guardarFotoPerfil(file, posicion) {
  const token = localStorage.getItem('token') || '';
  const formData = new FormData();
  formData.append('foto', file);
  formData.append('fotoPosicion', posicion || '50% 50%');
  
  const estadoDisplay = document.getElementById('perfil-estado-display');
  const bienvenidaDisplay = document.getElementById('perfil-bienvenida-display');
  formData.append('estado', estadoDisplay?.textContent?.trim() || '');
  formData.append('bienvenida', bienvenidaDisplay?.textContent?.trim() || '');
  
  try {
    const res = await fetch('/api/whatsapp/config', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    if (!res.ok) throw new Error('Error al guardar foto');
    const data = await res.json();
    const nuevaFoto = data.empresa?.fotoPerfil;
    const nuevaPos = data.empresa?.fotoPosicion || posicion || '50% 50%';
    if (nuevaFoto) {
      const fotoGrande = document.getElementById('perfil-foto-grande');
      if (fotoGrande) {
        fotoGrande.src = urlFotoConToken(nuevaFoto);
        fotoGrande.style.objectPosition = nuevaPos;
      }
      const fotoPreview = document.getElementById('config-foto-preview');
      if (fotoPreview) {
        fotoPreview.src = urlFotoConToken(nuevaFoto);
        fotoPreview.style.objectPosition = nuevaPos;
        fotoPreview.style.display = 'block';
      }
    }
  } catch (error) {
    console.error('Error de red al guardar foto:', error);
    mostrarToast('No se pudo guardar la foto. Verificá tu conexión.', 'error');
    throw error;
  }
}

function abrirModalFoto(file) {
  fotoCropFile = file;
  const img = document.getElementById('crop-imagen');
  const modal = document.getElementById('modal-foto-recortar');
  if (!img || !modal) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    img.onload = () => {
      inicializarRecorteFoto();
    };
    img.src = e.target.result;
    img.style.objectPosition = '50% 50%';
    modal.classList.remove('hidden');
    requestAnimationFrame(() => inicializarRecorteFoto());
  };
  reader.readAsDataURL(file);
  const input = document.getElementById('config-foto');
  if (input) input.value = '';
}

function cerrarModalFoto() {
  const modal = document.getElementById('modal-foto-recortar');
  if (modal) modal.classList.add('hidden');
  fotoCropFile = null;
}






async function aceptarFoto() {
  if (!fotoCropFile) return;
  try {
    const dataUrl = await generarRecorteCircular();
    if (dataUrl) {
      const fotoGrande = document.getElementById('perfil-foto-grande');
      if (fotoGrande) {
        fotoGrande.src = dataUrl;
        fotoGrande.style.objectPosition = '50% 50%';
      }
      // Convertir dataUrl a Blob para subir al servidor
      const resp = await fetch(dataUrl);
      if (!resp.ok) throw new Error('No se pudo convertir la imagen');
      const blob = await resp.blob();
      await guardarFotoPerfil(blob, '50% 50%');
    } else {
      await guardarFotoPerfil(fotoCropFile, '50% 50%');
    }
  } catch (err) {
    console.error('Error al guardar la foto:', err);
    mostrarToast('No se pudo guardar la foto. Intentá de nuevo.', 'error');
    // Si el recorte falla, intentamos subir la imagen original
    try {
      await guardarFotoPerfil(fotoCropFile, '50% 50%');
    } catch (e) {
      console.error('Error incluso con la imagen original:', e);
    }
  } finally {
    cerrarModalFoto();
  }
}

function previewFoto() {
  const input = document.getElementById('config-foto');
  if (!input || input.files.length === 0) return;
  abrirModalFoto(input.files[0]);
}

function inicializarRecorteFoto() {
  const area = document.getElementById('crop-area');
  const circle = document.getElementById('crop-circulo');
  const img = document.getElementById('crop-imagen');
  if (!area || !circle || !img) return;

  const areaW = area.clientWidth || area.offsetWidth;
  const areaH = area.clientHeight || area.offsetHeight;
  if (areaW === 0 || areaH === 0) return;

  const imgNatW = img.naturalWidth || areaW;
  const imgNatH = img.naturalHeight || areaH;

  // Escala para cubrir el área (object-fit: cover)
  const scale = Math.max(areaW / imgNatW, areaH / imgNatH);
  const dispW = imgNatW * scale;
  const dispH = imgNatH * scale;

  const D = Math.min(150, Math.min(dispW, dispH) * 0.8);
  // El visor ya está centrado con CSS (inset:0; margin:auto)
  // solo aseguramos su tamaño
  circle.style.width = D + 'px';
  circle.style.height = D + 'px';

  // Posicionamos la imagen en el origen del contenedor
  img.style.position = 'absolute';
  img.style.left = '0px';
  img.style.top = '0px';
  img.style.width = dispW + 'px';
  img.style.height = dispH + 'px';
  img.style.objectFit = 'fill';
  img.style.objectPosition = '0 0';

  // Translate inicial centrado
  fotoCropTranslateX = (areaW - dispW) / 2;
  fotoCropTranslateY = (areaH - dispH) / 2;
  img.style.transform = `translate(${fotoCropTranslateX}px, ${fotoCropTranslateY}px)`;

  // Límites para que el visor nunca quede fuera de la imagen
  fotoCropMinTranslateX = areaW / 2 - (dispW - D / 2);
  fotoCropMaxTranslateX = areaW / 2 - D / 2;
  fotoCropMinTranslateY = areaH / 2 - (dispH - D / 2);
  fotoCropMaxTranslateY = areaH / 2 - D / 2;
}

function generarRecorteCircular() {
  return new Promise((resolve) => {
    const area = document.getElementById('crop-area');
    const circle = document.getElementById('crop-circulo');
    const img = document.getElementById('crop-imagen');
    if (!area || !circle || !img) return resolve(null);
    if (!img.complete || img.naturalWidth === 0) return resolve(null);

    const areaRect = area.getBoundingClientRect();
    const circleRect = circle.getBoundingClientRect();

    const areaW = area.clientWidth || areaRect.width;
    const areaH = area.clientHeight || areaRect.height;

    const D = circleRect.width;
    const centerXenArea = circleRect.left - areaRect.left + D / 2;
    const centerYenArea = circleRect.top - areaRect.top + D / 2;

    const imgNatW = img.naturalWidth;
    const imgNatH = img.naturalHeight;

    const scale = Math.max(areaW / imgNatW, areaH / imgNatH);
    const dispW = imgNatW * scale;
    const dispH = imgNatH * scale;

    const translateX = fotoCropTranslateX;
    const translateY = fotoCropTranslateY;

    // Punto del visor en coordenadas de la imagen (en px de la imagen renderizada)
    const imgCoordX = centerXenArea - translateX;
    const imgCoordY = centerYenArea - translateY;

    // Convertir a coordenadas originales de la imagen (natural)
    const srcScaleX = imgNatW / dispW;
    const srcScaleY = imgNatH / dispH;

    const centerXOrig = imgCoordX * srcScaleX;
    const centerYOrig = imgCoordY * srcScaleY;
    const radiusOrig = (D / 2) * srcScaleX; // asumiendo cuadrado

    const size = Math.max(1, Math.round(radiusOrig * 2));
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);

    ctx.drawImage(
      img,
      centerXOrig - radiusOrig,
      centerYOrig - radiusOrig,
      radiusOrig * 2,
      radiusOrig * 2,
      0,
      0,
      size,
      size
    );

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    resolve(dataUrl);
  });
}

function setupCropFotoEventos() {
  const btnAceptar = document.getElementById('crop-aceptar');
  if (btnAceptar) btnAceptar.addEventListener('click', aceptarFoto);

  const btnCancelar = document.getElementById('crop-cancelar');
  if (btnCancelar) btnCancelar.addEventListener('click', cerrarModalFoto);

  const area = document.getElementById('crop-area');
  const circle = document.getElementById('crop-circulo');
  if (!area || !circle) return;

  const img = document.getElementById('crop-imagen');
  if (!img) return;

  function aplicarTranslate(x, y) {
    x = Math.min(fotoCropMaxTranslateX, Math.max(fotoCropMinTranslateX, x));
    y = Math.min(fotoCropMaxTranslateY, Math.max(fotoCropMinTranslateY, y));
    fotoCropTranslateX = x;
    fotoCropTranslateY = y;
    img.style.transform = `translate(${x}px, ${y}px)`;
  }

  area.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    fotoCropDragStartX = e.clientX;
    fotoCropDragStartY = e.clientY;
    fotoCropDragStartTranslateX = fotoCropTranslateX;
    fotoCropDragStartTranslateY = fotoCropTranslateY;
    fotoCropArrastrando = true;
    if (area.setPointerCapture) {
      try { area.setPointerCapture(e.pointerId); } catch (_) {}
    }
  });

  area.addEventListener('pointermove', (e) => {
    if (!fotoCropArrastrando) return;
    e.preventDefault();
    const deltaX = e.clientX - fotoCropDragStartX;
    const deltaY = e.clientY - fotoCropDragStartY;
    aplicarTranslate(fotoCropDragStartTranslateX + deltaX, fotoCropDragStartTranslateY + deltaY);
  });

  const terminarPointer = (e) => {
    if (!fotoCropArrastrando) return;
    fotoCropArrastrando = false;
    if (area.hasPointerCapture && e.pointerId !== undefined) {
      try { area.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  };

  area.addEventListener('pointerup', terminarPointer);
  area.addEventListener('pointercancel', terminarPointer);
}

function renderAtajosMenu(filtro) {
  const contenedor = document.getElementById('atajos-flotante');
  if (!contenedor) return;

  const texto = filtro.toLowerCase();
  const items = ATAJOS_RAPIDOS.filter(a => a.atajo.toLowerCase().startsWith(texto));

  if (items.length === 0) {
    contenedor.classList.remove('visible');
    return;
  }

  contenedor.innerHTML = items.map((a, idx) => {
    const atajoSeguro = escaparHTML(a.atajo);
    const mensajeSeguro = escaparHTML(a.mensaje);
    return `
    <div class="atajo-item" data-atajo-index="${idx}">
      <span class="atajo-comando">/${atajoSeguro}</span>
      <span class="atajo-mensaje">${mensajeSeguro}</span>
    </div>
  `}).join('');

  contenedor.querySelectorAll('.atajo-item').forEach(item => {
    item.addEventListener('click', function() {
      const index = Number(this.dataset.atajoIndex);
      const atajoSeleccionado = items[index];
      if (atajoSeleccionado) seleccionarAtajo(atajoSeleccionado);
    });
  });

  contenedor.classList.add('visible');
}

function ocultarMenuAtajos() {
  const contenedor = document.getElementById('atajos-flotante');
  if (contenedor) {
    contenedor.classList.remove('visible');
    contenedor.innerHTML = '';
  }
}

function manejarInputMensaje(e) {
  const input = e.target;
  autoAjustarTextarea(input);
  const valor = input.value;
  if (!valor.includes('/')) {
    ocultarMenuAtajos();
    return;
  }
  // Detectar la barra más reciente y el texto que la sigue
  const regexSlash = /\/(\S*)$/;
  const match = valor.match(regexSlash);
  if (match) {
    const textoBusqueda = match[1].toLowerCase();
    // Si el texto coincide exactamente con un atajo, reemplazarlo automáticamente
    const atajoExacto = ATAJOS_RAPIDOS.find(a => a.atajo.toLowerCase() === textoBusqueda);
    if (atajoExacto) {
      const inicio = match.index;
      input.value = valor.substring(0, inicio) + atajoExacto.mensaje;
      autoAjustarTextarea(input);
      ocultarMenuAtajos();
      input.focus();
      return;
    }
    // Si no coincide exacto, mostramos el menú con las coincidencias parciales
    renderAtajosMenu(textoBusqueda);
  } else {
    ocultarMenuAtajos();
  }
}

function seleccionarAtajo(atajo) {
  const input = document.getElementById('input-mensaje');
  if (!input) return;

  const valor = input.value;
  // Reemplazar el último slash seguido de texto sin espacios
  const regex = /(\/\S*)$/;
  if (regex.test(valor)) {
    input.value = valor.replace(regex, atajo.mensaje);
  } else {
    input.value = atajo.mensaje;
  }

  autoAjustarTextarea(input);
  ocultarMenuAtajos();
  input.focus();
}

function activarEdicionNombre() {
  if (editandoNombre || guardandoNombre) return;

  const display = document.getElementById('perfil-nombre-display');
  if (!display) return;

  const valorActual = display.textContent.trim();

  // Ocultar texto estático y crear input
  display.style.display = 'none';
  let input = document.getElementById('perfil-nombre-input');
  if (!input) {
    input = document.createElement('input');
    input.id = 'perfil-nombre-input';
    input.type = 'text';
    input.maxLength = 60;
    input.className = 'perfil-nombre-input';
    display.parentNode.appendChild(input);
  }
  input.style.display = 'block';
  input.value = valorActual;

  editandoNombre = true;

  // Foco inmediato para escribir sin clic extra
  input.focus();

  input.addEventListener('keydown', function handler(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      guardarNombreDesdePerfil();
    }
  });

  input.addEventListener('blur', guardarNombreDesdePerfil);
}

async function guardarNombreDesdePerfil() {
  // Evita doble envío si se apreta Enter y después blur
  if (!editandoNombre || guardandoNombre) return;
  guardandoNombre = true;

  const input = document.getElementById('perfil-nombre-input');
  const display = document.getElementById('perfil-nombre-display');
  const valorNuevo = normalizarNombreLocal(input?.value || '');
  const valorAnterior = (display?.textContent || '').trim();

  if (valorNuevo && valorNuevo !== valorAnterior) {
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/whatsapp/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ nombre: valorNuevo })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      // Actualizar el texto estático
      if (display) display.textContent = valorNuevo;
      if (usuarioActual) usuarioActual.nombreDelLocal = valorNuevo;

      // También actualizamos la empresa en el selector si está visible
      const select = document.getElementById('select-whatsapp');
      if (select && select.options.length > 0) {
        const opt = select.options[select.selectedIndex];
        if (opt && opt.textContent) {
          opt.textContent = opt.textContent.replace(/^[^(]+/, valorNuevo);
        }
      }
    } catch (error) {
      console.error('Error al guardar nombre:', error);
      // Si falla, revertimos el input al valor anterior
      if (input) input.value = valorAnterior;
    }
  }

  // Volver a modo texto
  editandoNombre = false;
  guardandoNombre = false;
  if (input) input.remove();
  if (display) display.style.display = '';
}

function initEditarPerfil() {
  const btnEditar = document.getElementById('btn-editar-nombre');
  if (btnEditar) {
    btnEditar.addEventListener('click', activarEdicionNombre);
  }

  // Si ya hay usuario cargado, mostramos su nombre
  const display = document.getElementById('perfil-nombre-display');
  if (display && usuarioActual?.nombreDelLocal) {
    display.textContent = usuarioActual.nombreDelLocal;
  }

  // Configurar eventos del modal de recorte de foto
  setupCropFotoEventos();
}

function activarEdicionEstado() {
  if (editandoEstado || guardandoEstado) return;

  const display = document.getElementById('perfil-estado-display');
  if (!display) return;

  const valorActual = display.textContent.trim();

  // Ocultar texto estático y crear input
  display.style.display = 'none';
  let input = document.getElementById('perfil-estado-input');
  if (!input) {
    input = document.createElement('input');
    input.id = 'perfil-estado-input';
    input.type = 'text';
    input.maxLength = 200;
    input.className = 'perfil-nombre-input';
    display.parentNode.appendChild(input);
  }
  input.style.display = 'block';
  input.value = valorActual;

  editandoEstado = true;

  // Foco inmediato
  input.focus();

  input.addEventListener('keydown', function handler(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      guardarEstadoDesdePerfil();
    }
  });

  input.addEventListener('blur', guardarEstadoDesdePerfil);
}

async function guardarEstadoDesdePerfil() {
  // Evita doble envío si se apreta Enter y después blur
  if (!editandoEstado || guardandoEstado) return;
  guardandoEstado = true;

  const input = document.getElementById('perfil-estado-input');
  const display = document.getElementById('perfil-estado-display');
  const valorNuevo = (input?.value || '').trim();
  const valorAnterior = (display?.textContent || '').trim();

  if (valorNuevo && valorNuevo !== valorAnterior) {
    try {
      const token = localStorage.getItem('token') || '';
      const formData = new FormData();
      formData.append('estado', valorNuevo);
      const res = await fetch('/api/whatsapp/config', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) throw new Error('Error al guardar estado');

      // Actualizar el texto estático
      if (display) display.textContent = valorNuevo;
    } catch (error) {
      console.error('Error al guardar estado:', error);
      // Si falla, revertimos el input al valor anterior
      if (input) input.value = valorAnterior;
    }
  }

  // Volver a modo texto
  editandoEstado = false;
  guardandoEstado = false;
  if (input) input.remove();
  if (display) display.style.display = '';
}

function initEditarEstado() {
  const btnEditar = document.getElementById('btn-editar-estado');
  if (btnEditar) {
    btnEditar.addEventListener('click', activarEdicionEstado);
  }

  // Si ya hay estado cargado en la empresa, mostrarlo
  const display = document.getElementById('perfil-estado-display');
  if (display && usuarioActual?.estado) {
    display.textContent = usuarioActual.estado;
  }
}

function activarEdicionBienvenida() {
  if (editandoBienvenida || guardandoBienvenida) return;

  const display = document.getElementById('perfil-bienvenida-display');
  if (!display) return;

  const valorActual = bienvenidaActual;

  // Ocultar texto estático y crear input
  display.style.display = 'none';
  let input = document.getElementById('perfil-bienvenida-input');
  if (!input) {
    input = document.createElement('input');
    input.id = 'perfil-bienvenida-input';
    input.type = 'text';
    input.maxLength = 500;
    input.className = 'perfil-nombre-input';
    display.parentNode.appendChild(input);
  }
  input.style.display = 'block';
  input.value = valorActual;
  input.placeholder = 'Si dejás este campo vacío, el bot responderá directamente sin mensaje de bienvenida previo.';

  editandoBienvenida = true;

  // Foco inmediato
  input.focus();

  input.addEventListener('keydown', function handler(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      guardarBienvenidaDesdePerfil();
    }
  });

  input.addEventListener('blur', guardarBienvenidaDesdePerfil);
}

async function guardarBienvenidaDesdePerfil() {
  // Evita doble envío si se apreta Enter y después blur
  if (!editandoBienvenida || guardandoBienvenida) return;
  guardandoBienvenida = true;

  const input = document.getElementById('perfil-bienvenida-input');
  const display = document.getElementById('perfil-bienvenida-display');
  const valorNuevo = (input?.value || '').trim();
  const valorAnterior = bienvenidaActual;

  if (valorNuevo !== valorAnterior) {
    try {
      const token = localStorage.getItem('token') || '';
      const formData = new FormData();
      formData.append('bienvenida', valorNuevo);
      const res = await fetch('/api/whatsapp/config', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) throw new Error('Error al guardar bienvenida');

      // Actualizar estado global y texto en la interfaz
      bienvenidaActual = valorNuevo;
      if (display) display.textContent = valorNuevo;
    } catch (error) {
      console.error('Error al guardar bienvenida:', error);
      // Si falla, revertimos el input al valor anterior
      if (input) input.value = valorAnterior;
    }
  }

  // Volver a modo texto
  editandoBienvenida = false;
  guardandoBienvenida = false;
  if (input) input.remove();
  if (display) display.style.display = '';
}

function initEditarBienvenida() {
  const btnEditar = document.getElementById('btn-editar-bienvenida');
  if (btnEditar) {
    btnEditar.addEventListener('click', activarEdicionBienvenida);
  }

  // Si ya hay bienvenida cargado en la empresa, mostrarla
  const display = document.getElementById('perfil-bienvenida-display');
  if (display && usuarioActual?.bienvenida) {
    display.textContent = usuarioActual.bienvenida;
  }
}


function updateVisibilidad() {
  const app = document.getElementById('app');
  if (chatActivoId) {
    app.classList.remove('sin-chat');
  } else {
    app.classList.add('sin-chat');
  }

  const inputMensaje = document.getElementById('input-mensaje');
  const btnEnviar = document.getElementById('btn-enviar');
  if (inputMensaje && btnEnviar) {
    inputMensaje.disabled = !chatActivoId;
    btnEnviar.disabled = !chatActivoId;
  }
}

// ===== Vista móvil: mostrar bandeja al colapsar pantalla =====
function ajustarVistaMovil() {
  if (window.innerWidth <= 768 && chatActivoId) {
    chatActivoId = null;
    renderTodo();
  }
}

// ===== Carga de conversaciones desde API =====
async function cargarConversaciones() {
  if (USAR_MOCK_DATA) {
    // Modo mock: usamos los arrays definidos arriba
    CONVERSACIONES = [...MOCK_CONVERSACIONES];
    CONTACTOS = [...MOCK_CONTACTOS];
    MENSAJES = [...MOCK_MENSAJES];
    if (!chatActivoId && CONVERSACIONES.length > 0 && window.innerWidth > 768) {
      chatActivoId = CONVERSACIONES[0]._id;
    }
    renderTodo();
    return;
  }

  try {
    const token = localStorage.getItem('token') || '';
    const res = await fetch('/api/conversaciones', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (res.status === 401) {
      return;
    }

    if (!res.ok) {
      throw new Error(`Error HTTP: ${res.status}`);
    }

    const data = await res.json();
    console.log('[cargarConversaciones] 📦 Respuesta completa de /api/conversaciones:', data);
    console.log('[cargarConversaciones] convsApi count:', (data.conversaciones || []).length);
    console.log('[cargarConversaciones] empresas info:', data.empresas);
    const convsApi = data.conversaciones || [];

    const contactosMap = new Map();
    const mensajesAll = [];

    const conversacionesLocal = convsApi.map(conv => {
      const contacto = conv.contacto || {};
      const cId = contacto._id || conv.contactoId;
      const nombre = normalizarNombreLocal(contacto.nombre || '');
      const telefono = contacto.telefono || '';

      if (!contactosMap.has(cId)) {
        contactosMap.set(cId, {
          _id: cId,
          empresaId: conv.empresaId,
          telefono,
          nombre,
          direccion: contacto.direccion || '',
          pisoDepto: contacto.pisoDepto || '',
          codigoPostal: contacto.codigoPostal || '',
          etiquetas: Array.isArray(contacto.etiquetas) ? contacto.etiquetas : [],
          notas: Array.isArray(contacto.notas) ? contacto.notas : []
        });
      }

      if (conv.mensajes) {
        conv.mensajes.forEach(m => {
          mensajesAll.push({
            _id: m._id,
            conversacionId: conv._id,
            remitente: m.remitente,
            contenido: m.contenido,
            fecha: m.fecha ? new Date(m.fecha) : new Date(),
            estado: m.estado || 'enviado',
            fechaEstado: m.fechaEstado ? new Date(m.fechaEstado) : null,
            errorDetalle: m.errorDetalle || '',
            tipo: m.tipo || 'texto',
            urlArchivo: m.urlArchivo || '',
            duracionSegundos: m.duracionSegundos || null
          });
        });
      }

      return {
        _id: conv._id,
        empresaId: conv.empresaId,
        contactoId: cId,
        lineaReceptora: conv.lineaReceptora || '',
        numeroReceptor: conv.numeroReceptor || '',
        botActivo: conv.botActivo === false || conv.botActivo === 'false' ? false : true,
        estado: conv.estado || 'Abierto',
        ultimoMensaje: conv.ultimoMensaje || '',
        ultimaFecha: conv.updatedAt ? new Date(conv.updatedAt) : new Date(),
        cancelacionReciente: conv.tieneCancelacionReciente === true,
        ventanaAbierta: conv.ventanaAbierta !== false,
        tieneMas: conv.mensajes && conv.mensajes.length === 50,
        carrito: conv.carrito || [],
        carritoTotal: conv.carritoTotal || 0
      };
    });

    console.log('[cargarConversaciones] CONTACTOS armados:', contactosMap.size);
    console.log('[cargarConversaciones] CONVERSACIONES armadas:', conversacionesLocal.length);
    console.log('[cargarConversaciones] MENSAJES totales:', mensajesAll.length);
    CONTACTOS = Array.from(contactosMap.values());
    CONVERSACIONES = conversacionesLocal;
    MENSAJES = mensajesAll;

    // Obtener empresas del usuario para armar el selector
    const empresasInfo = data.empresas || [];
    EMPRESAS_INFO = empresasInfo;
    miEmpresaId = empresasInfo[0]?._id || null;
    if (empresasInfo.length > 0) {
      poblarSelectorWhatsApp(empresasInfo);
    } else {
      // Fallback: si el backend aún no devuelve empresas, usamos las líneas de las conversaciones
      const lineas = Array.from(new Set(conversacionesLocal.map(c => c.lineaReceptora).filter(Boolean)));
      poblarSelectorWhatsApp(lineas);
      if (lineas.length > 0 && (!whatsappSeleccionado || !lineas.includes(whatsappSeleccionado))) {
        whatsappSeleccionado = lineas[0];
      }
    }

    if (!chatActivoId && CONVERSACIONES.length > 0 && window.innerWidth > 768) {
      chatActivoId = CONVERSACIONES[0]._id;
    }

    // Conectar a Socket.io si aún no estamos conectados
    if (typeof io !== 'undefined' && !socket) {
      socket = io({
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
      });
      setupSocketListeners();
    }

    if (socket) {
      const salas = [...new Set(conversacionesLocal.map(c => c.empresaId).filter(Boolean))];
      salas.forEach(sala => socket.emit('join', sala));
    }

    renderTodo();
  } catch (error) {
    console.error('Error al cargar conversaciones:', error);
    mostrarToast('Error al cargar conversaciones. Verificá tu conexión.', 'error');
    renderTodo();
  }
}

async function cargarMasMensajes() {
  if (!chatActivoId || cargandoMensajes) return;
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const mensajesDeConv = getMensajesDeConversacion(chatActivoId);
  if (mensajesDeConv.length === 0) return;

  const antesDe = mensajesDeConv[0]._id;
  const token = localStorage.getItem('token') || '';
  console.log('[cargarMasMensajes] chatActivoId:', chatActivoId);
  console.log('[cargarMasMensajes] antesDe:', antesDe);
  console.log('[cargarMasMensajes] mensajesDeConv.length:', mensajesDeConv.length);
  cargandoMensajes = true;
  const btn = document.getElementById('cargar-mas-mensajes');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Cargando...';
  }
  try {
    const res = await fetch(`/api/conversaciones/${chatActivoId}/mensajes?before=${encodeURIComponent(antesDe)}&limit=50`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
    const data = await res.json();
    console.log('[cargarMasMensajes] Respuesta del endpoint:', data);
    const nuevos = data.mensajes || [];
    const existentes = getMensajesDeConversacion(chatActivoId);
    const idsExistentes = new Set(existentes.map(m => m._id));
    const unicos = nuevos.filter(m => !idsExistentes.has(m._id));
    console.log('[cargarMasMensajes] nuevos:', nuevos.length, '| existentes:', existentes.length, '| unicos:', unicos.length);
    const combinados = unicos.concat(existentes);
    console.log('[cargarMasMensajes] combinados:', combinados.length);
    MENSAJES = MENSAJES.filter(m => m.conversacionId !== chatActivoId).concat(combinados);

    conv.tieneMas = data.hasMore === true || nuevos.length === 50;

    const area = document.getElementById('area-mensajes');
    const prevScrollHeight = area ? area.scrollHeight : 0;
    const prevScrollTop = area ? area.scrollTop : 0;

    // Insertar los mensajes nuevos en el DOM sin re-renderizar todo el chat
    const htmlNuevos = unicos.map(msg => {
      let claseBurbuja = '';
      if (msg.remitente === 'cliente') claseBurbuja = 'bubble-cliente';
      else if (['bot', 'humano', 'ia', 'empresa'].includes(msg.remitente)) claseBurbuja = 'bubble-humano';
      else if (msg.remitente === 'nota_interna') claseBurbuja = 'bubble-nota';

      const contenidoSeguro = escaparHTML(msg.contenido || '').replace(/\n/g, '<br>');
      let contenidoFinal = contenidoSeguro;
      if (msg.tipo === 'imagen' && msg.urlArchivo) {
        contenidoFinal = `<img src="${urlFotoConToken(msg.urlArchivo)}" alt="Imagen" style="max-width:220px; border-radius:8px; display:block; margin-bottom:4px; cursor:pointer;" onclick="window.open('${urlFotoConToken(msg.urlArchivo)}','_blank')">`;
      } else if (msg.tipo === 'audio' && msg.urlArchivo) {
        contenidoFinal = `<audio controls preload="metadata" data-audio-url="${urlFotoConToken(msg.urlArchivo)}" src="${urlFotoConToken(msg.urlArchivo)}" style="max-width:220px; display:block; margin-bottom:4px;"></audio>`;
      } else if (msg.tipo === 'video' && msg.urlArchivo) {
        contenidoFinal = `<video controls src="${urlFotoConToken(msg.urlArchivo)}" style="max-width:220px; border-radius:8px; display:block; margin-bottom:4px;"></video>`;
      } else if (msg.tipo === 'documento' && msg.urlArchivo) {
        contenidoFinal = `<a href="${urlFotoConToken(msg.urlArchivo)}" target="_blank" style="color:inherit;">${contenidoSeguro}</a>`;
      }
      let indicador = '';
      if (['bot','humano','ia','empresa'].includes(msg.remitente)) {
        if (msg.estado === 'fallido') {
          const tituloError = msg.errorDetalle ? escaparHTML(msg.errorDetalle) : 'Error al enviar. Hacé clic para reintentar.';
          indicador = `<span class="mensaje-reintentar" data-reintentar="${msg._id}" title="${tituloError}" style="font-size:16px; color:#ef4444; margin-left:6px; cursor:pointer; line-height:1;">🔄</span>`;
        } else {
          const estado = msg.estado || 'enviado';
          const simbolo = estado === 'leido' ? '✓✓' : (estado === 'entregado' ? '✓✓' : '✓');
          const color = estado === 'leido' ? '#34b7f1' : '#ffffff';
          const titulo = estado === 'leido' ? 'Leído' : (estado === 'entregado' ? 'Entregado' : 'Enviado');
          indicador = `<span class="mensaje-estado" title="${titulo}" style="font-size:13px; font-weight:bold; color:${color}; margin-left:6px; line-height:1;">${simbolo}</span>`;
        }
      }
      const estiloMedia = ((msg.tipo === 'imagen' || msg.tipo === 'audio' || msg.tipo === 'video') && msg.urlArchivo) ? ' style="background:transparent; padding:0; box-shadow:none; border:none;"' : '';
      return `<div class="bubble ${claseBurbuja}"${estiloMedia}>${contenidoFinal}${indicador}</div>`;
    }).join('');

    if (area) {
      // El botón "cargar más" está en un wrapper al inicio del area
      const btnWrapper = document.getElementById('cargar-mas-wrapper');
      if (btnWrapper) {
        btnWrapper.insertAdjacentHTML('afterend', htmlNuevos);
      } else {
        area.insertAdjacentHTML('afterbegin', htmlNuevos);
      }
      // Restaurar el scroll relativo
      area.scrollTop = area.scrollHeight - prevScrollHeight + prevScrollTop;
      // Cargar audios nuevos
      cargarAudiosConBlob(area);
    }
  } catch (error) {
    console.error('Error al cargar mensajes anteriores:', error);
    mostrarToast('Error al cargar mensajes anteriores', 'error');
  } finally {
    cargandoMensajes = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = '↥ Cargar mensajes anteriores';
    }
  }
}

// ===== Datos del usuario (nombreSucursal y líneas WhatsApp) =====
async function cargarDatosUsuario() {
  if (USAR_MOCK_DATA) {
    const usuario = MOCK_USUARIO;
    miEmpresaId = usuario._id;
    poblarSelectorWhatsApp(usuario.telefonosWhatsApp);
    if (usuario.telefonosWhatsApp.length > 0) {
      whatsappSeleccionado = usuario.telefonosWhatsApp[0];
    } else {
      whatsappSeleccionado = null;
    }
    return;
  }

  // El manejo de usuarios queda en otro proyecto.
  // Las líneas de WhatsApp se obtienen de las conversaciones (cargarConversaciones).
}

function poblarSelectorWhatsApp(items) {
  const select = document.getElementById('select-whatsapp');
  if (!select) return;
  select.innerHTML = '';

  // Opción "Todas las líneas"
  const optAll = document.createElement('option');
  optAll.value = '';
  optAll.textContent = 'Todas las líneas';
  select.appendChild(optAll);

  if (!items || items.length === 0) {
    select.value = '';
    whatsappSeleccionado = '';
    return;
  }

  const esObjeto = typeof items[0] === 'object' && items[0] !== null;

  items.forEach(item => {
    const opt = document.createElement('option');
    if (esObjeto) {
      opt.value = item.whatsappPhoneId;
      opt.textContent = `${item.nombre} (${item.whatsappPhoneId})`;
    } else {
      opt.value = item;
      opt.textContent = item;
    }
    select.appendChild(opt);
  });

  // Selección inicial: si no hay una línea elegida, dejar "Todas las líneas"
  const lineas = esObjeto ? items.map(e => e.whatsappPhoneId) : items;
  if (!whatsappSeleccionado || !lineas.includes(whatsappSeleccionado)) {
    whatsappSeleccionado = '';
    select.value = '';
  } else {
    select.value = whatsappSeleccionado;
  }
}

async function actualizarUsoConversaciones() {
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch('/api/whatsapp/uso-conversaciones', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const numEl = document.getElementById('uso-conversaciones-num');
    const maxEl = document.getElementById('uso-conversaciones-max');
    if (numEl) numEl.textContent = data.usados;
    if (maxEl) maxEl.textContent = data.maximo;
  } catch (error) {
    console.error('Error al obtener uso conversaciones:', error);
  }
}

function setupSocketListeners() {
  if (!socket) return;

  socket.on('disconnect', () => {
    mostrarToast('Se perdió la conexión en tiempo real. Reconectando...', 'error');
  });

  socket.on('reconnect', () => {
    mostrarToast('Conexión restablecida', 'info');
    const salas = [...new Set(CONVERSACIONES.map(c => c.empresaId).filter(Boolean))];
    salas.forEach(sala => socket.emit('join', sala));
    cargarConversaciones();
  });

  socket.on('connect', () => {
    const salas = [...new Set(CONVERSACIONES.map(c => c.empresaId).filter(Boolean))];
    salas.forEach(sala => socket.emit('join', sala));
  });

  socket.on('mensaje-nuevo', (payload) => {
    const { conversacionId, mensaje, conversacion } = payload;

    // Si el mensaje ya existe localmente, actualizamos sus campos (ej: multimedia agregado luego)
    const msgExistente = mensaje._id ? MENSAJES.find(m => m._id === mensaje._id) : null;
    if (msgExistente) {
      msgExistente.contenido = mensaje.contenido || msgExistente.contenido;
      msgExistente.tipo = mensaje.tipo || msgExistente.tipo;
      msgExistente.urlArchivo = mensaje.urlArchivo || msgExistente.urlArchivo;
      msgExistente.fecha = new Date(mensaje.fecha || msgExistente.fecha);
      msgExistente.estado = mensaje.estado || msgExistente.estado;
      msgExistente.fechaEstado = mensaje.fechaEstado ? new Date(mensaje.fechaEstado) : msgExistente.fechaEstado;
      msgExistente.duracionSegundos = mensaje.duracionSegundos || msgExistente.duracionSegundos;
      msgExistente.errorDetalle = mensaje.errorDetalle || msgExistente.errorDetalle;

      // Actualizar la conversación local
      const convLocal = CONVERSACIONES.find(c => c._id === conversacionId);
      if (convLocal) {
        convLocal.estado = 'Abierto';
        convLocal.ultimoMensaje = (conversacion && conversacion.ultimoMensaje) || mensaje.contenido || convLocal.ultimoMensaje;
        convLocal.ultimaFecha = (conversacion && conversacion.updatedAt)
          ? new Date(conversacion.updatedAt)
          : new Date();
        if (chatActivoId === conversacionId) {
          renderChatActivo();
          const area = document.getElementById('area-mensajes');
          if (area) area.scrollTop = area.scrollHeight;
        }
        renderListaChats();
      }
      return;
    }

    // Agregar mensaje a la colección local
    MENSAJES.push({
      _id: mensaje._id,
      conversacionId: conversacionId,
      remitente: mensaje.remitente,
      contenido: mensaje.contenido,
      fecha: new Date(mensaje.fecha),
      estado: mensaje.estado || 'enviado',
      fechaEstado: mensaje.fechaEstado ? new Date(mensaje.fechaEstado) : null,
      errorDetalle: mensaje.errorDetalle || '',
      tipo: mensaje.tipo || 'texto',
      urlArchivo: mensaje.urlArchivo || '',
      duracionSegundos: mensaje.duracionSegundos || null
    });

    // 🔔 Notificación interna (sonido, badge y Notificación del sistema)
    notificarMensajeNuevo(payload);

    // Actualizar la conversación local
    const convLocal = CONVERSACIONES.find(c => c._id === conversacionId);
    if (convLocal) {
      convLocal.estado = 'Abierto';
      convLocal.ultimoMensaje = (conversacion && conversacion.ultimoMensaje) || mensaje.contenido;
      convLocal.ultimaFecha = (conversacion && conversacion.updatedAt)
        ? new Date(conversacion.updatedAt)
        : new Date();

      if (chatActivoId === conversacionId) {
        renderChatActivo();
        const area = document.getElementById('area-mensajes');
        if (area) area.scrollTop = area.scrollHeight;
      }
      renderListaChats();
    } else {
      // Puede ser una conversación nueva, recargamos para obtenerla completa
      cargarConversaciones();
    }
  });

  socket.on('carrito-actualizado', (payload) => {
    if (!payload || !payload.conversacionId) return;
    const conv = CONVERSACIONES.find(c => c._id === payload.conversacionId);
    if (conv) {
      conv.carrito = payload.carrito || [];
      conv.carritoTotal = payload.total || 0;
      if (chatActivoId === payload.conversacionId) {
        renderPanelPedido(conv, getContactoPorId(conv.contactoId));
      }
    }
  });

  socket.on('pedido-actualizado', (payload) => {
    if (!payload || !payload.conversacionId) return;
    if (payload.conversacionId !== chatActivoId) return;

    const conv = getConversacionPorId(payload.conversacionId);
    if (!conv) return;
    const contacto = getContactoPorId(conv.contactoId);
    const contenedor = document.getElementById('pedido-info');

    if (payload.pedido) {
      // Render directo con el pedido que manda el backend
      if (contenedor) contenedor.innerHTML = renderPedido(contenedor, payload.pedido);
    } else {
      // Fallback: buscar de nuevo
      cargarPedidoActivo(payload.conversacionId, contacto?.telefono, contacto?._id);
    }
  });

  socket.on('pedido-cancelado', (payload) => {
    const mensaje = `🚫 ${payload.clienteNombre} canceló un pedido de $${(payload.total || 0).toFixed(2)}.\n\nMirá el chat para más detalles.`;
    reproducirSonidoNotificacion();
    mostrarToast(mensaje, 'error');
    const conv = CONVERSACIONES.find(c => c._id === payload.conversacionId);
    if (conv) {
      conv.cancelacionReciente = true;
      renderListaChats();
    }
  });

  socket.on('contacto-creado', (payload) => {
    cargarConversaciones();
  });

  socket.on('contacto-actualizado', (payload) => {
    const contactoIdStr = String(payload.contactoId || '');
    const contacto = CONTACTOS.find(c => String(c._id) === contactoIdStr);
    if (!contacto || !payload.datos) return;
    const datos = payload.datos;
    if (datos.direccion) contacto.direccion = datos.direccion;
    if (datos.pisoDepto) contacto.pisoDepto = datos.pisoDepto;
    if (datos.codigoPostal) contacto.codigoPostal = datos.codigoPostal;

    if (chatActivoId) {
      const conv = getConversacionPorId(chatActivoId);
      if (conv && String(conv.contactoId) === contactoIdStr) {
        renderChatActivo();
      }
    }
  });

  socket.on('contacto-foto-actualizada', (payload) => {
    if (!payload || !payload.contactoId) return;
    const contacto = CONTACTOS.find(c => String(c._id) === String(payload.contactoId));
    if (!contacto) return;
    contacto.fotoPerfil = payload.fotoPerfil || '';
    if (chatActivoId) {
      const conv = getConversacionPorId(chatActivoId);
      if (conv && String(conv.contactoId) === String(payload.contactoId)) {
        renderChatActivo();
      }
    }
    renderListaChats();
  });

  socket.on('bot-actualizado', (payload) => {
    if (!payload || !payload.conversacionId) return;
    const conv = CONVERSACIONES.find(c => c._id === payload.conversacionId);
    if (!conv) return;
    conv.botActivo = payload.botActivo === true;
    if (chatActivoId === payload.conversacionId) {
      const toggle = document.getElementById('toggle-bot');
      if (toggle) toggle.checked = conv.botActivo;
      const estadoBot = document.getElementById('estado-bot');
      if (estadoBot) {
        estadoBot.textContent = conv.botActivo ? 'Bot Activo' : 'Pausado';
        estadoBot.classList.remove('estado-activo', 'estado-pausado');
        estadoBot.classList.add(conv.botActivo ? 'estado-activo' : 'estado-pausado');
      }
    }
    if (!conv.botActivo) {
      reproducirSonidoNotificacion();
    }
    renderListaChats();
  });

  socket.on('mensaje-estado', (payload) => {
    if (!payload || !payload.mensajeId) return;
    const msg = MENSAJES.find(m => m._id === payload.mensajeId);
    if (msg) {
      msg.estado = payload.estado;
      msg.fechaEstado = payload.fechaEstado ? new Date(payload.fechaEstado) : null;
      if (payload.errorDetalle) msg.errorDetalle = payload.errorDetalle;
      if (chatActivoId === payload.conversacionId) {
        renderChatActivo();
        const area = document.getElementById('area-mensajes');
        if (area) area.scrollTop = area.scrollHeight;
      }
    }
  });

  socket.on('limite-conversaciones-alcanzado', (payload) => {
    const numEl = document.getElementById('uso-conversaciones-num');
    if (numEl) numEl.textContent = payload.usados;
    const maxEl = document.getElementById('uso-conversaciones-max');
    if (maxEl) maxEl.textContent = payload.maximo;
    const mensaje = `⚠️ Llegaste al límite diario de conversaciones iniciadas (${payload.maximo}).\n\nEstás usando ${payload.usados}. A partir de aquí, cada conversación nueva tendrá costo adicional de Meta.`;
    alert(mensaje);
  });

  socket.on('monedero-aviso', (payload) => {
    const mensaje = `⚠️ Estás usando ${payload.porcentaje}% de tu límite de fiado ($${payload.deuda.toFixed(2)} de $${payload.tolerancia.toFixed(2)}).\n\nCargá saldo para evitar que se bloqueen las conversaciones nuevas.`;
    alert(mensaje);
  });

  socket.on('monedero-bloqueado', (payload) => {
    const mensaje = `⛔ No podés iniciar conversaciones nuevas.\n\nTu monedero está bloqueado por superar el límite de fiado ($${payload.deuda.toFixed(2)} de $${payload.tolerancia.toFixed(2)}).\n\nCargá saldo para desbloquear.`;
    alert(mensaje);
  });
}

// ===== Envío manual de mensaje desde el dashboard =====
async function enviarMensajeDesdePanel() {
  if (enviandoMensaje) return;
  enviandoMensaje = true;
  try {
    const input = document.getElementById('input-mensaje');
    if (!input) return;
    const mensajeOriginal = input.value;
    // Sanitización: reemplazamos etiquetas <br> por saltos de línea nativos
    const mensajeLimpio = mensajeOriginal
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
    // Si el envío fuese por URL (ej: wa.me), usar:
    // const mensajeURL = encodeURIComponent(mensajeLimpio);
    const mensaje = mensajeLimpio;
    if (!chatActivoId) return;
    if (!mensaje && archivosPendientes.length === 0) return;

    // Si hay archivos pendientes, primero los enviamos
    if (archivosPendientes.length > 0) {
      for (const file of archivosPendientes) {
        const exito = await enviarMediaDesdePanel(file);
        if (!exito) {
          // Si falla, no seguimos enviando y dejamos el resto pendiente
          return;
        }
      }
      limpiarArchivosPendientes();
    }

    // Si solo era el archivo, ya terminamos
    if (!mensaje) {
      input.value = '';
      autoAjustarTextarea(input);
      return;
    }

    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch('/api/whatsapp/enviar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ conversacionId: chatActivoId, mensaje })
      });
      const data = await res.json();
      if (data.ventanaCerrada) {
        mostrarToast('La ventana de 24h cerró. Para responder usá una plantilla aprobada.', 'error');
        abrirModalPlantillaChat();
        return;
      }
      if (!res.ok) {
        console.error('Error al enviar mensaje:', data.error || data);
        return;
      }
      input.value = '';
      autoAjustarTextarea(input);
      const conv = getConversacionPorId(chatActivoId);
      if (conv && conv.estado !== 'Abierto') {
        conv.estado = 'Abierto';
        renderListaChats();
      }
      actualizarUsoConversaciones();
    } catch (error) {
      console.error('Error de red al enviar mensaje:', error);
    }
  } finally {
    enviandoMensaje = false;
  }
}

async function subirArchivoAlServidor(url, formData, method = 'POST') {
  const token = localStorage.getItem('token') || '';
  const res = await fetch(url, {
    method,
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `HTTP ${res.status}`);
    error.data = data;
    throw error;
  }
  return data;
}

async function enviarMediaDesdePanel(file) {
  if (!chatActivoId) return false;

  const formData = new FormData();
  formData.append('conversacionId', chatActivoId);
  formData.append('archivo', file);

  try {
    await subirArchivoAlServidor('/api/whatsapp/enviar-media', formData);
    // No agregamos mensaje localmente; llega por socket 'mensaje-nuevo'
    return true;
  } catch (error) {
    console.error('Error al enviar multimedia:', error);
    mostrarToast(error.message || 'Error al enviar multimedia', 'error');
    return false;
  }
}

function mimeTypeDesdeUrl(url) {
  const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
  const map = {
    'ogg': 'audio/ogg',
    'opus': 'audio/ogg',
    'mp3': 'audio/mpeg',
    'm4a': 'audio/mp4',
    'aac': 'audio/aac',
    'amr': 'audio/amr',
    'wav': 'audio/wav',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp'
  };
  return map[ext] || 'application/octet-stream';
}

async function cargarAudiosConBlob(contenedor) {
  if (!contenedor) return;
  const audios = contenedor.querySelectorAll('audio[data-audio-url]');
  const token = localStorage.getItem('token') || '';
  for (const audio of audios) {
    const url = audio.dataset.audioUrl;
    if (!url || audio.dataset.cargado) continue;
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const mimeType = mimeTypeDesdeUrl(url);
      const blob = new Blob([arrayBuffer], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      audio.src = objectUrl;
      audio.dataset.cargado = '1';
      audio.addEventListener('error', () => {
        URL.revokeObjectURL(objectUrl);
        audio.removeAttribute('src');
        console.error('No se pudo reproducir el audio');
      });
    } catch (error) {
      console.error('Error al cargar audio:', error);
    }
  }
}

function mostrarArchivosPendientes() {
  const wrapper = document.getElementById('archivo-pendiente-wrapper');
  const lista = document.getElementById('archivo-pendiente-lista');
  if (!wrapper || !lista) return;
  if (archivosPendientes.length === 0) {
    wrapper.style.display = 'none';
    lista.innerHTML = '';
    return;
  }
  lista.innerHTML = archivosPendientes.map((f, i) => `
    <div style="display:flex; align-items:center; gap:6px; font-size:13px; color:#374151;">
      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name}</span>
      <button onclick="quitarArchivoPendiente(${i})" style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:14px;">×</button>
    </div>
  `).join('');
  wrapper.style.display = 'flex';
}

function quitarArchivoPendiente(index) {
  archivosPendientes.splice(index, 1);
  mostrarArchivosPendientes();
}

function limpiarArchivosPendientes() {
  archivosPendientes = [];
  mostrarArchivosPendientes();
}

async function guardarNuevoContacto() {
  const token = localStorage.getItem('token') || '';
  const nombre = (document.getElementById('nuevo-contacto-nombre') || {}).value?.trim() || '';
  const telefono = (document.getElementById('nuevo-contacto-telefono') || {}).value?.trim() || '';
  const direccion = (document.getElementById('nuevo-contacto-direccion') || {}).value?.trim() || '';
  const etiquetasStr = (document.getElementById('nuevo-contacto-etiquetas') || {}).value?.trim() || '';
  const etiquetas = etiquetasStr.split(',').map(e => e.trim()).filter(Boolean);

  if (!telefono) {
    mostrarToast('Ingresá al menos el teléfono', 'error');
    return;
  }

  try {
    const res = await fetch('/api/whatsapp/contactos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ nombre, telefono, direccion, etiquetas })
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarToast(data.error || 'Error al crear contacto', 'error');
      return;
    }

    const modal = document.getElementById('modal-nuevo-contacto');
    if (modal) modal.classList.add('hidden');
    ['nuevo-contacto-nombre','nuevo-contacto-telefono','nuevo-contacto-direccion','nuevo-contacto-etiquetas'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    await cargarConversaciones();
  } catch (error) {
    console.error('Error al crear contacto:', error);
    mostrarToast('Error al crear contacto', 'error');
  }
}

async function guardarDetallesCliente() {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) {
    console.error('Contacto no encontrado');
    return;
  }

  const direccion = (document.getElementById('perfil-direccion-input') || {}).value?.trim() || '';
  const pisoDepto = (document.getElementById('perfil-pisodpto-input') || {}).value?.trim() || '';
  const codigoPostal = (document.getElementById('perfil-codigopostal-input') || {}).value?.trim() || '';

  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/whatsapp/contacto/${contacto._id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ direccion, pisoDepto, codigoPostal })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al guardar detalles:', data.error || res.status);
      return;
    }

    contacto.direccion = direccion;
    contacto.pisoDepto = pisoDepto;
    contacto.codigoPostal = codigoPostal;
  } catch (error) {
    console.error('Error de red al guardar detalles:', error);
  }
}

// ===== Funciones para modal de detalles =====
function abrirDetallesModal() {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) return;

  document.getElementById('modal-nombre').value = normalizarNombreLocal(contacto.nombre || '');
  document.getElementById('modal-telefono').value = contacto.telefono || '';
  document.getElementById('modal-direccion').value = contacto.direccion || '';
  document.getElementById('modal-pisodpto').value = contacto.pisoDepto || '';
  document.getElementById('modal-codigopostal').value = contacto.codigoPostal || '';

  const fotoModal = document.getElementById('modal-contacto-foto');
  if (fotoModal) {
    if (contacto.fotoPerfil) {
      fotoModal.src = urlFotoConToken(contacto.fotoPerfil);
      fotoModal.style.display = 'block';
    } else {
      fotoModal.style.display = 'none';
    }
  }
  const btnCambiarFoto = document.getElementById('btn-cambiar-foto-contacto');
  const inputFoto = document.getElementById('input-foto-contacto');
  if (btnCambiarFoto && !btnCambiarFoto.dataset.listener) {
    btnCambiarFoto.dataset.listener = 'true';
    btnCambiarFoto.addEventListener('click', (e) => {
      e.preventDefault();
      inputFoto?.click();
    });
    inputFoto?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file || !contacto._id) return;
      const formData = new FormData();
      formData.append('foto', file);
      const token = localStorage.getItem('token') || '';
      try {
        const res = await fetch(`/api/whatsapp/contacto/${contacto._id}/foto`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al subir foto');
        contacto.fotoPerfil = data.fotoPerfil;
        if (fotoModal) {
          fotoModal.src = urlFotoConToken(data.fotoPerfil);
          fotoModal.style.display = 'block';
        }
        renderListaChats();
        if (chatActivoId) renderChatActivo();
      } catch (error) {
        console.error('Error al subir foto:', error);
        mostrarToast('No se pudo subir la foto', 'error');
      }
      e.target.value = '';
    });
  }

  const menu = document.getElementById('perfil-menu');
  if (menu) menu.classList.add('hidden');
  const modal = document.getElementById('modal-detalles');
  if (modal) modal.classList.remove('hidden');
}

function cerrarDetallesModal() {
  const modal = document.getElementById('modal-detalles');
  if (modal) modal.classList.add('hidden');

  // Volver al chat: si el perfil está abierto como overlay, lo cerramos
  const app = document.getElementById('app');
  if (app) app.classList.remove('perfil-abierto');
}

async function guardarDetallesDesdeModal() {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) return;

  const nombre = normalizarNombreLocal((document.getElementById('modal-nombre') || {}).value?.trim() || '');
  const direccion = (document.getElementById('modal-direccion') || {}).value?.trim() || '';
  const pisoDepto = (document.getElementById('modal-pisodpto') || {}).value?.trim() || '';
  const codigoPostal = (document.getElementById('modal-codigopostal') || {}).value?.trim() || '';

  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/whatsapp/contacto/${contacto._id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ direccion, pisoDepto, codigoPostal, nombre })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al guardar detalles:', data.error || res.status);
      return;
    }

    contacto.nombre = nombre;
    contacto.direccion = direccion;
    contacto.pisoDepto = pisoDepto;
    contacto.codigoPostal = codigoPostal;

    // Sincronizar con los campos del panel principal
    const inputDir = document.getElementById('perfil-direccion-input');
    const inputPiso = document.getElementById('perfil-pisodpto-input');
    const inputCP = document.getElementById('perfil-codigopostal-input');
    if (inputDir) inputDir.value = direccion;
    if (inputPiso) inputPiso.value = pisoDepto;
    if (inputCP) inputCP.value = codigoPostal;

    // Actualizar la lista de chats y el encabezado del chat con el nuevo nombre
    renderTodo();
    cerrarDetallesModal();
  } catch (error) {
    console.error('Error de red al guardar detalles:', error);
  }
}

// ===== Cargar pedido activo =====
async function cargarPedidoActivo(conversacionId, telefono, contactoId, mostrarGenerarSiVacio = false) {
  const token = localStorage.getItem('token') || '';
  const contenedor = document.getElementById('pedido-info');
  if (!contenedor) return;
  contenedor.innerHTML = '<span style="color:#9CA3AF;">Cargando...</span>';

  // 1. Intentar obtener pedidos desde el endpoint específico por número de teléfono
  if (telefono) {
    try {
      let url = `/api/pedidos/cliente/${encodeURIComponent(telefono)}`;
      if (contactoId) {
        url += `?contactoId=${encodeURIComponent(contactoId)}`;
      }
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const pedidos = data.pedidos || [];
        const pedidoConfirmado = pedidos.find(p => p.estado === 'confirmado') ||
                                 pedidos[0];
        if (pedidoConfirmado) {
          contenedor.innerHTML = renderPedido(contenedor, pedidoConfirmado);
          return;
        }
      }
    } catch (e) {
      console.warn('No se pudo obtener pedidos por teléfono, usando fallback:', e);
    }
  }

  // 2. Fallback al endpoint antiguo por conversación
  try {
    const res = await fetch(`/api/whatsapp/conversacion/${conversacionId}/pedido-activo`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Error HTTP ${res.status}`);
    const pedido = data.pedido;
    if (!pedido || pedido.estado === 'Entregado' || pedido.estado === 'Cancelado') {
      if (mostrarGenerarSiVacio) {
        mostrarBotonGenerarPedido();
      } else {
        contenedor.innerHTML = '<span style="color:#9CA3AF;">Sin pedidos en curso</span>';
      }
      return;
    }
    contenedor.innerHTML = renderPedido(contenedor, pedido);
  } catch (error) {
    console.error('Error al obtener pedido:', error);
    if (mostrarGenerarSiVacio) {
      mostrarBotonGenerarPedido();
    } else {
      contenedor.innerHTML = '<span style="color:#9CA3AF;">No se pudo cargar el pedido</span>';
    }
  }
}

function mostrarBotonGenerarPedido() {
  const contenedor = document.getElementById('pedido-info');
  if (!contenedor) return;
  contenedor.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:12px; align-items:center; padding:20px 0;">
      <span style="color:#9CA3AF; font-size:14px;">No hay pedido en curso</span>
      <button id="generar-pedido-btn" 
        style="background:#2563eb; color:#fff; border:none; border-radius:8px; padding:10px 20px; font-size:14px; font-weight:bold; cursor:pointer;">
        ⚡ Generar pedido
      </button>
      <span style="color:#9CA3AF; font-size:12px;">La IA analiza la conversación y crea el pedido</span>
    </div>
  `;
  const btn = document.getElementById('generar-pedido-btn');
  if (btn) btn.addEventListener('click', generarPedidoManualDesdeUI);
}

async function generarPedidoManualDesdeUI() {
  if (!chatActivoId) return;
  const token = localStorage.getItem('token') || '';
  const btn = document.getElementById('generar-pedido-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generando...';
  }
  try {
    const res = await fetch('/api/whatsapp/generar-pedido', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ conversacionId: chatActivoId })
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarToast(data.error || 'No se pudo generar el pedido', 'error');
      return;
    }
    mostrarToast('Pedido generado correctamente', 'info');
    const conv = getConversacionPorId(chatActivoId);
    const contacto = getContactoPorId(conv.contactoId);
    await cargarPedidoActivo(conv._id, contacto.telefono, contacto._id, true);
    renderTodo();
  } catch (error) {
    console.error('Error al generar pedido:', error);
    mostrarToast('Error de red al generar pedido', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '⚡ Generar pedido';
    }
  }
}

function renderCarrito(items, total) {
  let html = '';
  if (!items || items.length === 0) {
    return '<span style="color:#9CA3AF;">Sin ítems aún</span>';
  }
  items.forEach(item => {
    const cantidad = item.cantidad || 1;
    const precio = item.precioUnitario || 0;
    const subtotal = (cantidad * precio).toFixed(2);
    const nombreSeguro = escaparHTML(item.nombre || '');
    html += `<div class="pedido-item">
      <span class="pedido-item-nombre">${nombreSeguro}</span>
      <span class="pedido-item-cantidad">× ${cantidad}</span>
      <span class="pedido-item-precio">$${precio.toFixed(2)}</span>
      <span class="pedido-item-subtotal">$${subtotal}</span>
    </div>`;
  });
  html += `<div class="pedido-total">Total parcial: $${(Number(total) || 0).toFixed(2)}</div>`;
  return html;
}

function renderPanelPedido(conv, contacto) {
  const contenedor = document.getElementById('pedido-info');
  if (!contenedor) return;

  if (conv.carrito && conv.carrito.length > 0) {
    let html = renderCarrito(conv.carrito, conv.carritoTotal);
    html += `<div class="pedido-direccion">Dirección pendiente de confirmar</div>`;
    contenedor.innerHTML = html;
    return;
  }

  // No hay carrito en construcción → buscamos último pedido confirmado o mostramos botón de generación manual
  cargarPedidoActivo(conv._id, contacto.telefono, contacto._id, true);
}

function renderPedido(contenedor, pedido) {
  let html = '';
  if (pedido.items && pedido.items.length) {
    pedido.items.forEach(item => {
      const cantidad = item.cantidad || 0;
      const precio = item.precioUnitario || 0;
      const subtotal = (cantidad * precio).toFixed(2);
      const nombreSeguro = escaparHTML(item.nombre || '');
      html += `<div class="pedido-item">
        <span class="pedido-item-nombre">${nombreSeguro}</span>
        <span class="pedido-item-cantidad">× ${cantidad}</span>
        <span class="pedido-item-precio">$${precio.toFixed(2)}</span>
        <span class="pedido-item-subtotal">$${subtotal}</span>
      </div>`;
    });
  } else {
    html = '<div style="color:#9CA3AF;">Pedido sin ítems</div>';
  }
  const total = (pedido.total || 0).toFixed(2);
  const direccion = pedido.direccionEntrega || pedido.direccion || 'No especificada';
  const estadoRaw = String(pedido.estado || 'Pendiente').toLowerCase();
  const estadosLabels = {
    'borrador': 'Borrador',
    'pendiente': 'Pendiente',
    'confirmado': 'Confirmado',
    'en_preparacion': 'En preparación',
    'en_preparación': 'En preparación',
    'en_camino': 'En camino',
    'entregado': 'Entregado',
    'cancelado': 'Cancelado'
  };
  const estado = estadosLabels[estadoRaw] || pedido.estado || 'Pendiente';
  const colorEstado = estado === 'Cancelado' ? '#ef4444' : (estado === 'Entregado' ? '#10b981' : '#f59e0b');

  // Fecha del pedido
  const fechaPedido = pedido.fecha || pedido.createdAt || pedido.updatedAt || null;
  let htmlFecha = '';
  if (fechaPedido) {
    const fechaObj = new Date(fechaPedido);
    const fechaTexto = fechaObj.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    htmlFecha = `<div class="pedido-fecha" style="font-size:12px; color:#6b7280; margin-bottom:4px;">Pedido del ${fechaTexto}</div>`;
  }

  html += htmlFecha;
  html += `<div class="pedido-total">Total: $${total}</div>`;
  html += `<div class="pedido-direccion">Entrega: ${direccion}</div>`;
  html += `<div class="pedido-estado"><span style="background:${colorEstado}; color:#fff; padding:3px 12px; border-radius:12px; font-weight:bold; font-size:11px;">${estado}</span></div>`;
  return html;
}

// ===== Funciones de etiquetas =====
async function agregarEtiquetaDesdeUI() {
  const input = document.getElementById('nueva-etiqueta-input');
  if (!input) return;
  const etiqueta = input.value.trim();
  if (!etiqueta || !chatActivoId) return;

  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) return;

  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/whatsapp/contacto/${contacto._id}/etiquetas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ etiqueta })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al agregar etiqueta:', data.error || res.status);
      return;
    }

    const data = await res.json();
    contacto.etiquetas = data.etiquetas || [...(contacto.etiquetas || []), etiqueta];
    input.value = '';
    if (chatActivoId) renderChatActivo();
  } catch (error) {
    console.error('Error de red al agregar etiqueta:', error);
  }
}

async function eliminarEtiquetaDesdeUI(etiqueta) {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) return;

  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/whatsapp/contacto/${contacto._id}/etiquetas/${encodeURIComponent(etiqueta)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al eliminar etiqueta:', data.error || res.status);
      return;
    }

    const data = await res.json();
    contacto.etiquetas = data.etiquetas || [];
    if (chatActivoId) renderChatActivo();
  } catch (error) {
    console.error('Error de red al eliminar etiqueta:', error);
  }
}

// ===== Eliminar nota interna =====
async function eliminarNotaDesdeUI(mensajeId) {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) return;

  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/whatsapp/contacto/${contacto._id}/notas/${encodeURIComponent(mensajeId)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al eliminar nota:', data.error || res.status);
      return;
    }
    MENSAJES = MENSAJES.filter(m => !(m._id === mensajeId && m.remitente === 'nota_interna'));
    if (chatActivoId) renderChatActivo();
  } catch (error) {
    console.error('Error de red al eliminar nota:', error);
  }
}

// ===== Guardar nota interna =====
async function marcarAtendido(convId = chatActivoId) {
  if (!convId) return;
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/whatsapp/conversacion/${convId}/atender`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al marcar atendido:', data.error || res.status);
      return;
    }
    const conv = getConversacionPorId(convId);
    if (conv) conv.estado = 'Resuelto';
    renderTodo();
  } catch (error) {
    console.error('Error de red al marcar atendido:', error);
  }
}

async function reabrirConversacion(convId) {
  if (!convId) return;
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/whatsapp/conversacion/${convId}/reabrir`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al reabrir conversación:', data.error || res.status);
      return;
    }
    const conv = getConversacionPorId(convId);
    if (conv) conv.estado = 'Abierto';
    renderTodo();
  } catch (error) {
    console.error('Error de red al reabrir conversación:', error);
  }
}

async function guardarNota() {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) return;
  const textarea = document.getElementById('nota-interna-textarea');
  const nota = textarea?.value?.trim();
  if (!nota) return;
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/whatsapp/contacto/${contacto._id}/notas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ nota })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al guardar nota:', data.error || res.status);
      return;
    }
    const data = await res.json();
    if (data.ok && data.mensaje) {
      MENSAJES.push({
        conversacionId: chatActivoId,
        _id: data.mensaje._id,
        remitente: 'nota_interna',
        contenido: data.mensaje.contenido,
        fecha: new Date(data.mensaje.fecha || Date.now())
      });
      if (textarea) textarea.value = '';
      if (chatActivoId) renderChatActivo();
    }
  } catch (error) {
    console.error('Error de red al guardar nota:', error);
  }
}

// ===== Bloqueo de cliente =====
function confirmarBloqueoCliente() {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) return;

  // Crear overlay y modal
  const overlay = document.createElement('div');
  overlay.id = 'modal-bloqueo-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:#fff;padding:30px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.3);max-width:400px;text-align:center;';

  const titulo = document.createElement('h3');
  titulo.textContent = contacto.bloqueado ? '¿Desbloquear cliente?' : '¿Bloquear cliente?';
  titulo.style.marginTop = '0';

  const texto = document.createElement('p');
  texto.textContent = contacto.bloqueado
    ? 'El cliente volverá a recibir mensajes automáticos del bot.'
    : 'El cliente dejará de recibir respuestas automáticas y sus mensajes serán descartados.';

  const contBtns = document.createElement('div');
  contBtns.style.marginTop = '20px';

  const btnCancelar = document.createElement('button');
  btnCancelar.textContent = 'Cancelar';
  btnCancelar.style.cssText = 'margin-right:10px;padding:10px 20px;border:none;border-radius:8px;background:#e5e7eb;cursor:pointer;';

  const btnConfirmar = document.createElement('button');
  btnConfirmar.textContent = 'Confirmar';
  btnConfirmar.style.cssText = 'padding:10px 20px;border:none;border-radius:8px;background:#ef4444;color:#fff;cursor:pointer;';

  btnCancelar.addEventListener('click', () => overlay.remove());
  btnConfirmar.addEventListener('click', () => {
    overlay.remove();
    toggleBloqueoCliente();
  });

  contBtns.appendChild(btnCancelar);
  contBtns.appendChild(btnConfirmar);
  modal.appendChild(titulo);
  modal.appendChild(texto);
  modal.appendChild(contBtns);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

async function toggleBloqueoCliente() {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) return;

  const token = localStorage.getItem('token') || '';
  const ruta = contacto.bloqueado ? 'desbloquear' : 'bloquear';
  try {
    const res = await fetch(`/api/whatsapp/contacto/${contacto._id}/${ruta}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al cambiar estado:', data.error || res.status);
      return;
    }

    const data = await res.json();
    contacto.bloqueado = data.bloqueado;
    renderChatActivo();
  } catch (error) {
    console.error('Error de red al cambiar estado:', error);
  }
}

// ===== Login con PIN =====
function mostrarModalLogin() {
  document.body.classList.add('modo-login');
  const modal = document.getElementById('modal-login');
  if (modal) modal.classList.remove('hidden');
  const inputTelefono = document.getElementById('input-telefono');
  if (inputTelefono) {
    inputTelefono.value = '';
  }
  const inputPin = document.getElementById('input-pin');
  if (inputPin) {
    inputPin.value = '';
  }
  const primerCampo = document.getElementById('input-telefono') || document.getElementById('input-pin');
  if (primerCampo) primerCampo.focus();
  const errorEl = document.getElementById('login-error');
  if (errorEl) errorEl.classList.add('hidden');
}

function ocultarModalLogin() {
  document.body.classList.remove('modo-login');
  const modal = document.getElementById('modal-login');
  if (modal) modal.classList.add('hidden');
}

async function manejarLogin() {
  const inputTelefono = document.getElementById('input-telefono');
  const telefono = inputTelefono?.value?.trim() || '';
  const inputPin = document.getElementById('input-pin');
  const pin = inputPin?.value?.trim() || '';
  const errorEl = document.getElementById('login-error');

  if (!telefono) {
    if (errorEl) {
      errorEl.textContent = 'Ingresá tu número de WhatsApp';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  if (!pin) {
    if (errorEl) {
      errorEl.textContent = 'Ingresá tu PIN';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  if (errorEl) errorEl.classList.add('hidden');

  try {
    const res = await fetch('/api/whatsapp/login-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono, pin })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Credenciales inválidas');
    }

    localStorage.setItem('token', data.token);
    usuarioActual = data.usuario || null;
    ocultarModalLogin();
    ajustarVisibilidadSegunRol();

    // Arrancamos el CRM recién después de autenticar
    await cargarDatosUsuario();
    await cargarConversaciones();
    await cargarConfiguracion();
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    if (errorEl) {
      errorEl.textContent = 'Número de WhatsApp o PIN inválidos. Intentá de nuevo.';
      errorEl.classList.remove('hidden');
    }
  }
}

// ===== Eventos =====
function precargarVistas() {
  const archivos = ['chats', 'config', 'perfil', 'pagos', 'difusion'];
  return Promise.all(archivos.map(async (nombre) => {
    if (vistasCache[nombre]) return;
    try {
      const res = await fetch(`/views/${nombre}.html`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      vistasCache[nombre] = await res.text();
    } catch (error) {
      console.error(`No se pudo cargar views/${nombre}.html:`, error);
    }
  })).then(() => {
    // Inyectar el HTML precargado en los contenedores correspondientes
    const inboxView = document.getElementById('inbox-view');
    if (inboxView && vistasCache['chats']) inboxView.innerHTML = vistasCache['chats'];
    const configView = document.getElementById('config-view');
    if (configView && vistasCache['config']) configView.innerHTML = vistasCache['config'];
    const perfilView = document.getElementById('perfil-view');
    if (perfilView && vistasCache['perfil']) perfilView.innerHTML = vistasCache['perfil'];
    const pagosView = document.getElementById('pagos-view');
    if (pagosView && vistasCache['pagos']) pagosView.innerHTML = vistasCache['pagos'];
    const difusionView = document.getElementById('difusion-view');
    if (difusionView && vistasCache['difusion']) difusionView.innerHTML = vistasCache['difusion'];
  });
}

async function init() {
  await precargarVistas();

  // Forzar vista de bandeja en móviles al redimensionar
  ajustarVistaMovil();
  actualizarTituloSidebar('inbox');
  window.addEventListener('resize', () => ajustarVistaMovil());

  // Solicitar permiso de notificaciones del sistema al primer clic
  document.addEventListener('click', function solicitarPermiso() {
    solicitarPermisoNotificaciones();
    document.removeEventListener('click', solicitarPermiso);
  });

  // Pestañas
  document.querySelectorAll('.pestana').forEach(btn => {
    btn.addEventListener('click', () => {
      pestanaActiva = btn.dataset.pestana;
      document.querySelectorAll('.pestana').forEach(b => b.classList.remove('activa'));
      btn.classList.add('activa');
      renderListaChats();
    });
  });

  // Toggle del bot (actualiza botActivo en la empresa)
  document.getElementById('toggle-bot').addEventListener('change', async (e) => {
    const nuevoValor = e.target.checked;
    const toggleWrapper = e.target.closest('.toggle');
    if (toggleWrapper) toggleWrapper.classList.toggle('activo', nuevoValor);

    const estadoBotEl = document.getElementById('estado-bot');
    estadoBotEl.textContent = nuevoValor ? 'Bot Activo' : 'Pausado';
    estadoBotEl.classList.remove('estado-activo', 'estado-pausado');
    estadoBotEl.classList.add(nuevoValor ? 'estado-activo' : 'estado-pausado');

    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch(`/api/whatsapp/conversacion/${chatActivoId}/bot-activo`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ botActivo: nuevoValor })
      });

      if (!res.ok) {
        // revertir estado si falla
        e.target.checked = !nuevoValor;
        if (toggleWrapper) toggleWrapper.classList.toggle('activo', !nuevoValor);
        document.getElementById('estado-bot').textContent = !nuevoValor ? 'Bot Activo' : 'Pausado';
        console.error('Error al actualizar botActivo');
      } else {
        // Actualizar solo la conversación activa
        const convLocal = CONVERSACIONES.find(c => c._id === chatActivoId);
        if (convLocal) convLocal.botActivo = nuevoValor;
        renderListaChats();
        if (chatActivoId) {
          renderChatActivo();
        }
      }
    } catch (error) {
      e.target.checked = !nuevoValor;
      if (toggleWrapper) toggleWrapper.classList.toggle('activo', !nuevoValor);
      document.getElementById('estado-bot').textContent = !nuevoValor ? 'Bot Activo' : 'Pausado';
      console.error('Error de red al actualizar botActivo:', error);
    }
  });

  // Sidebar: alternar entre Inbox, Configuración y Perfil
  document.getElementById('btn-inbox').addEventListener('click', () => showView('inbox'));
  document.getElementById('btn-config').addEventListener('click', () => showView('config'));
  const btnPerfil = document.getElementById('btn-perfil');
  if (btnPerfil) {
    btnPerfil.addEventListener('click', () => {
      showView('perfil');
    });
  }

  const btnPagos = document.getElementById('btn-pagos');
  if (btnPagos) {
    btnPagos.addEventListener('click', () => showView('pagos'));
  }

  const btnDifusion = document.getElementById('btn-difusion');
  if (btnDifusion) {
    btnDifusion.addEventListener('click', () => showView('difusion'));
  }

  const btnCrearDifusion = document.getElementById('btn-crear-difusion');
  if (btnCrearDifusion) {
    btnCrearDifusion.addEventListener('click', crearDifusionDesdePanel);
  }

  const btnVerHistorial = document.getElementById('btn-ver-historial');
  if (btnVerHistorial) {
    btnVerHistorial.addEventListener('click', () => {
      mostrarTodasDifusiones = !mostrarTodasDifusiones;
      cargarDifusiones();
    });
  }

  // Inicializar selector de tipo de mensaje
  poblarSelectPlantillas();
  cargarPlantillasDesdeMeta();
  document.querySelectorAll('input[name="difusion-tipo-mensaje"]').forEach(r => {
    r.addEventListener('change', cambiarTipoMensaje);
  });
  const selectPlantilla = document.getElementById('difusion-plantilla-select');
  if (selectPlantilla) {
    selectPlantilla.addEventListener('change', mostrarVistaPreviaPlantilla);
  }
  cambiarTipoMensaje();

  document.addEventListener('click', (e) => {
    const btnEnviar = e.target.closest('[data-enviar-difusion]');
    if (btnEnviar) {
      const id = btnEnviar.getAttribute('data-enviar-difusion');
      enviarDifusionDesdePanel(id);
    }
  });

  // Controles de difusión
  const destTodos = document.getElementById('difusion-dest-todos');
  const destEtiqueta = document.getElementById('difusion-dest-etiqueta');
  const destManual = document.getElementById('difusion-dest-manual');
  const actualizarModoDifusion = () => {
    const etiquetaWrap = document.getElementById('difusion-etiqueta-wrapper');
    const manualWrap = document.getElementById('difusion-manual-wrapper');
    if (etiquetaWrap) etiquetaWrap.style.display = destEtiqueta?.checked ? 'block' : 'none';
    if (manualWrap) manualWrap.style.display = destManual?.checked ? 'block' : 'none';
    sincronizarCheckboxesConEtiqueta();
    actualizarContadorDestinatarios();
  };
  if (destTodos) destTodos.addEventListener('change', actualizarModoDifusion);
  if (destEtiqueta) destEtiqueta.addEventListener('change', actualizarModoDifusion);
  if (destManual) destManual.addEventListener('change', actualizarModoDifusion);
  actualizarModoDifusion();

  const etiquetaDiff = document.getElementById('difusion-etiqueta');
  if (etiquetaDiff) {
    etiquetaDiff.addEventListener('change', () => {
      sincronizarCheckboxesConEtiqueta();
      actualizarContadorDestinatarios();
    });
  }

  document.addEventListener('change', (e) => {
    if (e.target.classList && e.target.classList.contains('difusion-contacto-check')) {
      actualizarContadorDestinatarios();
    }
  });

  const btnSelTodos = document.getElementById('difusion-seleccionar-todos');
  if (btnSelTodos) {
    btnSelTodos.addEventListener('click', () => {
      document.querySelectorAll('.difusion-contacto-check').forEach(cb => cb.checked = true);
      actualizarContadorDestinatarios();
    });
  }

  const btnSelNada = document.getElementById('difusion-seleccionar-nada');
  if (btnSelNada) {
    btnSelNada.addEventListener('click', limpiarSeleccionManual);
  }

  // Modo de programación
  const radiosModoEnvio = document.querySelectorAll('input[name="difusion-modenvio"]');
  if (radiosModoEnvio.length > 0) {
    radiosModoEnvio.forEach(r => r.addEventListener('change', cambiarModoEnvioDifusion));
    const inicial = document.querySelector('input[name="difusion-modenvio"]:checked');
    if (inicial) cambiarModoEnvioDifusion();
  }

  const fechaInputDifusion = document.getElementById('difusion-fecha-programacion');
  if (fechaInputDifusion) {
    fechaInputDifusion.addEventListener('input', () => {
      const error = document.getElementById('difusion-fecha-error');
      if (error) error.style.display = 'none';
    });
  }

  // Cerrar sesión
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('token');
      location.reload();
    });
  }

  // Menú móvil (tres puntitos arriba)
  const btnMenuMovil = document.getElementById('btn-mobile-menu');
  const appMenuMovil = document.getElementById('app');
  if (btnMenuMovil && appMenuMovil) {
    btnMenuMovil.addEventListener('click', (e) => {
      e.stopPropagation();
      appMenuMovil.classList.toggle('menu-abierto');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#slim-sidebar')) {
        appMenuMovil.classList.remove('menu-abierto');
      }
    });

    document.querySelectorAll('#slim-sidebar .sidebar-buttons .sidebar-btn').forEach(btn => {
      btn.addEventListener('click', () => appMenuMovil.classList.remove('menu-abierto'));
    });
  }

  // Configuración del Bot
  initConfigSidebar();

  // Configuración general (foto y estado)
  initEditarPerfil();
  initEditarEstado();
  initEditarBienvenida();
  const btnGuardarHorarios = document.getElementById('btn-guardar-horarios');
  if (btnGuardarHorarios) btnGuardarHorarios.addEventListener('click', guardarHorariosDesdePanel);
  const inputFoto = document.getElementById('config-foto');
  if (inputFoto) inputFoto.addEventListener('change', previewFoto);

  // Selector de cuenta WhatsApp
  const selectWhatsapp = document.getElementById('select-whatsapp');
  if (selectWhatsapp) {
    selectWhatsapp.addEventListener('change', (e) => {
      whatsappSeleccionado = e.target.value;
      const convActual = chatActivoId ? getConversacionPorId(chatActivoId) : null;
      if (convActual && convActual.lineaReceptora !== whatsappSeleccionado) {
        chatActivoId = null;
      }
      renderTodo();
    });
  }

  // Buscador de chats
  const inputBuscador = document.getElementById('buscador');
  if (inputBuscador) {
    let debounceTimeout = null;
    inputBuscador.addEventListener('input', () => {
      const texto = (inputBuscador.value || '').trim();
      clearTimeout(debounceTimeout);
      if (texto.length >= 3) {
        debounceTimeout = setTimeout(async () => {
          try {
            const token = localStorage.getItem('token') || '';
            const q = encodeURIComponent(texto);
            const res = await fetch(`/api/mensajes/buscar?q=${q}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error(`Error ${res.status}`);
            const data = await res.json();
            const convsApi = data.conversaciones || [];
            const contactosMap = new Map();
            const mensajesAll = [];
            const conversacionesLocal = convsApi.map(conv => {
              const contacto = conv.contacto || {};
              const cId = contacto._id || conv.contactoId;
              if (!contactosMap.has(cId)) {
                contactosMap.set(cId, {
                  _id: cId,
                  empresaId: conv.empresaId,
                  telefono: contacto.telefono || '',
                  nombre: contacto.nombre || '',
                  direccion: contacto.direccion || '',
                  pisoDepto: contacto.pisoDepto || '',
                  codigoPostal: contacto.codigoPostal || '',
                  etiquetas: Array.isArray(contacto.etiquetas) ? contacto.etiquetas : []
                });
              }
              (conv.mensajes || []).forEach(m => {
                mensajesAll.push({
                  _id: m._id,
                  conversacionId: conv._id,
                  remitente: m.remitente,
                  contenido: m.contenido,
                  fecha: new Date(m.fecha || m.createdAt),
                  estado: m.estado || 'enviado',
                  fechaEstado: m.fechaEstado ? new Date(m.fechaEstado) : null,
                  tipo: m.tipo || 'texto',
                  urlArchivo: m.urlArchivo || ''
                });
              });
              return {
                _id: conv._id,
                empresaId: conv.empresaId,
                contactoId: cId,
                lineaReceptora: conv.lineaReceptora || '',
                numeroReceptor: conv.numeroReceptor || '',
                botActivo: conv.botActivo === false || conv.botActivo === 'false' ? false : true,
                estado: conv.estado || 'Abierto',
                ultimoMensaje: conv.ultimoMensaje || '',
                ultimaFecha: conv.updatedAt ? new Date(conv.updatedAt) : new Date(),
                cancelacionReciente: false,
                tieneMas: false,
                carrito: conv.carrito || [],
                carritoTotal: conv.carritoTotal || 0
              };
            });
            CONTACTOS = Array.from(contactosMap.values());
            CONVERSACIONES = conversacionesLocal;
            MENSAJES = mensajesAll;
            renderTodo();
          } catch (error) {
            console.error('Error al buscar mensajes:', error);
            renderListaChats();
          }
        }, 300);
      } else {
        if (texto.length === 0) {
          cargarConversaciones();
        } else {
          renderListaChats();
        }
      }
    });
  }


  // Botón para crear nuevo agente (placeholder)
  const btnNuevoAgente = document.getElementById('btn-nuevo-agente');
  if (btnNuevoAgente) {
    btnNuevoAgente.addEventListener('click', () => {
      console.log('Función para crear nuevo agente próximamente');
    });
  }

  // Botón para nuevo contacto
  const btnNuevoContacto = document.getElementById('btn-nuevo-contacto');
  const modalNuevoContacto = document.getElementById('modal-nuevo-contacto');
  if (btnNuevoContacto && modalNuevoContacto) {
    btnNuevoContacto.addEventListener('click', () => {
      modalNuevoContacto.classList.remove('hidden');
    });
  }

  const btnCerrarNuevoContacto = document.getElementById('btn-cerrar-nuevo-contacto');
  if (btnCerrarNuevoContacto && modalNuevoContacto) {
    btnCerrarNuevoContacto.addEventListener('click', () => {
      modalNuevoContacto.classList.add('hidden');
    });
  }

  const btnGuardarNuevoContacto = document.getElementById('btn-guardar-nuevo-contacto');
  if (btnGuardarNuevoContacto) {
    btnGuardarNuevoContacto.addEventListener('click', guardarNuevoContacto);
  }

  // Eventos del modal de login
  const btnIngresar = document.getElementById('btn-ingresar');
  if (btnIngresar) btnIngresar.addEventListener('click', manejarLogin);

  const inputTelefono = document.getElementById('input-telefono');
  if (inputTelefono) {
    inputTelefono.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        manejarLogin();
      }
    });
  }

  const inputPin = document.getElementById('input-pin');
  if (inputPin) {
    inputPin.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        manejarLogin();
      }
    });
  }

  // Verificamos si ya hay un token guardado
  const tokenGuardado = localStorage.getItem('token');
  if (!tokenGuardado) {
    mostrarModalLogin();
  } else {
    // Cargar datos del usuario (nombreSucursal y telefonosWhatsApp)
    cargarDatosUsuario();

    // Cargar conversaciones (fetch o mock)
    cargarConversaciones();

    // Actualizar contador de conversaciones usadas en 24 hs
    actualizarUsoConversaciones();
  }

  // Envío manual de mensaje
  const btnEnviar = document.getElementById('btn-enviar');
  const inputMensaje = document.getElementById('input-mensaje');
  if (btnEnviar) {
    btnEnviar.addEventListener('click', enviarMensajeDesdePanel);
  }
  if (inputMensaje) {
    inputMensaje.addEventListener('input', manejarInputMensaje);
    inputMensaje.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        enviarMensajeDesdePanel();
      }
    });
  }

  // Botón de adjuntar archivo
  const btnAdjuntar = document.getElementById('btn-adjuntar');
  const inputAdjuntar = document.getElementById('input-adjuntar');
  if (btnAdjuntar && inputAdjuntar) {
    btnAdjuntar.addEventListener('click', (e) => {
      e.preventDefault();
      inputAdjuntar.click();
    });
    inputAdjuntar.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        archivosPendientes = archivosPendientes.concat(files);
        mostrarArchivosPendientes();
      }
      e.target.value = '';
    });
  }

  // Botón para quitar el archivo adjunto pendiente
  const btnQuitarAdjunto = document.getElementById('archivo-pendiente-quitar');
  if (btnQuitarAdjunto) {
    btnQuitarAdjunto.addEventListener('click', () => {
      limpiarArchivosPendientes();
    });
  }

  // Guardar detalles del cliente
  const btnGuardarDetalles = document.getElementById('btn-guardar-detalles');
  if (btnGuardarDetalles) {
    btnGuardarDetalles.addEventListener('click', guardarDetallesCliente);
  }

  // Menú de tres puntos en perfil-header
  const btnMas = document.getElementById('btn-mas');
  const perfilMenu = document.getElementById('perfil-menu');
  if (btnMas && perfilMenu) {
    btnMas.addEventListener('click', (e) => {
      e.stopPropagation();
      perfilMenu.classList.toggle('hidden');
    });
  }
  document.addEventListener('click', (e) => {
    if (perfilMenu && !e.target.closest('.perfil-acciones')) {
      perfilMenu.classList.add('hidden');
    }
  });

  // Abrir y cerrar modal de detalles
  const btnDetalles = document.getElementById('btn-detalles-modal');
  if (btnDetalles) btnDetalles.addEventListener('click', abrirDetallesModal);
  const btnCerrar = document.getElementById('btn-cerrar-detalles');
  if (btnCerrar) btnCerrar.addEventListener('click', cerrarDetallesModal);
  const btnGuardarModal = document.getElementById('modal-guardar-detalles');
  if (btnGuardarModal) btnGuardarModal.addEventListener('click', guardarDetallesDesdeModal);

  // Botón y input para agregar etiquetas
  const btnAgregarEtiqueta = document.getElementById('btn-agregar-etiqueta');
  const inputNuevaEtiqueta = document.getElementById('nueva-etiqueta-input');
  if (btnAgregarEtiqueta) {
    btnAgregarEtiqueta.addEventListener('click', agregarEtiquetaDesdeUI);
  }
  if (inputNuevaEtiqueta) {
    inputNuevaEtiqueta.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        agregarEtiquetaDesdeUI();
      }
    });
  }

  // Delegación para eliminar etiquetas (clic en la ×)
  document.addEventListener('click', (e) => {
    const btnEliminar = e.target.closest('.etiqueta-remove');
    if (btnEliminar) {
      const etiqueta = btnEliminar.dataset.etiqueta;
      eliminarEtiquetaDesdeUI(etiqueta);
    }
  });

  // Switch Archivos | Notas
  document.querySelectorAll('.archivos-switch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.archivos-switch-btn').forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');
      const pestana = btn.dataset.pestanaArchivo;
      document.getElementById('archivos-panel').classList.toggle('hidden', pestana !== 'archivos');
      document.getElementById('notas-panel').classList.toggle('hidden', pestana !== 'notas');
    });
  });

  // Búsqueda por etiqueta (clic en chip)
  document.addEventListener('click', (e) => {
    const chipEtiqueta = e.target.closest('.chat-chip-etiqueta');
    if (chipEtiqueta) {
      e.stopPropagation();
      const etiqueta = chipEtiqueta.dataset.etiqueta;
      if (etiquetaFiltrada && etiquetaFiltrada.toLowerCase() === etiqueta.toLowerCase()) {
        etiquetaFiltrada = null;
      } else {
        etiquetaFiltrada = etiqueta;
      }
      renderListaChats();
      return;
    }
  });

  // Eliminar nota interna (delegación)
  document.addEventListener('click', (e) => {
    const btnEliminar = e.target.closest('.nota-remove-btn');
    if (btnEliminar) {
      eliminarNotaDesdeUI(btnEliminar.dataset.nota);
    }

    // Acciones rápidas en chat-item (atender/reabrir)
    const btnAccion = e.target.closest('.chat-item-accion');
    if (!btnAccion) return;
    e.preventDefault();
    e.stopPropagation();
    const convId = btnAccion.dataset.convId;
    const accion = btnAccion.dataset.accion;
    if (accion === 'atender') marcarAtendido(convId);
    else if (accion === 'reabrir') reabrirConversacion(convId);
  });

  // Guardar nota interna
  const btnGuardarNota = document.getElementById('guardar-nota');
  if (btnGuardarNota) btnGuardarNota.addEventListener('click', guardarNota);

  // Botón "volver" para móvil
  const chatHeader = document.querySelector('.chat-header');
  if (chatHeader && !document.getElementById('btn-volver')) {
    const backBtn = document.createElement('button');
    backBtn.id = 'btn-volver';
    backBtn.className = 'btn-volver';
    backBtn.textContent = '←';
    backBtn.title = 'Volver a la lista';
    backBtn.addEventListener('click', () => {
      chatActivoId = null;
      renderTodo();
    });
    chatHeader.insertBefore(backBtn, chatHeader.firstChild);
  }

  // Botón para cerrar la columna derecha en móvil
  armarBotonCerrarPerfilMovil();

  // Eventos de ventana cerrada y modal de plantillas
  const btnElegirPlantilla = document.getElementById('btn-elegir-plantilla-ventana');
  if (btnElegirPlantilla) {
    btnElegirPlantilla.addEventListener('click', abrirModalPlantillaChat);
  }
  const btnCancelarPlantilla = document.getElementById('plantilla-cancelar-chat');
  if (btnCancelarPlantilla) {
    btnCancelarPlantilla.addEventListener('click', () => {
      const modal = document.getElementById('modal-plantilla-ventana');
      if (modal) modal.classList.add('hidden');
    });
  }
  const btnEnviarPlantilla = document.getElementById('plantilla-enviar-chat');
  if (btnEnviarPlantilla) {
    btnEnviarPlantilla.addEventListener('click', enviarPlantillaDesdeChat);
  }
  const selectPlantillaChat = document.getElementById('plantilla-select-chat');
  if (selectPlantillaChat) {
    selectPlantillaChat.addEventListener('change', actualizarVariablesPlantillaChat);
  }

  ajustarVisibilidadSegunRol();
  cargarPlantillasDesdeMeta();

  // Eventos de gestión de agentes
  const btnGuardarAgente = document.getElementById('agente-guardar');
  if (btnGuardarAgente) btnGuardarAgente.addEventListener('click', crearAgenteDesdeUI);

  // Delegación para reintentar mensajes fallidos
  document.addEventListener('click', async (e) => {
    const btnReintentar = e.target.closest('.mensaje-reintentar');
    if (!btnReintentar) return;
    e.preventDefault();
    e.stopPropagation();

    const mensajeId = btnReintentar.dataset.reintentar;
    const token = localStorage.getItem('token') || '';

    const originalHTML = btnReintentar.outerHTML;
    btnReintentar.textContent = '⏳';

    try {
      const res = await fetch(`/api/whatsapp/reenviar/${mensajeId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (!res.ok) {
        mostrarToast(data.error || 'Error al reenviar mensaje', 'error');
        btnReintentar.outerHTML = originalHTML;
        return;
      }

      if (data.fallido) {
        mostrarToast(`El reenvío falló: ${data.error || 'Error desconocido'}`, 'error');
        btnReintentar.outerHTML = originalHTML;
      } else {
        mostrarToast('Mensaje reenviado correctamente', 'info');
        // El evento 'mensaje-estado' del socket actualizará el estado visual
      }
    } catch (error) {
      console.error('Error al reenviar mensaje:', error);
      mostrarToast('Error de red al reenviar mensaje', 'error');
      btnReintentar.outerHTML = originalHTML;
    }
  });
}

function ocultarBotonLlamarEnEscritorio() {
  // Si el dispositivo tiene un puntero fino (mouse/desktop),
  // ocultamos el botón de llamada porque no tiene sentido en escritorio.
  const style = document.createElement('style');
  style.textContent = '@media (pointer: fine) { [title="Llamar"], a[title="Llamar"], button[title="Llamar"] { display: none; } }';
  document.head.appendChild(style);
}

// Ocultar el control de volumen de los audios y hacer que la barra de progreso sea más larga
(function() {
  const style = document.createElement('style');
  style.textContent = `
    #area-mensajes audio {
      max-width: 220px;
    }
    #area-mensajes audio::-webkit-media-controls-enclosure {
      padding: 0;
    }
    #area-mensajes audio::-webkit-media-controls-panel {
      padding: 0;
      display: flex;
      align-items: center;
    }
    #area-mensajes audio::-webkit-media-controls-mute-button,
    #area-mensajes audio::-webkit-media-controls-volume-slider-container,
    #area-mensajes audio::-webkit-media-controls-volume-slider,
    #area-mensajes audio::-webkit-media-controls-toggle-closed-captions-button {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }
    #area-mensajes audio::-webkit-media-controls-timeline-container,
    #area-mensajes audio::-webkit-media-controls-timeline {
      flex: 1 1 100% !important;
      min-width: 0;
    }
  `;
  document.head.appendChild(style);
})();

// En celulares, al abrir un chat se debe ocultar el sidebar
(function() {
  const style = document.createElement('style');
  style.textContent = `
    @media (max-width: 768px) {
      #app.chat-abierto #slim-sidebar {
        display: none !important;
      }
    }
  `;
  document.head.appendChild(style);
})();

async function cargarAgentes() {
  if (!usuarioActual || usuarioActual.rol === 'agente') return;
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch('/api/admin/agentes', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al cargar agentes');
    AGENTES_GLOBAL = data.agentes || [];
    renderAgentes(AGENTES_GLOBAL);
    rellenarSelectEmpresasParaAgentes();
  } catch (error) {
    console.error('Error cargando agentes:', error);
  }
}

function renderAgentes(agentes) {
  const tbody = document.getElementById('agentes-body');
  const wrapper = document.getElementById('admin-agentes-wrapper');
  if (tbody) tbody.innerHTML = '';
  if (wrapper) wrapper.style.display = '';
  if (!tbody) return;
  if (agentes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#9CA3AF; padding:12px;">Sin agentes creados</td></tr>';
    return;
  }
  tbody.innerHTML = agentes.map(a => {
    const lineas = (a.empresasAcceso || []).length;
    const activoLabel = a.activo ? '✅' : '❌';
    return `
      <tr>
        <td>${escaparHTML(a.nombre || '')}</td>
        <td>${escaparHTML(a.telefono || '')}</td>
        <td>${lineas}</td>
        <td>${activoLabel}</td>
        <td>
          <button type="button" class="agente-editar" data-id="${a._id}" style="background:transparent;border:none;cursor:pointer;color:#2563eb;font-size:12px;">✏️</button>
          <button type="button" class="agente-toggle" data-id="${a._id}" data-activo="${a.activo}" style="background:transparent;border:none;cursor:pointer;color:#ef4444;font-size:12px;">${a.activo ? '🔒' : '🔓'}</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.agente-editar').forEach(btn => {
    btn.addEventListener('click', () => editarAgenteDesdeUI(btn.dataset.id));
  });
  tbody.querySelectorAll('.agente-toggle').forEach(btn => {
    btn.addEventListener('click', () => toggleAgenteDesdeUI(btn.dataset.id, btn.dataset.activo === 'true'));
  });
}

function rellenarSelectEmpresasParaAgentes() {
  const select = document.getElementById('agente-empresas');
  if (!select) return;
  select.innerHTML = '';
  if (EMPRESAS_INFO.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No hay líneas disponibles';
    opt.disabled = true;
    select.appendChild(opt);
    return;
  }
  EMPRESAS_INFO.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e._id;
    opt.textContent = `${e.nombre} (${e.whatsappPhoneId})`;
    select.appendChild(opt);
  });
}

function limpiarFormularioAgente() {
  agenteEditandoId = null;
  const nombre = document.getElementById('agente-nombre');
  const telefono = document.getElementById('agente-telefono');
  const pin = document.getElementById('agente-pin');
  const select = document.getElementById('agente-empresas');
  const btn = document.getElementById('agente-guardar');
  if (nombre) nombre.value = '';
  if (telefono) telefono.value = '';
  if (pin) pin.value = '';
  if (select) select.selectedIndex = -1;
  if (btn) btn.textContent = 'Crear agente';
}

function editarAgenteDesdeUI(id) {
  const agente = AGENTES_GLOBAL.find(a => String(a._id) === String(id));
  if (!agente) return;
  agenteEditandoId = id;
  const nombre = document.getElementById('agente-nombre');
  const telefono = document.getElementById('agente-telefono');
  const pin = document.getElementById('agente-pin');
  const select = document.getElementById('agente-empresas');
  const btn = document.getElementById('agente-guardar');
  if (nombre) nombre.value = agente.nombre || '';
  if (telefono) telefono.value = agente.telefono || '';
  if (pin) pin.value = '';
  if (select) {
    const idsAcceso = (agente.empresasAcceso || []).map(e => String(e));
    Array.from(select.options).forEach(opt => {
      opt.selected = idsAcceso.includes(opt.value);
    });
  }
  if (btn) btn.textContent = 'Guardar cambios';
}

async function crearAgenteDesdeUI() {
  const nombre = (document.getElementById('agente-nombre') || {}).value?.trim() || '';
  const telefono = (document.getElementById('agente-telefono') || {}).value?.trim() || '';
  const pin = (document.getElementById('agente-pin') || {}).value?.trim() || '';
  const select = document.getElementById('agente-empresas');
  const empresasAcceso = select ? Array.from(select.selectedOptions).map(o => o.value) : [];

  if (!nombre || !telefono || !pin) {
    mostrarToast('Completá nombre, teléfono y PIN', 'error');
    return;
  }
  if (empresasAcceso.length === 0) {
    mostrarToast('Seleccioná al menos una línea', 'error');
    return;
  }

  const token = localStorage.getItem('token') || '';
  const url = agenteEditandoId ? `/api/admin/agentes/${agenteEditandoId}` : '/api/admin/agentes';
  const method = agenteEditandoId ? 'PUT' : 'POST';
  const payload = { nombre, telefono, pin, empresasAcceso };

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarToast(data.error || 'Error al guardar agente', 'error');
      return;
    }
    mostrarToast(agenteEditandoId ? 'Agente actualizado' : 'Agente creado', 'info');
    limpiarFormularioAgente();
    cargarAgentes();
  } catch (error) {
    console.error('Error guardando agente:', error);
    mostrarToast('Error de red al guardar agente', 'error');
  }
}

async function toggleAgenteDesdeUI(id, activoActual) {
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/admin/agentes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ activo: !activoActual })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al actualizar agente');
    cargarAgentes();
  } catch (error) {
    console.error('Error al cambiar estado del agente:', error);
    mostrarToast('Error al cambiar estado del agente', 'error');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await precargarVistas();
  init();
});
document.addEventListener('DOMContentLoaded', ocultarBotonLlamarEnEscritorio);
