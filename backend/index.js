require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const db = require('./db');
const { loginUser } = require('./auth');
const { kickUser, banUser, unbanUser, makeAdmin } = require('./admin');
const { handleUserMessage, startBotTimer, stopBotTimer, setBotOffline, emitBotStatus, recordUserMessage } = require('./bots');
const { getConfig, setConfig } = require('./config');
const fakeHumans = require('./fakehumans');
const roomsModule = require('./rooms');
const crisis = require('./crisis');
const contentFilter = require('./contentfilter');
const geo = require('./geo');

// Let Riley & Alex "see" fake-human messages in their conversation memory,
// so Riley can respond to the people in the room instead of saying it's empty.
// Whenever a fake human speaks, feed the bots' shared memory AND refresh the
// user list. This guarantees the invariant "if someone is talking, they appear
// in the user list" — a speaker can never become an invisible ghost.
fakeHumans.setMessageHook((sender, text) => {
  recordUserMessage(sender, text);
  try { broadcastUserList(); } catch {}
});

const app = express();
const httpServer = createServer(app);

// ── Config ──────────────────────────────────────────────
const PORT = process.env.PORT || 3900;
const JWT_SECRET = process.env.JWT_SECRET || 'chatlly-dev-secret-change-in-prod';
const FRONTEND_URL = process.env.FRONTEND_URL || '*';

// ── Admin Panel credentials (separate hard-coded panel login) ──
const PANEL_USERNAME = process.env.PANEL_USERNAME || 'Mikeygold';
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || 'local-dev-only';

// ── Production safety guard ──
// If this looks like a real deployment (a persistent volume or a real frontend
// URL is configured), refuse to start with development placeholders. This
// prevents ever shipping with credentials that are visible in the source.
const IS_PRODUCTION =
  process.env.NODE_ENV === 'production' ||
  !!process.env.DATA_DIR ||
  (!!process.env.FRONTEND_URL && process.env.FRONTEND_URL !== '*');

if (IS_PRODUCTION) {
  const missing = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) missing.push('JWT_SECRET (min 16 chars)');
  if (!process.env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
  if (!process.env.PANEL_PASSWORD) missing.push('PANEL_PASSWORD');
  if (!process.env.DEEPSEEK_API_KEY) missing.push('DEEPSEEK_API_KEY');
  if (!process.env.FRONTEND_URL || process.env.FRONTEND_URL === '*') missing.push('FRONTEND_URL (must be your exact domain, not *)');

  if (missing.length) {
    console.error('\n╔════════════════════════════════════════════════════════╗');
    console.error('║  DEPLOYMENT BLOCKED — missing required configuration   ║');
    console.error('╚════════════════════════════════════════════════════════╝');
    missing.forEach(m => console.error('  ✗ ' + m));
    console.error('\n  Set these environment variables and redeploy.');
    console.error('  See DEPLOY.md for the full list.\n');
    process.exit(1);
  }
  console.log('[Chatlly] Production configuration verified ✓');
}

// ── Middleware ───────────────────────────────────────────
// CORS: reflect any origin (works reliably with Socket.io across ports locally).
// FRONTEND_URL can lock this down in production.
const corsOrigin = FRONTEND_URL === '*' ? true : FRONTEND_URL;
app.use(cors({ origin: corsOrigin }));
app.use(express.json());
app.get('/', (_req, res) => res.json({ status: 'Chatlly backend running ✓' }));

// Health check — used by Railway/monitoring to know the service is alive
app.get('/health', (_req, res) => res.status(200).json({
  ok: true,
  uptime: Math.round(process.uptime()),
  timestamp: new Date().toISOString(),
}));

// ── Socket.io ────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] }
});

// Connected users: Map<socketId, { username, role, ip, room }>
const connectedUsers = new Map();

// Bots (Riley/Alex/fakes) only operate in the main room. This wrapper makes their
// io.emit() calls broadcast to the main room only, without changing bot code.
const botIO = {
  emit: (event, data) => io.to(roomsModule.MAIN_ROOM).emit(event, data),
  to: (target) => io.to(target),
};

