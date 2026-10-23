const OPERATOR_KB = require('./_operator_kb.js');
module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const code = process.env.OPERATOR_CODE;
  if (!code || !body || body.accessCode !== code) return res.status(401).json({ error: 'unauthorized' });
  return res.status(200).json({ chunks: OPERATOR_KB });
};
