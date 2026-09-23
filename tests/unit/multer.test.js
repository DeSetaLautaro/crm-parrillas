const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const supertest = require('supertest');
const multer = require('multer');
const os = require('os');
const path = require('path');

function crearAppMulter() {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => cb(null, `test-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`)
  });
  const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const tiposPermitidos = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];
      if (tiposPermitidos.includes(file.mimetype)) {
        cb(null, true);
      } else {
        const err = new Error('Tipo de archivo no permitido. Solo se permiten imágenes (JPG, PNG, WEBP) o archivos de Excel.');
        err.status = 400;
        cb(err, false);
      }
    }
  });

  const app = express();
  app.post('/upload', upload.single('foto'), (req, res) => {
    res.json({ ok: true, filename: req.file.filename });
  });
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      return res.status(413).json({ error: err.message });
    }
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

test('Acepta imagen PNG', async () => {
  const app = crearAppMulter();
  const pngBytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const res = await supertest(app)
    .post('/upload')
    .attach('foto', pngBytes, 'test.png');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.filename.endsWith('.png'));
});

test('Rechaza archivo .exe', async () => {
  const app = crearAppMulter();
  const exeBytes = Buffer.from('MZ\x90\x00...');
  const res = await supertest(app)
    .post('/upload')
    .attach('foto', exeBytes, 'virus.exe');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Tipo de archivo no permitido/i);
});

test('Rechaza archivo mayor a 5MB', async () => {
  const app = crearAppMulter();
  const big = Buffer.alloc(6 * 1024 * 1024, 0);
  const res = await supertest(app)
    .post('/upload')
    .attach('foto', big, 'grande.png');
  assert.ok(res.status === 400 || res.status === 413);
});
