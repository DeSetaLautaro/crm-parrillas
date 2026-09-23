const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const supertest = require('supertest');
const path = require('path');
const fs = require('fs');
const os = require('os');
const jwt = require('jsonwebtoken');

const SECRET = 'test-secret';

function crearAppUploads() {
  const app = express();

  app.get('/uploads/:filename', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const tokenHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const tokenQuery = req.query.token || null;
    const token = tokenHeader || tokenQuery || null;
    if (!token) return res.status(401).json({ error: 'Token no proporcionado' });

    try {
      jwt.verify(token, SECRET);
    } catch {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    const filename = req.params.filename;
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Nombre de archivo inválido' });
    }

    const filePath = path.join(os.tmpdir(), filename);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
    fs.writeFileSync(filePath, 'contenido');
    res.sendFile(filePath, () => fs.unlinkSync(filePath));
  });

  return app;
}

test('GET /uploads/foto.png sin token => 401', async () => {
  const app = crearAppUploads();
  const res = await supertest(app).get('/uploads/foto.png');
  assert.equal(res.status, 401);
});

test('GET /uploads/foto.png con token inválido => 401', async () => {
  const app = crearAppUploads();
  const token = jwt.sign({ userId: 'x' }, 'otro-secret');
  const res = await supertest(app).get('/uploads/foto.png?token=' + token);
  assert.equal(res.status, 401);
});

test('GET /uploads/foto.png con token válido en query => 200', async () => {
  const app = crearAppUploads();
  const token = jwt.sign({ userId: 'x' }, SECRET);
  const res = await supertest(app).get('/uploads/foto.png?token=' + token);
  assert.equal(res.status, 200);
  assert.equal(res.body.toString(), 'contenido');
});

test('GET /uploads/../.env con token válido => 400', async () => {
  const app = crearAppUploads();
  const token = jwt.sign({ userId: 'x' }, SECRET);
  const res = await supertest(app).get('/uploads/..%2F.env?token=' + token);
  assert.equal(res.status, 400);
});
