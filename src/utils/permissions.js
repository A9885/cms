const PERMISSIONS = {
  SuperAdmin: ['*'],
  Admin: [
    'user:view',
    'creative:moderate',
    'screen:manage',
    'audit:view'
  ],
  Brand: [
    'own_creative:manage',
    'own_reports:view'
  ],
  Partner: [
    'own_screens:manage'
  ]
};

function hasCapability(role, capability) {
  const caps = PERMISSIONS[role] || [];
  return caps.includes('*') || caps.includes(capability);
}

module.exports = { PERMISSIONS, hasCapability };
