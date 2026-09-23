require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

const MigracionSchema = new mongoose.Schema({
  nombre: { type: String, unique: true },
  aplicadaEn: { type: Date, default: Date.now }
});

const Migracion = mongoose.model('Migracion', MigracionSchema, 'migraciones');

async function conectar() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/crm';
  await mongoose.connect(uri);
  console.log('Conectado a MongoDB');
}

async function main() {
  await conectar();
  const archivos = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort();

  const aplicadas = await Migracion.find().lean();
  const aplicadasSet = new Set(aplicadas.map(a => a.nombre));

  for (const archivo of archivos) {
    if (aplicadasSet.has(archivo)) continue;
    const ruta = path.join(MIGRATIONS_DIR, archivo);
    const migracion = require(ruta);
    console.log(`▶️ Aplicando migración: ${archivo}`);
    try {
      await migracion.up();
      await Migracion.create({ nombre: archivo });
      console.log(`✅ Migración aplicada: ${archivo}`);
    } catch (e) {
      console.error(`❌ Error en migración ${archivo}:`, e.message);
      process.exit(1);
    }
  }
  console.log('Todas las migraciones aplicadas');
  await mongoose.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