// ── Socket auth middleware ────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next();
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
  } catch {
    // Invalid token — still allow connection, user must 'join' or 'rejoin'
  }
  next();
});

// ── Helpers ──────────────────────────────────────────────
function getUserListForRoom(roomId) {
  const real = Array.from(connectedUsers.values())
    .filter(u => (u.room || 'main') === roomId)
    .map(u => ({ username: u.username, role: u.role }));

  // Fake humans live in whichever room they were spawned into. If that room id
  // is ever missing/invalid, fall back to the main room so active fakes can
  // never disappear from every list while still chatting.
  let fRoom = fakeHumans.getFakeRoom();
  if (!fRoom || !roomsModule.roomExists(fRoom)) fRoom = roomsModule.MAIN_ROOM;

  const fakes = fRoom === roomId
    ? fakeHumans.getActiveFakeUsers().map(f => ({ username: f.username, role: f.role }))
    : [];
  return [...real, ...fakes];
}

// Count of people (real + fakes) present in each room, for the sidebar badges
function getRoomCounts() {
  const counts = {};
  for (const room of roomsModule.getRooms()) counts[room.id] = 0;
  for (const u of connectedUsers.values()) {
    const r = u.room || 'main';
    counts[r] = (counts[r] || 0) + 1;
  }
  if (fakeHumans.getFakeCount() > 0) {
    let fr = fakeHumans.getFakeRoom();
    if (!fr || !roomsModule.roomExists(fr)) fr = roomsModule.MAIN_ROOM;
    counts[fr] = (counts[fr] || 0) + fakeHumans.getFakeCount();
  }
  return counts;
}

function broadcastRoomList() {
  io.emit('roomList', roomsModule.getRooms(), getRoomCounts(), roomsModule.getGroups());
}

function broadcastUserList() {
  // Send each room its own scoped user list
  const rooms = new Set(['main']);
  for (const u of connectedUsers.values()) rooms.add(u.room || 'main');
  for (const roomId of rooms) {
    io.to(roomId).emit('userList', getUserListForRoom(roomId));
  }
  // Room counts change whenever the user list does
  broadcastRoomList();
}

// Count of genuine connected humans (excludes fake bots, which aren't in connectedUsers anyway)
function realUserCount() {
  return connectedUsers.size;
}

function getClientIP(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  return forwarded ? forwarded.split(',')[0].trim() : socket.handshake.address;
}

