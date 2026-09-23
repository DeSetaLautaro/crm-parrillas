require('dotenv').config();
const mongoose = require('mongoose');
const Empresa = require('./models/Empresa');
const Contacto = require('./models/Contacto');
const Cliente = require('./models/Cliente');
const Conversacion = require('./models/Conversacion');
const Pedido = require('./models/Pedido');

async function migrar() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm');
  console.log('Conectado a MongoDB');

  const contactos = await Contacto.find({}).lean();
  const mapeo = new Map(); // old ObjectId string -> new ObjectId string

  for (const c of contactos) {
    const empresa = await Empresa.findById(c.empresaId).lean();
    const localId = empresa ? empresa.usuarioAppId : null;
    const empresaId = c.empresaId || null;

    const telefono = c.telefono || '';
    const query = { telefono };
    if (empresaId) query.empresaId = empresaId;

    let cliente = await Cliente.findOne(query).lean();

    if (!cliente) {
      // Creamos el Cliente conservando el _id original para no romper referencias
      cliente = await Cliente.create({
        _id: c._id,
        localId,
        empresaId,
        telefono: telefono,
        nombre: c.nombre || '',
        direccion: c.direccion || '',
        pisoDepto: c.pisoDepto || '',
        codigoPostal: c.codigoPostal || '',
        etiquetas: c.etiquetas || [],
        notas: c.notas || [],
        cantidadPedidos: c.cantidadPedidos || 0,
        direcciones: c.direcciones || [],
        ultimaFechaPedido: c.ultimaFechaPedido || null
      });
      if (c._id && c._id.toString() !== cliente._id.toString()) {
        mapeo.set(c._id.toString(), cliente._id.toString());
      }
    } else {
      // Ya existe un Cliente para ese telefono/empresa, actualizamos las referencias
      mapeo.set(c._id.toString(), cliente._id.toString());
    }
  }

  // Actualizamos Conversacion y Pedido que apuntaban a los ID viejos de contactos
  for (const [oldId, newId] of mapeo) {
    await Conversacion.updateMany(
      { contactoId: new mongoose.Types.ObjectId(oldId) },
      { $set: { contactoId: new mongoose.Types.ObjectId(newId) } }
    );
    await Pedido.updateMany(
      { contactoId: new mongoose.Types.ObjectId(oldId) },
      { $set: { contactoId: new mongoose.Types.ObjectId(newId) } }
    );
  }

  console.log('Migración completada');
  await mongoose.disconnect();
}

migrar().catch((err) => {
  console.error('Error durante la migración:', err);
  process.exit(1);
});
