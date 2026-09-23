# Guía de Despliegue en DigitalOcean

Guía paso a paso para poner el proyecto en producción en un VPS de DigitalOcean.

## Requisitos previos

- Un Droplet con **Ubuntu 22.04 LTS** (1 GB RAM mínimo).
- Un dominio apuntando al IP del droplet (ej: `panel.midominio.com`).
- Credenciales de Meta/WhatsApp (token, app secret, verify token).
- Una API key de Gemini.
- Opcional: MongoDB Atlas en vez de MongoDB local.

---

## 1. Conectarse al VPS

```bash
ssh root@IP_DEL_VPS
```

---

## 2. Actualizar el sistema

```bash
sudo apt update && sudo apt upgrade -y
```

---

## 3. Instalar Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verificar:

```bash
node -v   # debe mostrar v20.x
npm -v
```

---

## 4. Instalar MongoDB (opcional)

Si no vas a usar MongoDB Atlas:

```bash
sudo apt install -y mongodb-org
sudo systemctl enable mongod
sudo systemctl start mongod
```

---

## 5. Instalar Nginx y Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

---

## 6. Subir el código al VPS

```bash
cd /var/www
git clone TU_REPOSITORIO crm
cd crm
npm install
```

---

## 7. Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

Completar **obligatoriamente**:

```env
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://panel.tudominio.com
JWT_SECRET=una_clave_muy_larga_y_aleatoria
MONGODB_URI=mongodb://localhost:27017/crm
WHATSAPP_APP_SECRET=...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=...
WHATSAPP_ACCESS_TOKEN=...
GEMINI_API_KEY=...
```

> Si usás MongoDB Atlas, cambiá `MONGODB_URI` por la cadena `mongodb+srv://...`.

---

## 8. Ejecutar migraciones y backup inicial

```bash
npm run migrate
npm run backup
```

---

## 9. Levantar con PM2

```bash
sudo npm install -g pm2
pm2 start index.js --name crm
pm2 startup systemd
```

Seguí las instrucciones que te imprime el último comando (te da un comando para ejecutar).

---

## 10. Configurar Nginx como proxy inverso

Crear el archivo de configuración:

```bash
sudo nano /etc/nginx/sites-available/crm
```

Pegar esto:

```nginx
server {
    listen 80;
    server_name panel.tudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Activar el sitio:

```bash
sudo ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 11. Configurar HTTPS con Certbot

```bash
sudo certbot --nginx -d panel.tudominio.com
```

Seguí las opciones que te pide (redirigir HTTP a HTTPS: sí).

---

## 12. Configurar el webhook en Meta

En el panel de Meta/WhatsApp, configurar:

- **URL:** `https://panel.tudominio.com/api/whatsapp/webhook`
- **Token de verificación:** el valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- **Eventos:** mensajes entrantes, mensajes enviados, estados de entrega.

---

## 13. Verificar health check

El endpoint de salud está disponible en:

```
https://panel.tudominio.com/health
```

Debería devolver un JSON con `ok: true` y el detalle de Mongo, memoria, disco, cola de IA y API de Meta.

---

## 14. Ver los logs

```bash
# Logs de PM2
pm2 logs crm

# Logs de la aplicación (rotación diaria)
tail -f /var/www/crm/logs/$(date +%F).log
```

---

## 15. Backup manual

```bash
cd /var/www/crm
npm run backup
```

Los backups se guardan en `backups/` con `mongodump --gzip`.

---

## Resolución de problemas

- **No arranca:** revisar que todas las variables obligatorias estén en `.env` y que `MONGODB_URI` apunte a una base accesible.
- **El webhook no llega:** validar que `WHATSAPP_APP_SECRET` y `WHATSAPP_WEBHOOK_VERIFY_TOKEN` sean los mismos que en Meta.
- **Rate limit:** si ves `429` de Meta, no es un problema del código; es límite de la API de WhatsApp.
- **Archivos no se ven:** verificar que el archivo esté en `uploads/EMPRESA_ID/` y que el usuario tenga permiso a esa empresa.

---

## Notas finales

- No exponer el puerto 3000 directamente a internet: usar Nginx.
- Mantener actualizado el `.env` con claves fuertes.
- Programar backups diarios (por ejemplo, con cron).
