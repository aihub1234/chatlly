// ── In-memory data store with JSON file backup ──
// Zero native compilation (no better-sqlite3). Same API as before.
// Data persists to chatlly-data.json between restarts on a best-effort basis.

const fs = require('fs');
const path = require('path');

// Where the JSON store lives.
// In production set DATA_DIR to a mounted persistent volume (e.g. /data on
// Railway) so bans, users and history survive container restarts and redeploys.
// Locally it falls back to this folder, exactly as before.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'chatlly-data.json');

// Make sure the directory exists (a freshly mounted volume may be empty)
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (err) {
  console.warn('[DB] could not create data dir:', err.message);
}

// In-memory tables
let store = {
  users: [],       // { username, role, ip, last_seen, created_at }
  ban_list: [],    // { id, username, ip, reason, duration, expires_at, banned_by, banned_at, active }
  chat_logs: [],   // { id, sender, message, role, timestamp }
  _banSeq: 1,
  _logSeq: 1,
};

// ── Persistence (best-effort) ──
function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      store = { ...store, ...parsed };
    }
  } catch (err) {
    console.error('[db] load failed, starting fresh:', err.message);
  }
}

let saveTimer = null;
function saveDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
}
function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store), 'utf-8');
  } catch (err) {
    console.error('[db] save failed:', err.message);
  }
}

load();

function nowISO() {
  return new Date().toISOString();
}

module.exports = {
  upsertUser(username, role, ip) {
    const existing = store.users.find(u => u.username === username);
    if (existing) {
      existing.role = role;
      existing.ip = ip;
      existing.last_seen = nowISO();
    } else {
      store.users.push({
        username,
        role,
        ip,
        last_seen: nowISO(),
        created_at: nowISO(),
      });
    }
    saveDebounced();
  },

  isUserBanned(username, ip) {
    const now = Date.now();
    const hit = store.ban_list.find(b =>
      b.active === 1 &&
      (b.username === username || (ip && b.ip === ip)) &&
      (b.duration === 0 || (b.expires_at && new Date(b.expires_at).getTime() > now))
    );
    return hit || null;
  },

  banUser(username, ip, reason, duration, expiresAt, bannedBy) {
    store.ban_list.push({
      id: store._banSeq++,
      username: username || null,
      ip: ip || null,
      reason: reason || null,
      duration,
      expires_at: expiresAt || null,
      banned_by: bannedBy,
      banned_at: nowISO(),
      active: 1,
    });
    saveDebounced();
  },

  unbanUser(username) {
    store.ban_list.forEach(b => {
      if (b.username === username) b.active = 0;
    });
    saveDebounced();
  },

  updateUserRole(username, role) {
    const u = store.users.find(x => x.username === username);
    if (u) u.role = role;
    saveDebounced();
  },

  saveLog(sender, message, role, room) {
    store.chat_logs.push({
      id: store._logSeq++,
      sender,
      message,
      role: role || 'user',
      room: room || 'main',
      timestamp: nowISO(),
    });
    // Keep memory bounded — cap at last 2000 logs
    if (store.chat_logs.length > 2000) {
      store.chat_logs = store.chat_logs.slice(-2000);
    }
    saveDebounced();
  },

  getRecentLogs(limit = 50, room = 'main') {
    return store.chat_logs
      .filter(l => (l.room || 'main') === room)
      .slice(-limit)
      .map(l => ({
        id: l.id,
        sender: l.sender,
        message: l.message,
        role: l.role,
        room: l.room || 'main',
        timestamp: l.timestamp,
      }));
  },

  getAllLogs() {
    return [...store.chat_logs]
      .sort((a, b) => b.id - a.id)
      .slice(0, 1000);
  },

  getBanList() {
    return store.ban_list
      .filter(b => b.active === 1)
      .sort((a, b) => new Date(b.banned_at) - new Date(a.banned_at));
  },

  getStats() {
    return {
      totalMessages: store.chat_logs.length,
      totalUsers: store.users.length,
      activeBans: store.ban_list.filter(b => b.active === 1).length,
    };
  },
};