function doJoin(socket, user, ip, isNewJoin = true) {
  socket.user = user;
  // Read-only (foreign) visitors start in the International group, where they
  // can actually chat — with a positive welcome rather than a wall.
  const level = socket.accessLevel || 'full';
  const currentRoom = level === 'readonly'
    ? roomsModule.INTL_MAIN_ROOM
    : roomsModule.MAIN_ROOM;
  socket.currentRoom = currentRoom;
  socket.join(currentRoom);
  connectedUsers.set(socket.id, { username: user.username, role: user.role, ip, room: currentRoom });
  db.upsertUser(user.username, user.role, ip);

  const token = jwt.sign(
    { username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  socket.emit('joined', {
    user,
    token,
    accessLevel: level,
    country: socket.geoCountry || null,
  });

  // Send room list + current room
  socket.emit('roomList', roomsModule.getRooms(), getRoomCounts(), roomsModule.getGroups());
  socket.emit('roomJoined', { roomId: currentRoom });

  // Send history for the main room
  const history = db.getRecentLogs(50, currentRoom);
  socket.emit('history', history);

  // Announce + update lists
  io.to(currentRoom).emit('userJoined', { username: user.username, role: user.role });
  broadcastUserList();
  emitBotStatus(botIO);

  const cfg = getConfig();

  // Auto-evict: each real user who joins the fakes' room makes ONE fake leave
  // (gradual, natural — "a user comes in, a bot goes out"). The rest stay chatting.
  // IMPORTANT: only on a genuinely NEW join. A page refresh / reconnect must NOT
  // evict anyone, otherwise every refresh would silently drain the room.
  if (isNewJoin && cfg.autoEvict && fakeHumans.getFakeCount() > 0 && fakeHumans.getFakeRoom() === currentRoom) {
    fakeHumans.evictOneFake(botIO, broadcastUserList);
  }

  // Riley + Alex (warmup hosts) — only if warmup toggle is ON.
  // Their logic and prompts are untouched; we only gate whether they run.
  if (cfg.warmupBots) {
    handleUserMessage(botIO, connectedUsers, { type: 'join', username: user.username, role: user.role });
    startBotTimer(botIO, connectedUsers);
  }
}

// ── Connection handler ───────────────────────────────────
io.on('connection', (socket) => {
  const clientIP = getClientIP(socket);

  // Rate limiting state (per socket)
  let msgTimestamps = [];
  const RATE_LIMIT = 5;       // max messages
  const RATE_WINDOW = 5000;   // per 5 seconds

  // ── JOIN (fresh login) ─────────────────────────────────
  socket.on('join', ({ username, password }) => {
    if (!username || username.trim().length < 2) {
      return socket.emit('error', { message: 'שם משתמש חייב להיות לפחות 2 תווים' });
    }

    const cleanName = username.trim().toLowerCase();

    // Already in room
    const taken = Array.from(connectedUsers.values()).find(u => u.username === cleanName);
    if (taken) {
      return socket.emit('error', { message: 'שם משתמש תפוס, בחר אחר' });
    }

    // Check ban
    const banned = db.isUserBanned(cleanName, clientIP);
    if (banned) {
      return socket.emit('error', { message: `חסום: ${banned.reason || 'הפרת כללים'}` });
    }

    // ── Geo access check (blocked country / read-only visitor) ──
    const access = geo.checkAccess(clientIP);
    if (access.level === 'blocked') {
      return socket.emit('geoBlocked', {
        country: access.country,
        message: 'השירות אינו זמין באזורך כרגע. / This service is not available in your region.'
      });
    }
    socket.accessLevel = access.level;   // 'full' | 'readonly'
    socket.geoCountry = access.country;

    const user = loginUser(cleanName, password);
    if (!user) {
      return socket.emit('error', { message: 'סיסמה שגויה' });
    }

    doJoin(socket, user, clientIP);
  });

  // ── REJOIN (page refresh with saved token) ─────────────
  socket.on('rejoin', ({ token }) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      const banned = db.isUserBanned(decoded.username, clientIP);
      if (banned) {
        socket.emit('banned', { reason: banned.reason || 'חסום' });
        return socket.disconnect(true);
      }

      const taken = Array.from(connectedUsers.values()).find(u => u.username === decoded.username);
      if (taken) {
        // Already connected with same username (duplicate tab) — kick old session
        for (const [sid, u] of connectedUsers.entries()) {
          if (u.username === decoded.username) {
            io.sockets.sockets.get(sid)?.disconnect(true);
            connectedUsers.delete(sid);
          }
        }
      }

      // Re-apply the geo check on reconnect, otherwise a page refresh would
      // silently bypass read-only / blocked status.
      const reAccess = geo.checkAccess(clientIP);
      if (reAccess.level === 'blocked') {
        socket.emit('geoBlocked', {
          country: reAccess.country,
          message: 'השירות אינו זמין באזורך כרגע. / This service is not available in your region.'
        });
        return socket.disconnect(true);
      }
      socket.accessLevel = reAccess.level;
      socket.geoCountry = reAccess.country;

      // isNewJoin = false → a refresh must NOT evict a fake human
      doJoin(socket, { username: decoded.username, role: decoded.role }, clientIP, false);
    } catch {
      // Token invalid/expired (e.g. JWT_SECRET changed) — tell client to reset session
      socket.emit('sessionExpired', { message: 'החיבור פג, התחבר מחדש' });
    }
  });

  // ── GET HISTORY ────────────────────────────────────────
  socket.on('getHistory', () => {
    const room = socket.currentRoom || roomsModule.MAIN_ROOM;
    socket.emit('history', db.getRecentLogs(50, room));
  });

  // ── MESSAGE ────────────────────────────────────────────
  socket.on('message', ({ text }) => {
    if (!socket.user) return socket.emit('error', { message: 'לא מחובר' });
    if (!text || !text.trim()) return;
    if (text.trim().length > 500) return socket.emit('error', { message: 'הודעה ארוכה מדי (מקס 500 תווים)' });

    // Rate limiting (admins exempt)
    if (socket.user.role !== 'admin') {
      const now = Date.now();
      msgTimestamps = msgTimestamps.filter(t => now - t < RATE_WINDOW);
      if (msgTimestamps.length >= RATE_LIMIT) {
        return socket.emit('error', { message: 'לאט יותר! יותר מדי הודעות' });
      }
      msgTimestamps.push(now);
    }

    const room = socket.currentRoom || roomsModule.MAIN_ROOM;

    // ── Read-only enforcement (foreign visitor in a local group) ──
    const roomGroup = roomsModule.getRoomGroup(room);
    if (!geo.canPostInRoom(socket.accessLevel || 'full', roomGroup)) {
      return socket.emit('error', {
        message: 'אתה צופה בלבד בקבוצה זו. עבור לקבוצה הבינלאומית כדי לכתוב. / You are viewing only. Switch to the International group to chat.'
      });
    }

    // ── CONTENT FILTER (runs BEFORE publish — zero exposure window) ──
    // Tier 1 (criminal) is always enforced. Tier 2 depends on the group setting.
    const sensitiveOn = roomsModule.isFilterEnabledForRoom(room);
    const verdict = contentFilter.checkContent(text.trim(), sensitiveOn);
    if (verdict.blocked) {
      // Message is never published to anyone. Sender gets a quiet explanation.
      return socket.emit('error', { message: verdict.reason });
    }

    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sender: socket.user.username,
      text: text.trim(),
      role: socket.user.role,
      room,
      timestamp: new Date().toISOString()
    };

    db.saveLog(msg.sender, msg.text, msg.role, room);
    io.to(room).emit('message', msg);

    // ── Crisis protocol (real-time, highest priority) ──
    // If someone expresses distress, quietly send THEM a supportive referral.
    // Sent only to that user (not the room) so it never becomes public exposure.
    const crisisCheck = crisis.checkMessage(msg.text);
    if (crisisCheck.detected) {
      socket.emit('message', {
        id: `${Date.now()}-crisis`,
        sender: 'Chatlly',
        text: crisisCheck.response,
        role: 'system',
        room,
        timestamp: new Date().toISOString()
      });
    }

    // Fake humans see (and can respond to) messages in whatever room they're in
    if (fakeHumans.getFakeCount() > 0 && fakeHumans.getFakeRoom() === room) {
      fakeHumans.recordMessage(msg.sender, msg.text);
    }

    // Riley + Alex operate in the main room only
    if (room === roomsModule.MAIN_ROOM) {
      recordUserMessage(msg.sender, msg.text);
      if (getConfig().warmupBots) {
        handleUserMessage(botIO, connectedUsers, { type: 'message', username: socket.user.username, role: socket.user.role, text: text.trim() });
        startBotTimer(botIO, connectedUsers);
      }
    }
  });

  // ── SWITCH ROOM ────────────────────────────────────────
  socket.on('switchRoom', ({ roomId }) => {
    if (!socket.user) return;
    if (!roomsModule.roomExists(roomId)) return socket.emit('error', { message: 'חדר לא קיים' });

    const oldRoom = socket.currentRoom || roomsModule.MAIN_ROOM;
    if (oldRoom === roomId) return;

    socket.leave(oldRoom);
    io.to(oldRoom).emit('userLeft', { username: socket.user.username });

    socket.join(roomId);
    socket.currentRoom = roomId;
    const entry = connectedUsers.get(socket.id);
    if (entry) entry.room = roomId;

    socket.emit('roomJoined', { roomId });
    socket.emit('history', db.getRecentLogs(50, roomId));
    io.to(roomId).emit('userJoined', { username: socket.user.username, role: socket.user.role });
    broadcastUserList();

    // Bot roaming: if a non-main room now has exactly 1 real user, send a warm-up greeting.
    if (roomId !== roomsModule.MAIN_ROOM && getConfig().warmupBots) {
      maybeWarmRoom(roomId);
    }
  });

  // ── GET ROOMS ──────────────────────────────────────────
  socket.on('getRooms', () => {
    socket.emit('roomList', roomsModule.getRooms(), getRoomCounts(), roomsModule.getGroups());
  });

  // ── PRIVATE CHAT ───────────────────────────────────────
  // Toggle whether this user accepts private chat requests
  socket.on('private:setOpen', ({ open }) => {
    if (!socket.user) return;
    const entry = connectedUsers.get(socket.id);
    if (entry) entry.openToPrivate = !!open;
  });

  // Request a private chat — requires the other side to accept.
  socket.on('private:request', ({ targetUsername }) => {
    if (!socket.user) return;
    const targetEntry = [...connectedUsers.entries()].find(([, u]) => u.username === targetUsername);
    // If target isn't connected OR isn't open to private → same "not available" message.
    // (Fake humans are never in connectedUsers, so they naturally return this too.)
    if (!targetEntry || !targetEntry[1].openToPrivate) {
      return socket.emit('error', { message: 'המשתמש לא זמין לצ\'אט פרטי' });
    }
    const [targetSocketId] = targetEntry;

    io.to(targetSocketId).emit('private:incoming', { from: socket.user.username });
    socket.emit('private:requested', { to: targetUsername });
  });

  socket.on('private:accept', ({ fromUsername }) => {
    if (!socket.user) return;
    const fromEntry = [...connectedUsers.entries()].find(([, u]) => u.username === fromUsername);
    if (!fromEntry) return socket.emit('error', { message: 'המשתמש כבר לא מחובר' });
    const [fromSocketId] = fromEntry;

    // Deterministic private room id from the two usernames
    const pair = [socket.user.username, fromUsername].sort().join('__');
    const privateRoom = 'pm_' + pair;

    socket.join(privateRoom);
    io.sockets.sockets.get(fromSocketId)?.join(privateRoom);

    io.to(socket.id).emit('private:opened', { room: privateRoom, with: fromUsername });
    io.to(fromSocketId).emit('private:opened', { room: privateRoom, with: socket.user.username });
  });

  socket.on('private:decline', ({ fromUsername }) => {
    const fromEntry = [...connectedUsers.entries()].find(([, u]) => u.username === fromUsername);
    if (fromEntry) io.to(fromEntry[0]).emit('private:declined', { by: socket.user?.username });
  });

  socket.on('private:message', ({ room, text }) => {
    if (!socket.user || !room || !room.startsWith('pm_')) return;
    if (!text || !text.trim()) return;
    // Only members of the private room receive it
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sender: socket.user.username,
      text: text.trim(),
      role: socket.user.role,
      room,
      private: true,
      timestamp: new Date().toISOString()
    };
    io.to(room).emit('private:message', msg);
  });

  socket.on('private:close', ({ room }) => {
    if (!room || !room.startsWith('pm_')) return;
    io.to(room).emit('private:closed', { room });
    // Both sockets leave
    io.in(room).socketsLeave(room);
  });

  // ── IP BAN (from private chat or right-click) ──────────
  socket.on('user:banIP', ({ username }) => {
    if (socket.user?.role !== 'admin') return;
    const target = [...connectedUsers.values()].find(u => u.username === username);
    const ip = target?.ip || null;
    if (!ip) return socket.emit('error', { message: 'לא נמצא IP למשתמש' });
    banUser(io, connectedUsers, username, ip, 'חסימת IP', 0, socket.user.username);
    broadcastUserList();
  });

  // ── ADMIN ACTIONS ──────────────────────────────────────
  function requireAdmin() {
    return socket.user?.role === 'admin';
  }

  socket.on('admin:kick', ({ username }) => {
    if (!requireAdmin()) return;
    kickUser(io, connectedUsers, username);
    broadcastUserList();
  });

  socket.on('admin:ban', ({ username, reason, duration }) => {
    if (!requireAdmin()) return;
    const target = Array.from(connectedUsers.values()).find(u => u.username === username);
    banUser(io, connectedUsers, username, target?.ip || null, reason, Number(duration) || 0, socket.user.username);
    broadcastUserList();
  });

  socket.on('admin:unban', ({ username }) => {
    if (!requireAdmin()) return;
    unbanUser(username);
    socket.emit('adminMessage', { message: `${username} שוחרר מחסימה` });
  });

  socket.on('admin:makeAdmin', ({ username }) => {
    if (!requireAdmin()) return;
    makeAdmin(io, connectedUsers, username);
    broadcastUserList();
  });

  socket.on('admin:getBanList', () => {
    if (!requireAdmin()) return;
    socket.emit('banList', db.getBanList());
  });

  socket.on('admin:getLogs', () => {
    if (!requireAdmin()) return;
    socket.emit('chatLogs', db.getAllLogs());
  });

  socket.on('admin:getStats', () => {
    if (!requireAdmin()) return;
    socket.emit('stats', db.getStats());
  });

  // ── CONTROL PANEL (same Mikeygold identity as chat admin) ───────────
  socket.on('panel:login', ({ username, password }) => {
    if (String(username).toLowerCase() === String(PANEL_USERNAME).toLowerCase() && password === PANEL_PASSWORD) {
      socket.isPanelAuth = true;
      const panelToken = jwt.sign({ panel: true }, JWT_SECRET, { expiresIn: '12h' });
      socket.emit('panel:authorized', {
        token: panelToken,
        config: getConfig(),
        stats: getPanelStats()
      });
    } else {
      socket.emit('panel:denied', { message: 'שם משתמש או סיסמה שגויים' });
    }
  });

  // Re-auth via panel token (page refresh inside panel)
  socket.on('panel:auth', ({ token }) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!decoded.panel) throw new Error('not a panel token');
      socket.isPanelAuth = true;
      socket.emit('panel:authorized', {
        token,
        config: getConfig(),
        stats: getPanelStats()
      });
    } catch {
      socket.emit('panel:denied', { message: 'פג תוקף, התחבר מחדש' });
    }
  });

  function requirePanel() {
    return socket.isPanelAuth === true;
  }

  socket.on('panel:getState', () => {
    if (!requirePanel()) return;
    socket.emit('panel:state', { config: getConfig(), stats: getPanelStats() });
  });

  socket.on('panel:setConfig', (patch) => {
    if (!requirePanel()) return;
    const wasWarmup = getConfig().warmupBots;
    const newConfig = setConfig(patch || {});

    // If warmup was just turned OFF, take Riley & Alex offline immediately
    if (wasWarmup && !newConfig.warmupBots) {
      stopBotTimer();
      setBotOffline(botIO);
    }

    // If fake humans toggled ON and there are no real users, spawn now
    if (newConfig.fakeHumans && realUserCount() === 0) {
      fakeHumans.spawnFakeHumans(botIO, newConfig.fakeHumansCount, broadcastUserList);
    }
    // If fake humans toggled OFF, clear them
    if (!newConfig.fakeHumans && fakeHumans.getFakeCount() > 0) {
      fakeHumans.evictFakeHumans(botIO, broadcastUserList, true);
    }

    io.emit('panel:configChanged', newConfig); // broadcast to any open panels
    socket.emit('panel:state', { config: newConfig, stats: getPanelStats() });
  });

  // Manually spawn fake humans into the room right now
  socket.on('panel:spawnFakes', ({ roomId } = {}) => {
    if (!requirePanel()) return;
    const cfg = getConfig();
    const targetRoom = (roomId && roomsModule.roomExists(roomId)) ? roomId : roomsModule.MAIN_ROOM;

    // If fakes already exist (maybe in another room), clear them from their old
    // room first using a GLOBAL emitter, so they don't linger as ghosts that
    // inflate the user count across rooms.
    if (fakeHumans.getFakeCount() > 0) {
      const globalIO = { emit: (event, data) => io.emit(event, data), to: (t) => io.to(t) };
      fakeHumans.clearAllFakes(globalIO, broadcastUserList);
    }

    // Room-scoped emitter so the NEW fakes appear in the chosen room only
    const roomScopedIO = {
      emit: (event, data) => io.to(targetRoom).emit(event, data),
      to: (t) => io.to(t),
    };
    fakeHumans.spawnFakeHumans(roomScopedIO, cfg.fakeHumansCount, broadcastUserList, targetRoom);
    setTimeout(() => socket.emit('panel:state', { config: getConfig(), stats: getPanelStats() }), 500);
  });

  // Panic button: clear ALL fake humans instantly
  socket.on('panel:panic', () => {
    if (!requirePanel()) return;
    fakeHumans.clearAllFakes(botIO, broadcastUserList);
    socket.emit('panel:state', { config: getConfig(), stats: getPanelStats() });
    socket.emit('adminMessage', { message: '🛑 כל הבוטים נוקו' });
  });

  // Room management (panel only)
  socket.on('panel:addRoom', ({ name, emoji, groupId }) => {
    if (!requirePanel()) return;
    const room = roomsModule.addRoom(name, emoji, groupId);
    io.emit('roomList', roomsModule.getRooms(), getRoomCounts(), roomsModule.getGroups());
    socket.emit('adminMessage', { message: `חדר "${room.name}" נוצר` });
  });

  // Per-group content filter toggle (Tier 2 — sensitive content)
  socket.on('panel:setGroupFilter', ({ groupId, enabled }) => {
    if (!requirePanel()) return;
    const ok = roomsModule.setGroupFilter(groupId, enabled);
    if (!ok) return socket.emit('error', { message: 'קבוצה לא נמצאה' });
    io.emit('roomList', roomsModule.getRooms(), getRoomCounts(), roomsModule.getGroups());
    const g = roomsModule.getGroup(groupId);
    socket.emit('adminMessage', {
      message: `פילטר תוכן ל"${g.name}" ${enabled ? 'הופעל' : 'כובה'}`
    });
  });

  // ── Geo blocking / read-only config ──
  socket.on('panel:getGeo', () => {
    if (!requirePanel()) return;
    socket.emit('panel:geoState', {
      config: geo.getGeoConfig(),
      available: geo.isAvailable(),
    });
  });

  socket.on('panel:setGeo', (patch) => {
    if (!requirePanel()) return;
    const next = geo.setGeoConfig(patch || {});
    socket.emit('panel:geoState', { config: next, available: geo.isAvailable() });
    socket.emit('adminMessage', { message: 'הגדרות אזור עודכנו' });
  });

  socket.on('panel:removeRoom', ({ roomId }) => {
    if (!requirePanel()) return;
    const ok = roomsModule.removeRoom(roomId);
    if (!ok) return socket.emit('error', { message: 'לא ניתן למחוק חדר זה' });
    // Move anyone in that room back to main
    for (const [sid, u] of connectedUsers.entries()) {
      if (u.room === roomId) {
        const s = io.sockets.sockets.get(sid);
        if (s) {
          s.leave(roomId);
          s.join(roomsModule.MAIN_ROOM);
          s.currentRoom = roomsModule.MAIN_ROOM;
          u.room = roomsModule.MAIN_ROOM;
          s.emit('roomJoined', { roomId: roomsModule.MAIN_ROOM });
          s.emit('history', db.getRecentLogs(50, roomsModule.MAIN_ROOM));
        }
      }
    }
    io.emit('roomList', roomsModule.getRooms(), getRoomCounts(), roomsModule.getGroups());
    broadcastUserList();
    socket.emit('adminMessage', { message: 'החדר נמחק' });
  });

  // ── DISCONNECT ─────────────────────────────────────────
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    const room = user.room || roomsModule.MAIN_ROOM;
    connectedUsers.delete(socket.id);
    io.to(room).emit('userLeft', { username: user.username });
    broadcastUserList();

    // No real users left
    if (realUserCount() === 0) {
      stopBotTimer();
      setBotOffline(botIO);

      // If fake-humans mode is ON, repopulate the empty room for the next visitor
      const cfg = getConfig();
      if (cfg.fakeHumans && fakeHumans.getFakeCount() === 0) {
        fakeHumans.spawnFakeHumans(botIO, cfg.fakeHumansCount, broadcastUserList);
      }
    }
  });
});

