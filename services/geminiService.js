
// ============================================================
// Servicio Gemini encapsulado
// ============================================================
// Acá definimos la lista de modelos. El orden importa:
// primero prueba el primero, si falla (cuota, 503, etc) pasa al siguiente.
// Configurás los modelos en .env con GEMINI_MODELOS separados por coma.
//
// Ejemplo en .env:
// GEMINI_MODELOS=gemini-2.5-flash-preview-09-2025,gemini-2.0-flash,gemini-1.5-flash
// ============================================================

const CircuitBreaker = require('./circuitBreaker');
const { colaIA } = require('./iaQueue');
const breakerGemini = new CircuitBreaker({ errorThreshold: 5, resetTimeout: 30000 });

const MODELOS_POR_DEFECTO = [
  'gemini-3.6-flash',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite'
];

function obtenerModelos() {
  const desdeEnv = (process.env.GEMINI_MODELOS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  return desdeEnv.length > 0 ? desdeEnv : MODELOS_POR_DEFECTO;
}

/**
 * Genera texto usando Gemini.
 * Prueba cada modelo de la lista. Si uno falla, salta al siguiente.
 * Devuelve el texto plano (ya con .trim()) o null si todos fallaron.
 */
async function generarTextoGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ No hay GEMINI_API_KEY configurada');
    return null;
  }

  const modelos = obtenerModelos();
  let ultimoError = null;

  for (const modelo of modelos) {
    try {
      console.log(`🤖 Probando modelo Gemini: ${modelo}`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
      const resp = await colaIA.ejecutar(() => breakerGemini.execute(() => fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      })));

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data?.error?.message || `HTTP ${resp.status}`);
      }

      const texto = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';

      if (data.usageMetadata) {
        const usage = data.usageMetadata;
        const precioEntrada = 0.30;
        const precioSalida = 2.50;
        const costoEntrada = ((usage.promptTokenCount || 0) / 1000000) * precioEntrada;
        const costoSalida = ((usage.candidatesTokenCount || 0) / 1000000) * precioSalida;
        const costoTotal = (costoEntrada + costoSalida).toFixed(6);
        console.log(`📊 Tokens -> Entrada: ${usage.promptTokenCount} | Salida: ${usage.candidatesTokenCount} | Total: ${usage.totalTokenCount}`);
        console.log(`💰 Costo estimado: $${costoTotal} USD (${modelo})`);
      }

      return texto.trim();
    } catch (error) {
      ultimoError = error;
      console.warn(`⚠️ Modelo ${modelo} falló: ${error.message}. Probando siguiente...`);
    }
  }

  console.error('❌ Todos los modelos de Gemini fallaron:', ultimoError?.message || ultimoError);
  return null;
}

/**
 * Genera texto multimodal (con imagen, audio, etc.) usando Gemini.
 * El parámetro base64 debe ser el contenido del archivo codificado en base64.
 */
async function generarTextoConArchivo(prompt, mimeType, base64, tipo = 'archivo') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ No hay GEMINI_API_KEY configurada');
    return null;
  }

  const modelos = obtenerModelos();
  let ultimoError = null;

  for (const modelo of modelos) {
    try {
      console.log(`🤖 Probando modelo Gemini con ${tipo}: ${modelo}`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
      const resp = await colaIA.ejecutar(() => breakerGemini.execute(() => fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: base64 } }
            ]
          }]
        })
      })));

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data?.error?.message || `HTTP ${resp.status}`);
      }

      const texto = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      return texto.trim();
    } catch (error) {
      ultimoError = error;
      console.warn(`⚠️ Modelo ${modelo} falló con ${tipo}: ${error.message}. Probando siguiente...`);
    }
  }

  console.error(`❌ Todos los modelos de Gemini fallaron con ${tipo}:`, ultimoError?.message || ultimoError);
  return null;
}

async function generarTextoConImagen(prompt, mimeType, base64) {
  return generarTextoConArchivo(prompt, mimeType, base64, 'imagen');
}

async function generarTextoConAudio(prompt, mimeType, base64) {
  return generarTextoConArchivo(prompt, mimeType, base64, 'audio');
}

module.exports = { generarTextoGemini, generarTextoConImagen, generarTextoConAudio };
