require('dotenv').config();
const mongoose = require('mongoose');
const Usuario = require('../models/usuario');
const Empresa = require('../models/Empresa');

async function migrar() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm');

  const usuarios = await Usuario.find({}).lean();

  for (const usuario of usuarios) {
    if (!usuario.horariosEstructurados || usuario.horariosEstructurados.length === 0) continue;

    await Empresa.updateMany(
      { usuarioAppId: usuario._id.toString() },
      { $set: { horariosEstructurados: usuario.horariosEstructurados } }
    );

    console.log(`Horarios copiados a empresas del usuario ${usuario.nombreDelLocal}`);
  }

  await mongoose.disconnect();
  console.log('Migración completada ✅');
}

migrar().catch(err => {
  console.error(err);
  process.exit(1);
});
