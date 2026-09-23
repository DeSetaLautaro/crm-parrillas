# Arquitectura del Proyecto: CRM Omnicanal para WhatsApp

## 1. Resumen del Sistema
Este proyecto es un SaaS (Software as a Service) Multi-tenant. Es un Panel de Control (CRM) que permite a múltiples negocios (Empresas/Locales) gestionar sus chats de WhatsApp desde una sola interfaz. Integra un Bot de IA (Gemini) que atiende a los clientes en piloto automático, con la capacidad de hacer "Human Handoff" (transferir el chat a un humano).

## 2. Lógica de Negocio Core (¡MUY IMPORTANTE!)
- **Multi-tenant:** TODAS las consultas a la base de datos deben estar filtradas por `empresaId`. Un local jamás debe ver los chats o contactos de otro local.
- **Múltiples Líneas por Empresa:** Una empresa puede tener varios números de WhatsApp conectados. Esto se identifica con el campo `lineaReceptora` en cada Conversación.
- **Human Handoff (El Switch del Bot):** En la colección `Conversacion`, existe un campo booleano llamado `botActivo`. 
  - Si `botActivo === true`: Los mensajes entrantes se procesan con la IA (Gemini).
  - Si `botActivo === false`: La IA ignora el mensaje. Queda a la espera de que el humano conteste desde el frontend.
- **Notas Internas:** Los empleados pueden dejar notas invisibles para el cliente. Se guardan en la colección de Mensajes con `remitente: "nota_interna"`.
- **Trazabilidad de Etiquetas:** Las etiquetas de los contactos no son simples strings, son Objetos que guardan quién, cuándo y en qué sucursal se aplicó esa etiqueta.

## 3. Estructura de la Base de Datos (Mongoose)
El sistema se divide estrictamente en 4 colecciones relacionales:

1. **Empresas:**
   - La entidad principal que paga el software.
   - Tiene: `nombre`, `whatsappPhoneId` (número principal), `promptIA`.

2. **Contactos:**
   - Los clientes finales que escriben por WhatsApp.
   - Referencia a `empresaId`.
   - Tiene: `nombre`, `telefono`, `etiquetas` (Array de objetos con trazabilidad).

3. **Conversaciones:**
   - Representa el hilo del chat entre un Contacto y una Empresa por una línea específica.
   - Referencia a `empresaId` y `contactoId`.
   - Tiene: `lineaReceptora`, `botActivo` (Boolean), `estado` (Abierto/Cerrado), `ultimoMensaje`.

4. **Mensajes:**
   - Cada burbuja individual de chat.
   - Referencia a `conversacionId`.
   - Tiene: `remitente` ('cliente', 'bot', 'humano', 'nota_interna'), `contenido`, `fecha`.

## 4. Reglas de Desarrollo Frontend
- Interfaz de 3 columnas (Lista de Chats, Chat Activo, Perfil del Contacto).
- HTML5, CSS3 puro y Vanilla JavaScript. **NO usar React ni frameworks.**
- Todo el manejo de datos (Mock data o fetch a APIs) debe estar aislado en funciones asíncronas para facilitar el intercambio entre datos falsos y reales (`USAR_MOCK_DATA`).
- Usar un diseño limpio, moderno, tipo Dashboard SaaS.