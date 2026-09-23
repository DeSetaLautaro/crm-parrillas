# Contexto de Base de Datos (Compartida: Delivery + CRM WhatsApp)

REGLA CRÍTICA PARA LA IA: NO existen colecciones separadas para "empresas" y "usuarios". Hemos unificado todo en la colección 'usuarios' (Modelo: Usuario). Un Usuario ES la Empresa.

## Colección: 'usuarios' (Modelo Mongoose: Usuario)
Representa la cuenta principal del dueño, su local comercial y la configuración de su Bot de WhatsApp. Todo el sistema se relaciona con el `_id` de este documento.

Campos del esquema unificado:
- `_id`: ObjectId (identificador único del local/dueño)
- `nombre`: String (Nombre del dueño)
- `nombreSucursal`: String (Nombre comercial del local, ej: "Mi Local de Prueba")
- `email`: String (Correo para login)
- `password`: String (Contraseña hasheada)
- `whatsappPhoneId`: String (ID del teléfono de WhatsApp para el bot)
- `botActivo`: Boolean (Default: true)
- `fechaRegistro`: Date
- `updatedAt`: Date
- `rubro` : string 