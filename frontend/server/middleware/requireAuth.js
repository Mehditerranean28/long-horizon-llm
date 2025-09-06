module.exports = function requireAuth(req, res, next) {
  const id = req.session && req.session.userId;
  if (typeof id !== 'string' || !/^[a-fA-F0-9]{24}$/.test(id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  req.session.userId = id;
  next();
};
