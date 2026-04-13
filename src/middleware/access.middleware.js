const { hasCapability } = require('../utils/permissions');

function hasPermission(capability) {
  return (req, res, next) => {
    const user = req.user;
    if (!user || !user.role) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!hasCapability(user.role, capability)) {
      return res.status(403).json({
        error: 'Forbidden',
        required: capability,
        yourRole: user.role
      });
    }
    next();
  };
}

module.exports = { hasPermission };
