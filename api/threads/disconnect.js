const { config, json, cookieName, clearCookie } = require('../_threads');

module.exports = (req, res) => {
  const cfg = config(req);
  const clientId = String(req.query.clientId || '');
  if (!clientId) return json(res, 400, { error: '고객을 먼저 선택해 주세요.' });
  clearCookie(res, cookieName(clientId));
  json(res, 200, { disconnected: true, configured: cfg.ready });
};
