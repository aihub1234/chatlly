const db = require('./db');

function kickUser(io, connectedUsers, username) {
  for (const [socketId, user] of connectedUsers.entries()) {
    if (user.username === username) {
      io.to(socketId).emit('kicked', { reason: 'הוצאת מהחדר על ידי מנהל' });
      io.sockets.sockets.get(socketId)?.disconnect(true);
      connectedUsers.delete(socketId);
      io.emit('adminMessage', { message: `${username} הוצא מהחדר` });
      return;
    }
  }
}

function banUser(io, connectedUsers, username, ip, reason, duration, bannedBy) {
  const expiresAt = duration > 0
    ? new Date(Date.now() + duration * 60 * 1000).toISOString()
    : null;

  db.banUser(username, ip, reason, duration, expiresAt, bannedBy);

  // Kick if currently online
  for (const [socketId, user] of connectedUsers.entries()) {
    if (user.username === username || (ip && user.ip === ip)) {
      io.to(socketId).emit('banned', { reason: reason || 'הפרת כללים' });
      io.sockets.sockets.get(socketId)?.disconnect(true);
      connectedUsers.delete(socketId);
    }
  }

  const durationLabel = duration === 0 ? 'לצמיתות' : `ל-${duration} דקות`;
  io.emit('adminMessage', { message: `${username} נחסם ${durationLabel}` });
}

function unbanUser(username) {
  db.unbanUser(username);
}

function makeAdmin(io, connectedUsers, username) {
  db.updateUserRole(username, 'admin');

  for (const [socketId, user] of connectedUsers.entries()) {
    if (user.username === username) {
      user.role = 'admin';
      io.to(socketId).emit('roleUpdated', { role: 'admin' });
    }
  }

  io.emit('adminMessage', { message: `${username} קודם למנהל` });
}

module.exports = { kickUser, banUser, unbanUser, makeAdmin };
