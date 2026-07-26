// ── Rooms + Groups module ──
// Groups are a layer ABOVE rooms: Group "Israel" holds Hebrew rooms,
// Group "International" holds English rooms.
// Each group carries its own language and content-filter setting.

const DEFAULT_GROUPS = [
  {
    id: 'israel',
    name: 'ישראל',
    nameEn: 'Israel',
    emoji: '🇮🇱',
    lang: 'he',
    filterSensitive: true,   // stricter by default
    system: true,
  },
  {
    id: 'intl',
    name: 'בינלאומי',
    nameEn: 'International',
    emoji: '🌍',
    lang: 'en',
    filterSensitive: false,  // freer by default
    system: true,
  },
];

const DEFAULT_ROOMS = [
  // Israel group
  { id: 'main',    name: 'ראשי',   nameEn: 'Main',    emoji: '🏠', group: 'israel', system: true },
  { id: 'general', name: 'כללי',   nameEn: 'General', emoji: '💬', group: 'israel', system: false },
  { id: 'love',    name: 'אהבה',   nameEn: 'Love',    emoji: '❤️', group: 'israel', system: false },
  { id: 'games',   name: 'משחקים', nameEn: 'Games',   emoji: '🎮', group: 'israel', system: false },
  { id: 'movies',  name: 'סרטים',  nameEn: 'Movies',  emoji: '🎬', group: 'israel', system: false },
  // International group
  { id: 'intl_main',  name: 'ראשי (אנגלית)', nameEn: 'Main Hall', emoji: '🌐', group: 'intl', system: true },
  { id: 'intl_chat',  name: 'צ׳אט חופשי',    nameEn: 'Free Chat', emoji: '💬', group: 'intl', system: false },
  { id: 'intl_games', name: 'משחקים (אנגלית)', nameEn: 'Gaming',  emoji: '🎮', group: 'intl', system: false },
];

let groups = JSON.parse(JSON.stringify(DEFAULT_GROUPS));
let rooms = JSON.parse(JSON.stringify(DEFAULT_ROOMS));

// ── Groups ──
function getGroups() {
  return groups.map(g => ({ ...g }));
}

function getGroup(id) {
  return groups.find(g => g.id === id) || null;
}

function groupExists(id) {
  return groups.some(g => g.id === id);
}

function setGroupFilter(groupId, enabled) {
  const g = groups.find(x => x.id === groupId);
  if (!g) return false;
  g.filterSensitive = !!enabled;
  return true;
}

// Is the sensitive filter on for the group that owns this room?
function isFilterEnabledForRoom(roomId) {
  const room = rooms.find(r => r.id === roomId);
  if (!room) return false;
  const g = groups.find(x => x.id === room.group);
  return g ? !!g.filterSensitive : false;
}

function getGroupLang(groupId) {
  const g = groups.find(x => x.id === groupId);
  return g ? g.lang : 'he';
}

// ── Rooms ──
function getRooms(groupId) {
  const list = groupId ? rooms.filter(r => r.group === groupId) : rooms;
  return list.map(r => ({ ...r }));
}

function addRoom(name, emoji, groupId) {
  const id = 'room_' + Date.now().toString(36);
  const group = groupExists(groupId) ? groupId : 'israel';
  const room = {
    id,
    name: name || 'חדר חדש',
    nameEn: name || 'New Room',
    emoji: emoji || '💭',
    group,
    system: false,
  };
  rooms.push(room);
  return room;
}

function removeRoom(id) {
  const room = rooms.find(r => r.id === id);
  if (!room || room.system) return false; // can't remove system rooms
  rooms = rooms.filter(r => r.id !== id);
  return true;
}

function roomExists(id) {
  return rooms.some(r => r.id === id);
}

function getRoom(id) {
  return rooms.find(r => r.id === id) || null;
}

// Which group does this room belong to?
function getRoomGroup(roomId) {
  const room = rooms.find(r => r.id === roomId);
  return room ? room.group : 'israel';
}

// Default room for a group (its system room)
function getDefaultRoomForGroup(groupId) {
  const room = rooms.find(r => r.group === groupId && r.system);
  return room ? room.id : MAIN_ROOM;
}

const MAIN_ROOM = 'main';
const INTL_MAIN_ROOM = 'intl_main';

module.exports = {
  // groups
  getGroups, getGroup, groupExists, setGroupFilter,
  isFilterEnabledForRoom, getGroupLang, getRoomGroup, getDefaultRoomForGroup,
  // rooms
  getRooms, getRoom, addRoom, removeRoom, roomExists,
  MAIN_ROOM, INTL_MAIN_ROOM,
};
