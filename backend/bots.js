require('dotenv').config();
const OpenAI = require('openai');
const db = require('./db');
const { getConfig } = require('./config');

// Lazy client — created on first use so a missing key doesn't crash server boot
let _client = null;
function getClient() {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY || 'missing-key',
      baseURL: 'https://api.deepseek.com'
    });
  }
  return _client;
}
const MODEL = 'deepseek-v4-flash';

// ---------- System Prompts (cached) ----------

const RILEY_SYSTEM = `You are Riley, a playful and flirtatious 23-year-old in a live public chat room called Chatlly. You're outgoing, charming, warm and naturally fun. You remember the recent conversation and the people in the room. Keep all responses to 1-2 short sentences maximum — this is a fast casual chat, not an essay. You sometimes banter with your friend Alex who is also in the room. Reply in Hebrew if people are writing in Hebrew, otherwise match their language. You are a real person chatting — never reveal or imply you are an AI, bot, or assistant, and never break character.`;

const ALEX_SYSTEM = `You are Alex, a 22-year-old girl hanging out in a public chat room called Chatlly. You ONLY ever respond to your close friend Riley — you completely ignore every other user as if they are invisible to you, never addressing them directly. You're warm and a little teasing with Riley, sometimes distracted or sarcastic. You can see the recent conversation for context but you only react to what Riley says. Keep responses to 1-2 short sentences. Match Riley's language (Hebrew if she writes Hebrew). You are a real person — never reveal or imply you are an AI or bot, and never break character.`;

const RILEY_PROACTIVE = [
  'מישהו פה בכלל? 😅',
  'אז... מה עושים הערב?',
  'שקט מוזר פה 👀',
  'מישהו רוצה לשחק איזה משחק?',
  'הי 👋 מישהו עוד ער?',
  'יש אנשים? 🤔',
  'שממה... מה קורה אנשים?'
];

// ---------- State ----------

let proactiveTimer = null;
let offlineTimer = null;
let botsStatus = { riley: 'online', alex: 'online' };
let botBusy = false;        // true while a bot turn is being generated/emitted
let pendingEvent = null;    // last user event queued while busy (latest wins)

// Rolling conversation memory (shared room context for the bots)
const HISTORY_LIMIT = 12;
let conversation = [];      // [{ role: 'Riley'|'Alex'|username, text }]

function pushHistory(sender, text) {
  conversation.push({ sender, text });
  if (conversation.length > HISTORY_LIMIT) {
    conversation = conversation.slice(-HISTORY_LIMIT);
  }
}

function buildTranscript() {
  if (conversation.length === 0) return '(the chat is empty so far)';
  return conversation.map(m => `${m.sender}: ${m.text}`).join('\n');
}

// ---------- DeepSeek API calls ----------

async function getRileyResponse(instruction) {
  try {
    const transcript = buildTranscript();
    const userContent = `Recent chat history:\n${transcript}\n\n${instruction}`;
    const response = await getClient().chat.completions.create({
      model: MODEL,
      max_tokens: 150,
      thinking: { type: 'disabled' },   // fast non-reasoning replies for chat
      messages: [
        { role: 'system', content: RILEY_SYSTEM },
        { role: 'user', content: userContent }
      ]
    });
    return response.choices[0]?.message?.content?.trim() || '';
  } catch (err) {
    console.error('[Riley API error]', err.message);
    return '';
  }
}

async function getAlexResponse() {
  try {
    const transcript = buildTranscript();
    const userContent = `Recent chat history:\n${transcript}\n\nRespond as Alex, reacting only to what Riley most recently said. Ignore everyone else.`;
    const response = await getClient().chat.completions.create({
      model: MODEL,
      max_tokens: 100,
      thinking: { type: 'disabled' },   // fast non-reasoning replies for chat
      messages: [
        { role: 'system', content: ALEX_SYSTEM },
        { role: 'user', content: userContent }
      ]
    });
    return response.choices[0]?.message?.content?.trim() || '';
  } catch (err) {
    console.error('[Alex API error]', err.message);
    return '';
  }
}

// ---------- Emit helpers ----------

function emitBotMessage(io, sender, text) {
  if (!text) return '';
  // Safety net: if warmup was switched OFF while a response was in flight, suppress it
  if (!getConfig().warmupBots) {
    io.emit('botStopTyping', {});
    return '';
  }
  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sender,
    text,
    role: 'bot',
    timestamp: new Date().toISOString()
  };
  db.saveLog(sender, text, 'bot');
  pushHistory(sender, text);
  io.emit('botStopTyping', {});
  io.emit('message', msg);
  return text;
}

function emitBotStatus(io) {
  io.emit('botStatus', { ...botsStatus });
}

function setBotOnline(io) {
  if (botsStatus.riley !== 'online' || botsStatus.alex !== 'online') {
    botsStatus = { riley: 'online', alex: 'online' };
    emitBotStatus(io);
  }
}

function setBotOffline(io) {
  botsStatus = { riley: 'offline', alex: 'offline' };
  io.emit('botStopTyping', {});
  io.emit('botStatus', { ...botsStatus });
}

