const { config, json, session } = require('../_threads');

module.exports = (req, res) => {
  const cfg = config(req);
  const clientId = req.query.clientId || '';
  const current = cfg.ready && clientId ? session(req, clientId, cfg) : null;
  json(res, 200, {
    configured: cfg.ready,
    connected: Boolean(current?.accessToken),
    username: current?.username || '',
    missing: cfg.missing,
  });
};
