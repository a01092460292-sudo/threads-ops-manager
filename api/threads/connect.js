const { config, json, oauthCookieName, setCookie, encodeState } = require('../_threads');

module.exports = (req, res) => {
  const cfg = config(req);
  const clientId = String(req.query.clientId || '');
  const username = String(req.query.username || '').replace(/^@/, '');
  if (!clientId) return json(res, 400, { error: '고객을 먼저 선택해 주세요.' });
  if (!cfg.ready) return json(res, 503, {
    error: 'Meta Threads API 서버 설정이 아직 완료되지 않았습니다.',
    code: 'THREADS_API_NOT_CONFIGURED',
    missing: cfg.missing,
  });

  const state = encodeState({ clientId, username, issuedAt: Date.now() }, cfg.cookieSecret);
  setCookie(res, oauthCookieName(clientId), state, 600);
  const params = new URLSearchParams({
    client_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    scope: 'threads_basic,threads_manage_insights',
    response_type: 'code',
    state,
  });
  res.statusCode = 302;
  res.setHeader('Location', `https://threads.net/oauth/authorize?${params}`);
  res.end();
};
