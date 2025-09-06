const crypto = require('crypto');
const requestContext = require('../utils/requestContext');

module.exports = function correlationId(req, res, next) {
  const header = req.headers['x-correlation-id'];
  const stored = req.session && req.session.correlationId;
  const id = typeof header === 'string' && header.trim()
    ? header
    : stored || crypto.randomUUID();
  req.correlationId = id;
  requestContext.set('correlationId', id);
  if (req.log) {
    req.log = req.log.child({ correlationId: id });
    res.log = req.log;
  }
  res.set('x-correlation-id', id);
  if (req.session) {
    req.session.correlationId = id;
  }
  next();
};
