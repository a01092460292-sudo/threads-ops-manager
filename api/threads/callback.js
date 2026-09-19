const {
  config, json, parseCookies, cookieName, oauthCookieName, seal,
  setCookie, clearCookie, decodeState,
} = require('../_threads');

module.exports = async (req, res) => {
  const cfg = config(req);
  if (!cfg.ready) return json(res, 503, { error: 'Threads API 서버 설정이 없습니다.' });
  const state = String(req.query.state || '');
  const payload = decodeState(state, cfg.cookieSecret);
  if (!payload || parseCookies(req)[oauthCookieName(payload.clientId)] !== state) {
    return json(res, 400, { error: 'OAuth 요청이 만료되었거나 올바르지 않습니다.' });
  }
  if (req.query.error) {
    clearCookie(res, oauthCookieName(payload.clientId));
    res.statusCode = 302;
    res.setHeader('Location', `${cfg.appOrigin}/?threads_oauth=cancelled&client=${encodeURIComponent(payload.clientId)}`);
    return res.end();
  }
  try {
    const body = new URLSearchParams({
      client_id: cfg.appId,
      client_secret: cfg.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: cfg.redirectUri,
      code: String(req.query.code || ''),
    });
    const shortResponse = await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    const short = await shortResponse.json();
    if (!shortResponse.ok || !short.access_token) throw new Error(short?.error_message || short?.error?.message || '인증 코드를 교환하지 못했습니다.');

    const longParams = new URLSearchParams({
      grant_type: 'th_exchange_token', client_secret: cfg.appSecret, access_token: short.access_token,
    });
    const longResponse = await fetch(`https://graph.threads.net/access_token?${longParams}`);
    const long = await longResponse.json().catch(() => ({}));
    const accessToken = longResponse.ok && long.access_token ? long.access_token : short.access_token;
    const expiresIn = Number(long.expires_in || short.expires_in || 5184000);
    const value = seal({
      accessToken, userId: String(short.user_id || ''), username: payload.username,
      connectedAt: new Date().toISOString(), expiresAt: Date.now() + expiresIn * 1000,
    }, cfg.cookieSecret);
    setCookie(res, cookieName(payload.clientId), value, Math.min(expiresIn, 5184000));
    res.statusCode = 302;
    res.setHeader('Location', `${cfg.appOrigin}/?threads_oauth=success&client=${encodeURIComponent(payload.clientId)}`);
    res.end();
  } catch (error) {
    json(res, 502, { error: error.message || 'Threads 인증에 실패했습니다.' });
  }
};
