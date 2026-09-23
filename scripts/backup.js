require('dotenv').config();
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execFileAsync = promisify(execFile);
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

async function backup() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/crm';
  const fecha = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(BACKUP_DIR, `backup-${fecha}`);

  console.log(`📦 Creando backup en ${out}...`);
  try {
    await execFileAsync('mongodump', ['--uri', uri, '--out', out, '--gzip']);
    console.log('✅ Backup completado.');
  } catch (e) {
    console.error('❌ Error ejecutando mongodump. ¿Tenés MongoDB Database Tools instaladas?', e.message);
    process.exit(1);
  }
}

backup();
