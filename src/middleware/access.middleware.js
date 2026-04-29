const { hasCapability } = require('../utils/permissions');

function hasPermission(capability) {
  return (req, res, next) => {
    const user = req.user;
    if (!user || !user.role) {
      console.warn(`[Access Middleware] Unauthorized: No user or role found for path ${req.path}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const permitted = hasCapability(user.role, capability);
    if (!permitted) {
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
