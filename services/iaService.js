const { generarTextoGemini } = require('./geminiService');

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

async function generarTextoDeepSeek(prompt) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  try {
    const resp = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      })
    });
    if (!resp.ok) {
      console.warn(`DeepSeek respondió ${resp.status}: ${await resp.text()}`);
      return null;
    }
    const data = await resp.json();
    return (data?.choices?.[0]?.message?.content || '').trim() || null;
  } catch (error) {
    console.warn(`⚠️ Error al llamar DeepSeek: ${error.message}`);
    return null;
  }
}

async function generarTextoClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!resp.ok) {
      console.warn(`Claude respondió ${resp.status}: ${await resp.text()}`);
      return null;
    }
    const data = await resp.json();
    const text = data?.content?.[0]?.text || '';
    return text.trim() || null;
  } catch (error) {
    console.warn(`⚠️ Error al llamar Claude: ${error.message}`);
    return null;
  }
}

async function generarTexto(prompt) {
  const gemini = await generarTextoGemini(prompt);
  if (gemini) return gemini;

  const deepseek = await generarTextoDeepSeek(prompt);
  if (deepseek) return deepseek;

  const claude = await generarTextoClaude(prompt);
  if (claude) return claude;

  return null;
}

module.exports = {
  generarTexto,
  generarTextoGemini,
  generarTextoDeepSeek,
  generarTextoClaude
};
