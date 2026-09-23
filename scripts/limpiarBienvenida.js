/* Script para vaciar el campo bienvenida de todas las empresas existentes */
require('dotenv').config();
const mongoose = require('mongoose');
const Empresa = require('../models/Empresa');

async function limpiar() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/crm';
  await mongoose.connect(uri);
  const res = await Empresa.updateMany({}, { $set: { bienvenida: '' } });
  console.log(`Se actualizaron ${res.modifiedCount} empresas`);
  await mongoose.disconnect();
}

limpiar().catch(err => {
  console.error(err);
  process.exit(1);
});