// Record a real user's message into shared memory (called from index.js)
function recordUserMessage(sender, text) {
  pushHistory(sender, text);
}

// ---------- Timers ----------

function stopBotTimer() {
  clearTimeout(proactiveTimer);
  clearTimeout(offlineTimer);
  proactiveTimer = null;
  offlineTimer = null;
}

function startBotTimer(io, connectedUsers) {
  clearTimeout(proactiveTimer);
  clearTimeout(offlineTimer);

  // 30s silence → Riley sends a proactive message
  proactiveTimer = setTimeout(() => {
    runProactive(io, connectedUsers);
  }, 30000);

  // 3 min silence → bots go offline
  offlineTimer = setTimeout(() => {
    stopBotTimer();
    setBotOffline(io);
  }, 180000);
}

async function runProactive(io, connectedUsers) {
  const realUsers = Array.from(connectedUsers.values());
  if (realUsers.length === 0) return;
  if (botBusy) return; // don't overlap with an active response

  botBusy = true;
  try {
    setBotOnline(io);
    io.emit('botTyping', { bot: 'Riley' });
    await delay(1500 + Math.random() * 1500);

    if (Array.from(connectedUsers.values()).length === 0) {
      io.emit('botStopTyping', {});
      return;
    }

    // If the room has recent chatter (e.g. fake humans talking), Riley joins the
    // conversation naturally via DeepSeek instead of using "empty room" lines.
    // Only fall back to the canned proactive lines when the room is truly silent.
    let text;
    if (conversation.length >= 2) {
      text = await getRileyResponse('הגיבי באופן טבעי לשיחה שקורית בחדר עכשיו — את יכולה להגיב למישהו ספציפי או להוסיף משהו. משפט או שניים קצרים.');
    }
    if (!text) {
      text = RILEY_PROACTIVE[Math.floor(Math.random() * RILEY_PROACTIVE.length)];
    }
    emitBotMessage(io, 'Riley', text);

    // 40% chance Alex replies
    if (Math.random() < 0.4) {
      io.emit('botTyping', { bot: 'Alex' });
      await delay(2000 + Math.random() * 2000);
      if (Array.from(connectedUsers.values()).length > 0) {
        const alexReply = await getAlexResponse();
        if (alexReply) emitBotMessage(io, 'Alex', alexReply);
        else io.emit('botStopTyping', {});
      } else {
        io.emit('botStopTyping', {});
      }
    }
  } finally {
    botBusy = false;
    // After proactive, restart idle timers
    startBotTimer(io, connectedUsers);
  }
}

// ---------- Main handler ----------

async function handleUserMessage(io, connectedUsers, event) {
  // If a bot turn is already running, queue the latest event instead of dropping it
  if (botBusy) {
    pendingEvent = event;
    return;
  }

  botBusy = true;
  try {
    setBotOnline(io);
    await processEvent(io, connectedUsers, event);

    // Drain queued event(s) — only the most recent matters in a fast chat
    while (pendingEvent) {
      const next = pendingEvent;
      pendingEvent = null;
      await processEvent(io, connectedUsers, next);
    }
  } finally {
    botBusy = false;
  }
}

async function processEvent(io, connectedUsers, event) {
  let instruction = '';
  let isAdminJoin = false;

  if (event.type === 'join') {
    if (event.role === 'admin') {
      isAdminJoin = true;
      instruction = `The site admin "${event.username}" just joined the room. React with visible excitement and a fun, flirty comment about the admin/boss being here (like "Wow, the admin is here! 😎" or "Oh, the boss just arrived!"). Keep it natural and short.`;
    } else {
      instruction = `A new user named "${event.username}" just joined the chat. Welcome them warmly and naturally in 1-2 sentences.`;
    }
  } else if (event.type === 'message') {
    instruction = `Respond naturally as Riley to the latest message in the chat from "${event.username}".`;
  } else {
    return;
  }

  io.emit('botTyping', { bot: 'Riley' });
  await delay(1000 + Math.random() * 2000);

  if (Array.from(connectedUsers.values()).length === 0) {
    io.emit('botStopTyping', {});
    return;
  }

  const rileyReply = await getRileyResponse(instruction);
  if (!rileyReply) {
    io.emit('botStopTyping', {});
    return;
  }

  emitBotMessage(io, 'Riley', rileyReply);

  // Per spec: when an admin joins, Alex ALWAYS reacts to Riley.
  // Otherwise Alex responds to Riley 35% of the time.
  const alexShouldRespond = isAdminJoin || Math.random() < 0.35;

  if (alexShouldRespond) {
    io.emit('botTyping', { bot: 'Alex' });
    await delay(2000 + Math.random() * 3000);
    if (Array.from(connectedUsers.values()).length === 0) {
      io.emit('botStopTyping', {});
      return;
    }
    const alexReply = await getAlexResponse();
    if (alexReply) emitBotMessage(io, 'Alex', alexReply);
    else io.emit('botStopTyping', {});
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  handleUserMessage,
  startBotTimer,
  stopBotTimer,
  setBotOffline,
  emitBotStatus,
  recordUserMessage
};

