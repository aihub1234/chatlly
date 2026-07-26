// ── Geo module (isolated) ──
// Detects a visitor's country from their IP and decides access level.
//
// Access levels:
//   'full'      — can read and write everywhere
//   'readonly'  — can view rooms but cannot post (foreign visitor in a local group)
//   'blocked'   — cannot enter at all (blocked country)
//
// SAFETY: if geoip-lite is unavailable or lookup fails, this module FAILS OPEN
// (grants full access). It must never lock people out because of a library issue.

let geoip = null;
try {
  geoip = require('geoip-lite');
} catch {
  console.warn('[Geo] geoip-lite not installed — geo features disabled (fail open)');
}

// ── Runtime configuration (live-editable from the control panel) ──
const geoConfig = {
  enabled: false,           // master switch — OFF by default so nothing changes until you turn it on
  blockedCountries: [],     // e.g. ['US']
  blockEU: false,           // block all EU member states
  readOnlyForForeign: true, // non-Israeli visitors get read-only in the Israel group
};

function getGeoConfig() {
  return { ...geoConfig, blockedCountries: [...geoConfig.blockedCountries] };
}

function setGeoConfig(patch = {}) {
  if (typeof patch.enabled === 'boolean') geoConfig.enabled = patch.enabled;
  if (typeof patch.blockEU === 'boolean') geoConfig.blockEU = patch.blockEU;
  if (typeof patch.readOnlyForForeign === 'boolean') geoConfig.readOnlyForForeign = patch.readOnlyForForeign;
  if (Array.isArray(patch.blockedCountries)) {
    geoConfig.blockedCountries = patch.blockedCountries
      .map(c => String(c).toUpperCase().trim())
      .filter(Boolean);
  }
  return getGeoConfig();
}

/**
 * Look up a country code from an IP.
 * @returns {{ country: string|null, isEU: boolean }}
 */
function lookupIP(ip) {
  if (!geoip || !ip) return { country: null, isEU: false };
  try {
    // Normalise IPv6-mapped IPv4 (::ffff:1.2.3.4) and localhost
    let clean = String(ip).replace(/^::ffff:/, '');
    if (clean === '::1' || clean === '127.0.0.1' || clean.startsWith('192.168.') || clean.startsWith('10.')) {
      return { country: 'LOCAL', isEU: false };
    }
    const res = geoip.lookup(clean);
    if (!res) return { country: null, isEU: false };
    return { country: res.country || null, isEU: res.eu === '1' };
  } catch {
    return { country: null, isEU: false };
  }
}

/**
 * Decide what a visitor from this IP is allowed to do.
 * @param {string} ip
 * @returns {{ level: 'full'|'readonly'|'blocked', country: string|null, isEU: boolean }}
 */
function checkAccess(ip) {
  const { country, isEU } = lookupIP(ip);

  // Master switch off, or we couldn't identify the country → full access (fail open)
  if (!geoConfig.enabled || !country || country === 'LOCAL') {
    return { level: 'full', country, isEU };
  }

  // Blocked country list
  if (geoConfig.blockedCountries.includes(country)) {
    return { level: 'blocked', country, isEU };
  }

  // EU block
  if (geoConfig.blockEU && isEU) {
    return { level: 'blocked', country, isEU };
  }

  // Non-Israeli visitors: read-only (they can watch, not post)
  if (geoConfig.readOnlyForForeign && country !== 'IL') {
    return { level: 'readonly', country, isEU };
  }

  return { level: 'full', country, isEU };
}

/**
 * Is a room writable for this access level?
 * Read-only visitors may still post freely inside the international group.
 */
function canPostInRoom(level, roomGroup) {
  if (level === 'full') return true;
  if (level === 'blocked') return false;
  // readonly: allowed to post only in the international group
  return roomGroup === 'intl';
}

module.exports = {
  checkAccess,
  lookupIP,
  canPostInRoom,
  getGeoConfig,
  setGeoConfig,
  isAvailable: () => !!geoip,
};
