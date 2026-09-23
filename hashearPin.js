const bcrypt = require('bcryptjs');

// Utilidad para generar un hash bcrypt de un PIN
// Uso: node hashearPin.js <pin>
// Si no se pasa argumento, usa el PIN "8899"
// Este script es solo para desarrollo, NO incluirlo en producción

const pin = process.argv[2] || '8899';
const saltRounds = 10;

const hash = bcrypt.hashSync(pin, saltRounds);

console.log(`PIN original: ${pin}`);
console.log(`Hash generado: ${hash}`);
console.log('');
console.log('Copia el hash y pegalo en el campo pinCrm de la empresa en MongoDB.');
