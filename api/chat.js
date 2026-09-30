module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, accessCode } = req.body || {};

  if (accessCode !== process.env.ACCESS_CODE) {
    return res.status(401).json({ error: '접근 코드가 올바르지 않습니다.' });
  }

  if (!prompt) {
    return res.status(400).json({ error: '질문이 없습니다.' });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2048,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: 'Groq API 오류: ' + JSON.stringify(data) });
    }

    const text = data?.choices?.[0]?.message?.content || '';
    return res.status(200).json({ answer: text });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
