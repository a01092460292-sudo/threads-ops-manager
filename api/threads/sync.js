const { config, json, session, graph } = require('../_threads');

const metricMap = { views: 'views', likes: 'likes', replies: 'comments', reposts: 'reposts', quotes: 'quotes', shares: 'shares' };

async function insights(mediaId, token) {
  try {
    const result = await graph(`${mediaId}/insights?metric=views,likes,replies,reposts,quotes,shares`, token);
    return Object.fromEntries((result.data || []).map((item) => [metricMap[item.name] || item.name, item.values?.[0]?.value ?? null]));
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  const cfg = config(req);
  const clientId = String(req.query.clientId || '');
  if (!cfg.ready) return json(res, 503, { error: 'Meta Threads API 서버 설정이 아직 완료되지 않았습니다.', code: 'THREADS_API_NOT_CONFIGURED', missing: cfg.missing });
  const current = session(req, clientId, cfg);
  if (!current?.accessToken) return json(res, 401, { error: '선택한 고객의 Threads 계정 연결이 필요합니다.', code: 'THREADS_ACCOUNT_NOT_CONNECTED' });
  try {
    const profile = await graph('me?fields=id,username,name,threads_profile_picture_url,threads_biography', current.accessToken);
    const expected = String(req.query.expectedUsername || '').replace(/^@/, '').toLowerCase();
    if (expected && profile.username && expected !== String(profile.username).toLowerCase()) {
      return json(res, 409, { error: `저장된 @${expected} 계정과 인증된 @${profile.username} 계정이 다릅니다.`, code: 'THREADS_USERNAME_MISMATCH', connectedUsername: profile.username });
    }
    const since = Math.floor((Date.now() - 30 * 86400000) / 1000);
    const fields = 'id,media_product_type,media_type,media_url,permalink,text,timestamp,shortcode,thumbnail_url,is_quote_post';
    const media = await graph(`me/threads?fields=${encodeURIComponent(fields)}&since=${since}&limit=100`, current.accessToken);
    const rows = (media.data || []).filter((item) => new Date(item.timestamp).getTime() >= since * 1000);
    const enriched = await Promise.all(rows.map(async (item) => ({ ...item, metrics: await insights(item.id, current.accessToken) })));
    json(res, 200, {
      profile: {
        id: profile.id, username: profile.username, name: profile.name,
        picture: profile.threads_profile_picture_url, bio: profile.threads_biography,
      },
      posts: enriched,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    json(res, error.status === 401 ? 401 : 502, { error: error.message || 'Threads 데이터를 불러오지 못했습니다.', details: error.details });
  }
};