// ── Bot roaming: warm up a side room that has a lone user ──
const warmedRooms = new Set();
function maybeWarmRoom(roomId) {
  // Count real users in this room
  const usersInRoom = [...connectedUsers.values()].filter(u => (u.room || 'main') === roomId);
  if (usersInRoom.length !== 1) return;        // only warm when exactly 1 lonely user
  if (warmedRooms.has(roomId)) return;         // don't double-warm
  warmedRooms.add(roomId);

  const roomIO = {
    emit: (event, data) => io.to(roomId).emit(event, data),
    to: (t) => io.to(t),
  };

  // Riley greets after a natural delay
  setTimeout(() => {
    const stillThere = [...connectedUsers.values()].some(u => (u.room || 'main') === roomId);
    if (!stillThere) { warmedRooms.delete(roomId); return; }

    roomIO.emit('botTyping', { bot: 'Riley' });
    setTimeout(() => {
      const greetings = ['היי! ברוך הבא לחדר 😊', 'הו מישהו הצטרף! מה קורה?', 'היי, נחמד שבאת לפה 👋'];
      const text = greetings[Math.floor(Math.random() * greetings.length)];
      const msg = { id: `${Date.now()}-r`, sender: 'Riley', text, role: 'bot', room: roomId, timestamp: new Date().toISOString() };
      db.saveLog('Riley', text, 'bot', roomId);
      roomIO.emit('botStopTyping', {});
      roomIO.emit('message', msg);

      // Riley returns to main after ~90s if the user is still alone
      setTimeout(() => {
        warmedRooms.delete(roomId);
        const users = [...connectedUsers.values()].filter(u => (u.room || 'main') === roomId);
        if (users.length >= 1) {
          const bye = 'אני חוזרת לחדר הראשי, תיהנה! 💕';
          const m2 = { id: `${Date.now()}-r2`, sender: 'Riley', text: bye, role: 'bot', room: roomId, timestamp: new Date().toISOString() };
          db.saveLog('Riley', bye, 'bot', roomId);
          roomIO.emit('message', m2);
        }
      }, 90000);
    }, 1500);
  }, 3000);
}

// ── Panel stats snapshot ─────────────────────────────────
function getPanelStats() {
  return {
    serverUp: true,
    realUsers: connectedUsers.size,
    fakeHumans: fakeHumans.getFakeCount(),
    warmupActive: getConfig().warmupBots,
    totalMessages: db.getStats().totalMessages,
  };
}

// ── Start ────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`[Chatlly] Server running on port ${PORT}`);
});

// ── Crash guards ─────────────────────────────────────────
// Never let a stray async error (e.g. an API hiccup) take the whole server down.
process.on('uncaughtException', (err) => {
  console.error('[Chatlly] Uncaught exception (kept alive):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Chatlly] Unhandled rejection (kept alive):', reason?.message || reason);
});
