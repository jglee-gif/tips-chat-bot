const {
  Anthropic,
  APIConnectionError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
  BadRequestError,
  APIError,
} = require('@anthropic-ai/sdk');
// 선정기업 벤치마크는 서버에만 두고, 요청 시 프롬프트의 {{BENCHMARK}} 자리에 삽입한다
const BENCHMARK = require('./_benchmark.js');

// 모델은 Vercel 환경변수 CLAUDE_MODEL로 바꿀 수 있음 (예: claude-sonnet-5)
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5';

// Vercel 함수 제한시간(60초) 안에 끝나도록 설정. 429/5xx는 SDK가 자동 재시도
const client = new Anthropic({ timeout: 50 * 1000, maxRetries: 1 });

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { accessCode } = body || {};
  let prompt = body?.prompt;
  if (typeof prompt === 'string' && Object.prototype.hasOwnProperty.call(BENCHMARK, body?.benchmark)) {
    prompt = prompt.replace('{{BENCHMARK}}', () => BENCHMARK[body.benchmark]);
  }
  const maxTokens = Math.min(Math.max(parseInt(body?.maxTokens, 10) || 2048, 128), 4096);

  if (accessCode !== process.env.ACCESS_CODE) {
    return res.status(401).json({ error: '접근 코드가 올바르지 않습니다.' });
  }
  if (!prompt) {
    return res.status(400).json({ error: '질문이 없습니다.' });
  }
  if (!(process.env.ANTHROPIC_API_KEY || '').trim()) {
    return res.status(500).json({ error: 'Vercel 환경변수 ANTHROPIC_API_KEY가 설정되어 있지 않습니다. 설정 후 Redeploy 해주세요.' });
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return res.status(200).json({ answer: text, truncated: response.stop_reason === 'max_tokens' });

  } catch (e) {
    console.error('Claude API error', e);
    if (e instanceof AuthenticationError) {
      return res.status(502).json({ error: 'Claude API 키가 올바르지 않습니다. Vercel 환경변수 ANTHROPIC_API_KEY를 확인해 주세요.' });
    }
    if (e instanceof PermissionDeniedError) {
      return res.status(502).json({ error: 'Claude API 사용 권한이 없습니다. Anthropic 콘솔에서 API 키 권한을 확인해 주세요.' });
    }
    if (e instanceof RateLimitError) {
      const retryAfter = Math.ceil(parseFloat(e.headers?.get('retry-after') || '30'));
      return res.status(429).json({ error: 'AI 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.', retryAfter });
    }
    if (e instanceof BadRequestError && /credit balance/i.test(e.message)) {
      return res.status(502).json({ error: 'Anthropic 계정의 크레딧이 부족합니다. console.anthropic.com → Billing에서 충전해 주세요.' });
    }
    if (e instanceof APIConnectionError) {
      return res.status(504).json({ error: 'Claude API 연결에 실패했거나 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.' });
    }
    if (e instanceof APIError && e.status === 529) {
      return res.status(503).json({ error: 'Claude 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.', retryAfter: 20 });
    }
    return res.status(500).json({ error: 'AI 서버 오류: ' + e.message });
  }
};
