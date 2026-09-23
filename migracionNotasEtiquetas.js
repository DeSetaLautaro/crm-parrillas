require('dotenv').config();
const mongoose = require('mongoose');
const Usuario = require('./models/usuario');
const Empresa = require('./models/Empresa');
const Cliente = require('./models/Cliente');
const Contacto = require('./models/Contacto');
const Conversacion = require('./models/Conversacion');
const Mensaje = require('./models/Mensaje');

// Script para migrar:
// 1. notas internas (string[] en Cliente/Contacto) -> Mensajes con remitente 'nota_interna'
// 2. etiquetas (strings) -> objetos { nombre, aplicadaPor, fecha, sucursal }

async function migrar() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm');
  console.log('Conectado a MongoDB');

  // ===== Migrar notas y etiquetas de Cliente =====
  const clientes = await Cliente.find({}).lean();
  for (const cliente of clientes) {
    // Etiquetas
    if (cliente.etiquetas && Array.isArray(cliente.etiquetas)) {
      const etiquetasMigradas = cliente.etiquetas.map(e => {
        if (typeof e === 'string') {
          return { nombre: e, aplicadaPor: '', fecha: new Date(), sucursal: '' };
        }
        return e;
      });
      await Cliente.findByIdAndUpdate(cliente._id, { $set: { etiquetas: etiquetasMigradas } });
    }

    // Notas -> Mensajes
    if (cliente.notas && Array.isArray(cliente.notas) && cliente.notas.length > 0) {
      let conversacion = await Conversacion.findOne({
        empresaId: cliente.empresaId,
        contactoId: cliente._id
      }).sort({ createdAt: -1 });

      if (!conversacion) {
        const empresa = await Empresa.findById(cliente.empresaId);
        conversacion = await Conversacion.create({
          empresaId: cliente.empresaId,
          contactoId: cliente._id,
          lineaReceptora: empresa?.whatsappPhoneId || '',
          numeroReceptor: '',
          botActivo: empresa?.botActivo !== false,
          estado: 'Abierto',
          ultimoMensaje: ''
        });
      }

      for (const nota of cliente.notas) {
        await Mensaje.create({
          conversacionId: conversacion._id,
          remitente: 'nota_interna',
          contenido: nota
        });
      }

      // Limpiar el array de notas (ya se convirtieron en mensajes)
      await Cliente.findByIdAndUpdate(cliente._id, { $set: { notas: [] } });
    }
  }

  // ===== Migrar notas y etiquetas de Contacto (modelo legacy) =====
  const contactos = await Contacto.find({}).lean();
  for (const contacto of contactos) {
    if (contacto.etiquetas && Array.isArray(contacto.etiquetas)) {
      const etiquetasMigradas = contacto.etiquetas.map(e => {
        if (typeof e === 'string') {
          return { nombre: e, aplicadaPor: '', fecha: new Date(), sucursal: '' };
        }
        return e;
      });
      await Contacto.findByIdAndUpdate(contacto._id, { $set: { etiquetas: etiquetasMigradas } });
    }

    if (contacto.notas && Array.isArray(contacto.notas) && contacto.notas.length > 0) {
      let conversacion = await Conversacion.findOne({
        empresaId: contacto.empresaId,
        contactoId: contacto._id
      }).sort({ createdAt: -1 });

      if (!conversacion) {
        const empresa = await Empresa.findById(contacto.empresaId);
        conversacion = await Conversacion.create({
          empresaId: contacto.empresaId,
          contactoId: contacto._id,
          lineaReceptora: empresa?.whatsappPhoneId || '',
          numeroReceptor: '',
          botActivo: empresa?.botActivo !== false,
          estado: 'Abierto',
          ultimoMensaje: ''
        });
      }

      for (const nota of contacto.notas) {
        await Mensaje.create({
          conversacionId: conversacion._id,
          remitente: 'nota_interna',
          contenido: nota
        });
      }

      await Contacto.findByIdAndUpdate(contacto._id, { $set: { notas: [] } });
    }
  }

  console.log('Migración de notas y etiquetas completada');
  await mongoose.disconnect();
}

migrar().catch((err) => {
  console.error('Error durante la migración:', err);
  process.exit(1);
});
