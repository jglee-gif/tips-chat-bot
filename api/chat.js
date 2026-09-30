function callGroq(prompt, maxTokens) {
  return fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });
}

// Groq 오류를 사용자가 이해할 수 있는 한국어 메시지로 변환
function describeGroqError(status, data) {
  const msg = data?.error?.message || JSON.stringify(data);
  if (status === 413 || /request too large|tokens per minute/i.test(msg)) {
    return '요청 분량이 AI 사용 한도(분당 토큰)를 초과했습니다. 1분 후 다시 시도하거나, 문서를 나눠서 검토해 주세요.';
  }
  if (status === 429) {
    return 'AI 사용량 한도에 도달했습니다. 1분 정도 기다린 후 다시 시도해 주세요.';
  }
  if (status === 401) {
    return 'AI API 키가 올바르지 않습니다. Vercel 환경변수 GROQ_API_KEY를 확인해 주세요.';
  }
  return `AI 서버 오류 (HTTP ${status}): ${msg}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, accessCode } = req.body || {};
  const maxTokens = Math.min(Math.max(parseInt(req.body?.maxTokens, 10) || 2048, 128), 2048);

  if (accessCode !== process.env.ACCESS_CODE) {
    return res.status(401).json({ error: '접근 코드가 올바르지 않습니다.' });
  }

  if (!prompt) {
    return res.status(400).json({ error: '질문이 없습니다.' });
  }

  try {
    const response = await callGroq(prompt, maxTokens);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('Groq error', response.status, JSON.stringify(data));
      // 분당 한도 초과: 대기시간을 알려주면 브라우저가 기다렸다가 재시도
      if (response.status === 429) {
        const m = /try again in ([\d.]+)s/i.exec(data?.error?.message || '');
        const retryAfter = Math.ceil(parseFloat(response.headers.get('retry-after') || (m && m[1]) || '30'));
        return res.status(429).json({ error: describeGroqError(429, data), retryAfter });
      }
      return res.status(response.status === 413 ? 413 : 502)
        .json({ error: describeGroqError(response.status, data) });
    }

    const text = data?.choices?.[0]?.message?.content || '';
    return res.status(200).json({ answer: text });

  } catch (e) {
    return res.status(500).json({ error: 'AI 서버 연결 실패: ' + e.message });
  }
};
