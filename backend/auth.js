// Single admin identity for the whole system: chat admin + control panel.
// Username matching is case-insensitive so "Mikeygold" / "mikeygold" both work.
// NOTE: the password has no hardcoded production value on purpose — it must come
// from the environment. index.js refuses to boot in production without it.
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'Mikeygold').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'local-dev-only';

/**
 * Returns { username, role } or null if admin credentials are wrong.
 * Regular users: any username, no password required.
 */
function loginUser(username, password) {
  if (String(username).toLowerCase() === ADMIN_USERNAME) {
    if (password !== ADMIN_PASSWORD) return null;
    return { username, role: 'admin' };
  }
  return { username, role: 'user' };
}

module.exports = { loginUser };
