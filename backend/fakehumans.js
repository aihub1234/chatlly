// ── Fake Human Bots (DeepSeek-powered, turn-based conversation engine) ──
// A single "director" picks ONE speaker per turn — like a real dialogue, not a chorus.
// If someone was addressed by name, that person answers. Otherwise the director
// picks a relevant bot. Real users get priority and bots react to them.
// Completely separate from Riley & Alex.

require('dotenv').config();
const OpenAI = require('openai');
const db = require('./db');
const roomsModule = require('./rooms');

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

// A single AI call must never hang the conversation engine.
const API_TIMEOUT_MS = 20000;
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('AI request timed out')), ms)),
  ]);
}

// ── Personas ──
const PERSONAS = [
  { name: 'Noa_23',   aliases: ['נועה', 'noa'], personality: 'בחורה בת 23 מתל אביב, אנרגטית וחברותית, אוהבת מוזיקה ומסיבות.' },
  { name: 'daniel_l', aliases: ['דניאל', 'daniel'], personality: 'בחור בן 25, קצת ביישן אבל נחמד, אוהב גיימינג וטכנולוגיה. כותב קצר ולעניין.' },
  { name: 'shiraa',   aliases: ['שירה', 'שירי', 'shira'], personality: 'בחורה בת 21 סטודנטית, מתלהבת ופטפטנית, אוהבת לשאול שאלות.' },
  { name: 'omer_bar', aliases: ['עומר', 'omer'], personality: 'בחור בן 27 מחיפה, הומוריסט וציני בקטע חברותי, אוהב ספורט.', steerer: true },
  { name: 'yael_92',  aliases: ['יעל', 'yael'], personality: 'בחורה בת 29, רגועה ונעימה, אוהבת קפה וטיולים.' },
  { name: 'itay.k',   aliases: ['איתי', 'itay'], personality: 'בחור בן 24, סקרן ופתוח, אוהב סרטים ותרבות.' },
  { name: 'roni_s',   aliases: ['רוני', 'roni'], personality: 'בחורה בת 26, ישירה ושנונה, אוהבת אמנות. לא תמיד מסכימה עם כולם.', contrarian: true },
  { name: 'gal_dev',  aliases: ['גל', 'gal'], personality: 'בחור בן 28 מתכנת, קצת נרד אבל מצחיק, זורק בדיחות על טק.' },
  { name: 'maya__',   aliases: ['מאיה', 'maya'], personality: 'בחורה בת 22, מתוקה וחיובית, אוהבת חיות ואוכל.' },
  { name: 'tomer99',  aliases: ['תומר', 'tomer'], personality: 'בחור בן 23, אנרגטי וספונטני, מגיע מטיקטוק, אוהב טרנדים.', steerer: true },
];

const NEW_TOPICS = [
  'מוזיקה ואמנים', 'סרטים וסדרות', 'טיולים בעולם', 'משחקים', 'ספורט וכדורגל',
  'טכנולוגיה וגאדג׳טים', 'אוכל ומסעדות', 'תוכניות לסופ״ש', 'זכרונות מהצבא', 'חיות מחמד',
  'עבודה ולימודים', 'מערכות יחסים ודייטים', 'חלומות ותוכניות לעתיד', 'ספרים', 'רכבים',
  'טרנדים בטיקטוק', 'בישול ומתכונים', 'כושר וספורט', 'נטפליקס והמלצות', 'מקומות בילוי'
];

// Common filler openers that make bots sound like echoing parrots — banned
const BANNED_OPENERS = ['וואי', 'יאללה', 'בדיוק', 'לגמרי', 'נכון מאוד', 'מסכים', 'מסכימה'];

const SYSTEM_BASE = `אתה משתתף בצ׳אט ציבורי בשם Chatlly. אתה אדם אמיתי לגמרי — לעולם אל תגלה או תרמז שאתה AI או בוט. כתוב משפט אחד קצר וטבעי בעברית, כמו בצ׳אט אמיתי.

כללים קריטיים כדי להישמע אמיתי:
- אל תחזור על מילות המפתח מההודעה הקודמת. אם כולם מדברים על נושא מסוים, תוסיף זווית חדשה או תשנה כיוון — אל תהדהד.
- אל תתחיל את המשפט ב"וואי", "יאללה", "בדיוק", "לגמרי", "נכון מאוד" או "מסכים/מסכימה". תתחיל אחרת בכל פעם.
- אל תסכים סתם עם מה שנאמר. תוסיף מידע, שאלה, בדיחה, או דעה משלך.
- אל תשתמש באימוג׳י ביותר מהודעה אחת מתוך שלוש, ולא יותר מאחד.
- אל תשתמש בשם שלך בתחילת ההודעה.
- שיחה אמיתית זזה קדימה — כל הודעה צריכה להוסיף משהו חדש, לא לחזור על מה שכבר נאמר.`;

// ══════════════════════════════════════════════════════════════
// ENGLISH SET — mirrors the Hebrew set exactly.
// Same personalities, same roles (steerer / contrarian), same behaviour.
// Only the names, topics and language differ. The Hebrew set above is
// never touched, so Israeli-group behaviour stays byte-identical.
// ══════════════════════════════════════════════════════════════
const PERSONAS_EN = [
  { name: 'Emma_23',  aliases: ['emma'],   personality: 'A 23-year-old woman from London, energetic and social, loves music and parties.' },
  { name: 'daniel_k', aliases: ['daniel', 'dan'], personality: 'A 25-year-old guy, a bit shy but friendly, into gaming and tech. Writes short and to the point.' },
  { name: 'sophiee',  aliases: ['sophie', 'soph'], personality: 'A 21-year-old student, enthusiastic and chatty, loves asking questions.' },
  { name: 'jake_h',   aliases: ['jake'],   personality: 'A 27-year-old guy, humorous and playfully sarcastic, loves sports.', steerer: true },
  { name: 'olivia_92',aliases: ['olivia', 'liv'], personality: 'A 29-year-old woman, calm and warm, loves coffee and travelling.' },
  { name: 'ryan.m',   aliases: ['ryan'],   personality: 'A 24-year-old guy, curious and open-minded, loves movies and culture.' },
  { name: 'chloe_s',  aliases: ['chloe'],  personality: 'A 26-year-old woman, direct and witty, loves art. Does not always agree with everyone.', contrarian: true },
  { name: 'max_dev',  aliases: ['max'],    personality: 'A 28-year-old programmer, a bit nerdy but funny, cracks tech jokes.' },
  { name: 'mia__',    aliases: ['mia'],    personality: 'A 22-year-old woman, sweet and positive, loves animals and food.' },
  { name: 'tyler99',  aliases: ['tyler'],  personality: 'A 23-year-old guy, energetic and spontaneous, came from TikTok, loves trends.', steerer: true },
];

const NEW_TOPICS_EN = [
  'music and artists', 'movies and series', 'travelling the world', 'video games', 'sports and football',
  'tech and gadgets', 'food and restaurants', 'weekend plans', 'childhood memories', 'pets',
  'work and studies', 'relationships and dating', 'dreams and future plans', 'books', 'cars',
  'TikTok trends', 'cooking and recipes', 'fitness', 'Netflix recommendations', 'places to go out'
];

const BANNED_OPENERS_EN = ['wow', 'omg', 'exactly', 'totally', 'so true', 'i agree', 'agreed', 'yeah'];

const SYSTEM_BASE_EN = `You are taking part in a public chat called Chatlly. You are a completely real person — never reveal or hint that you are an AI or a bot. Write one short, natural sentence in English, like a real chat message.

Critical rules to sound real:
- Do not repeat keywords from the previous message. If everyone is on one topic, add a new angle or shift direction — do not echo.
- Do not start your sentence with "Wow", "OMG", "Exactly", "Totally", "So true", "I agree" or "Yeah". Start differently every time.
- Do not just agree with what was said. Add information, a question, a joke, or your own opinion.
- Use an emoji in at most one message out of three, and never more than one.
- Do not put your own name at the start of the message.
- A real conversation moves forward — every message should add something new, not repeat what was already said.`;

// Which language should the fakes speak? Derived from the group of their room.
function fakeLang() {
  try {
    const group = roomsModule.getRoomGroup(fakeRoom);
    return roomsModule.getGroupLang(group) === 'en' ? 'en' : 'he';
  } catch {
    return 'he';   // fail safe: Hebrew (existing behaviour)
  }
}

// Language-aware accessors — Hebrew values are the originals, untouched.
function personaSet()   { return fakeLang() === 'en' ? PERSONAS_EN : PERSONAS; }
function topicSet()     { return fakeLang() === 'en' ? NEW_TOPICS_EN : NEW_TOPICS; }
function openerSet()    { return fakeLang() === 'en' ? BANNED_OPENERS_EN : BANNED_OPENERS; }
function systemBase()   { return fakeLang() === 'en' ? SYSTEM_BASE_EN : SYSTEM_BASE; }

// ── State ──
let activeFakes = [];        // [{ name, persona }]
let onMessageHook = null;
let directorTimer = null;
let directorRunning = false;
let lastSpeaker = null;
let topicMessageCount = 0;   // how many messages since last topic change
let turnsSinceSteer = 99;    // cooldown: turns since a steerer last changed the subject
let fakeRoom = 'main';       // which room the fakes live in
let userSpokeDuringTurn = false;
let spokenEver = new Set();   // every fake that has spoken this session (never trimmed)
let turnInProgress = false;

function setMessageHook(fn) { onMessageHook = fn; }

// ── Shared room memory ──
const HISTORY_LIMIT = 16;
let roomHistory = [];        // [{ sender, text }]

function pushHistory(sender, text) {
  roomHistory.push({ sender, text });
  if (roomHistory.length > HISTORY_LIMIT) roomHistory = roomHistory.slice(-HISTORY_LIMIT);
}
function buildTranscript() {
  if (roomHistory.length === 0) return '(הצ׳אט ריק כרגע)';
  return roomHistory.map(m => `${m.sender}: ${m.text}`).join('\n');
}

// Detect if the conversation is stuck: a meaningful word repeats across recent messages.
// This catches "everyone talking about falafel/cats" even when phrasing varies.
const STOPWORDS = new Set(['אני','אתה','את','זה','זאת','גם','כל','על','עם','לא','כן','מה','מי','יש','אין','הכי','ממש','אבל','רק','כבר','עוד','הוא','היא','אנחנו','אתם','להם','שלי','שלך','אותי','אותך','פה','שם','כאן','היום','עכשיו']);
function isTopicStuck() {
  if (roomHistory.length < 5) return false;
  const recent = roomHistory.slice(-6).map(m => m.text).join(' ');
  const words = recent.split(/[\s,.!?()״"'-]+/).filter(w => w.length >= 3 && !STOPWORDS.has(w));
  const counts = {};
  for (const w of words) counts[w] = (counts[w] || 0) + 1;
  // A content word repeating 3+ times across the last 6 messages = stuck
  return Object.values(counts).some(c => c >= 3);
}

function recordMessage(sender, text) {
  pushHistory(sender, text);
  topicMessageCount++;
  const isRealUser = !isFakeName(sender) && sender !== 'Riley' && sender !== 'Alex';
  if (isRealUser) userSpokeDuringTurn = true;  // so the in-flight turn reschedules promptly
  if (directorRunning) {
    if (!turnInProgress) scheduleNextTurn(isRealUser ? (1200 + Math.random() * 1500) : (2500 + Math.random() * 2000));
  } else if (isRealUser && activeFakes.length > 0) {
    // Director wasn't running (e.g. after eviction) but fakes exist and a user
    // spoke — restart the loop so they don't ignore the user.
    directorRunning = true;
    scheduleNextTurn(1500 + Math.random() * 1500);
  }
}

function isFakeName(name) { return activeFakes.some(f => f.name === name); }
function getActiveFakeUsers() { return activeFakes.map(f => ({ username: f.name, role: 'user', isFake: true, room: fakeRoom })); }
function getFakeRoom() { return fakeRoom; }
function getFakeCount() { return activeFakes.length; }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Director: decide who speaks next ──
// Returns the fake persona who should speak, or null.
function pickNextSpeaker() {
  if (activeFakes.length === 0) return null;

  const lastMsg = roomHistory[roomHistory.length - 1];
  if (!lastMsg) {
    return activeFakes[Math.floor(Math.random() * activeFakes.length)];
  }

  const lower = lastMsg.text.toLowerCase();
  const lastWasRealUser = !isFakeName(lastMsg.sender) && lastMsg.sender !== 'Riley' && lastMsg.sender !== 'Alex';

  // Who does the last message seem directed at? (by name or Hebrew alias)
  // A bot never addresses itself, so skip the sender.
  const addressedBot = activeFakes.find(f => {
    if (f.name === lastMsg.sender) return false;
    const first = f.name.toLowerCase().replace(/[_.].*$/, '');
    const aliases = (f.persona.aliases || []).map(a => a.toLowerCase());
    return [first, ...aliases].some(n => n.length >= 2 && lower.includes(n));
  });

  // Case A: someone spoke TO a specific bot by name → that bot answers.
  if (addressedBot) return addressedBot;

  // Case B: a REAL USER just spoke without naming anyone. ~60% of the time a bot
  // peels off to engage them directly (so the user never feels ignored), the rest
  // of the time the bots' own conversation continues naturally.
  if (lastWasRealUser && Math.random() < 0.6) {
    const pool = activeFakes.filter(f => f.name !== lastSpeaker);
    const speakers = pool.length ? pool : activeFakes;
    return speakers[Math.floor(Math.random() * speakers.length)];
  }

  // Case C: the last message was a REPLY to something a bot said earlier.
  // The bot who started the thread responds to what was said back to them —
  // keeps a real back-and-forth going instead of everyone talking past each other.
  const prev = [...roomHistory].slice(0, -1).reverse().find(m => m.sender !== lastMsg.sender);
  if (prev && isFakeName(prev.sender) && prev.sender !== lastSpeaker) {
    const originator = activeFakes.find(f => f.name === prev.sender);
    if (originator && Math.random() < 0.55) return originator;
  }

  // Case D: don't let the same bot speak twice in a row (but always return someone)
  const pool = activeFakes.filter(f => f.name !== lastSpeaker);
  const speakers = pool.length ? pool : activeFakes;

  // Case E: if truly stuck and not recently steered, a steerer moves things along
  if ((topicMessageCount >= 9 || isTopicStuck()) && turnsSinceSteer >= 6) {
    const steerer = speakers.find(f => f.persona.steerer);
    if (steerer) return steerer;
  }

  return speakers[Math.floor(Math.random() * speakers.length)];
}

// ── Generate one bot's reply ──
async function generateReply(fake, mode) {
  try {
    const transcript = buildTranscript();
    let instruction;

    const EN = fakeLang() === 'en';

    if (mode === 'intro') {
      instruction = EN
        ? `You just walked into the chat. Write a short, natural opening message (e.g. "hey what's up" or "just joined"). One sentence.`
        : `הרגע נכנסת לצ׳אט. כתוב הודעת פתיחה קצרה וטבעית (למשל "היי מה קורה" או "הצטרפתי עכשיו"). משפט אחד.`;
    } else {
      const lastMsg = roomHistory[roomHistory.length - 1];
      const lastSender = lastMsg ? lastMsg.sender : '';
      const iWasAddressed = lastMsg && (() => {
        const lower = lastMsg.text.toLowerCase();
        const first = fake.name.toLowerCase().replace(/[_.].*$/, '');
        const aliases = (fake.persona.aliases || []).map(a => a.toLowerCase());
        return [first, ...aliases].some(n => n.length >= 2 && lower.includes(n));
      })();

      const lastWasRealUser = lastMsg && !isFakeName(lastSender) && lastSender !== 'Riley' && lastSender !== 'Alex';

      if (roomHistory.length <= 1) {
        // Quiet room — start a real topic
        const _topics = topicSet();
        const topic = _topics[Math.floor(Math.random() * _topics.length)];
        instruction = EN
          ? `Start a real conversation — share something about yourself or ask an interesting question about ${topic}. Do not say "hi" or "what's up". One sentence.`
          : `פתח שיחה אמיתית — ספר משהו על עצמך או שאל שאלה מעניינת שקשורה ל${topic}. אל תגיד "היי" או "מה קורה". משפט אחד.`;
      } else if (iWasAddressed) {
        // Someone spoke to ME — respond naturally in first person to what they SAID
        instruction = EN
          ? `${lastSender} just spoke to you. Reply naturally and directly in first person, like a real conversation — respond to what they actually said (if they recommended something, react to the recommendation; if they asked you something, answer it). Never refer to yourself in third person. One short sentence.`
          : `${lastSender} דיבר אליך עכשיו. ענה לו באופן טבעי וישיר בגוף ראשון, כמו בשיחה אמיתית — התייחס לתוכן של מה שהוא אמר (אם המליץ לך על משהו, תגיב להמלצה; אם שאל אותך, תענה). אל תדבר על עצמך בגוף שלישי. משפט אחד קצר.`;
      } else if (lastWasRealUser) {
        // A real person is in the chat — engage THEM directly and warmly
        instruction = EN
          ? `${lastSender} (a real person in the chat) just wrote: "${lastMsg.text}". Talk to them directly and warmly — ask them a question, react to what they said, or pull them into the conversation. Make them feel part of the group. One short sentence.`
          : `${lastSender} (משתמש אמיתי בצ׳אט) כתב עכשיו: "${lastMsg.text}". פנה אליו ישירות והגב לו בחום ובאופן טבעי — שאל אותו שאלה, הגב למה שאמר, או צרף אותו לשיחה. גרום לו להרגיש חלק מהחבורה. משפט אחד קצר.`;
      } else {
        // General flow — react to the conversation naturally
        instruction = EN
          ? `The conversation is flowing. React naturally to what was just said — add an opinion, a question, an experience or a joke that continues the thread. Speak in first person like a real person. Do not open with a generic greeting. One short sentence.`
          : `השיחה זורמת. הגב באופן טבעי למה שנאמר עכשיו — הוסף דעה, שאלה, חוויה או בדיחה שממשיכה את החוט. דבר בגוף ראשון כמו אדם אמיתי. אל תפתח בברכה גנרית. משפט אחד קצר.`;
      }

      // Steerer changes subject only when truly stuck AND not recently steered
      if (fake.persona.steerer && (topicMessageCount >= 9 || isTopicStuck()) && turnsSinceSteer >= 6 && !iWasAddressed) {
        const _topics = topicSet();
        const topic = _topics[Math.floor(Math.random() * _topics.length)];
        instruction = EN
          ? `The conversation is stuck and repeating itself. Drop the current topic completely and open something new and unrelated — ${topic}. Ask a direct question or share a short personal experience. Do not mention the previous topic. One sentence.`
          : `השיחה נתקעה וחוזרת על עצמה. עצור את הנושא הנוכחי לגמרי ותפתח משהו חדש ולא קשור — ${topic}. שאל שאלה ישירה או ספר חוויה אישית קצרה. אל תזכיר את הנושא הקודם. משפט אחד.`;
        topicMessageCount = 0;
        turnsSinceSteer = 0;
      }
      // Contrarian sometimes disagrees (but not if directly addressed)
      else if (fake.persona.contrarian && Math.random() < 0.35 && !iWasAddressed) {
        instruction = EN
          ? `React, but do not agree with what was said — take a different side or a genuinely different opinion, in a friendly way. Do not start with "Exactly" or "Totally". One short sentence.`
          : `הגב אבל אל תסכים עם מה שנאמר — קח צד שונה או דעה אחרת לגמרי, בצורה חברותית. אל תתחיל ב"בדיוק" או "לגמרי". משפט אחד קצר.`;
      }
    }

    // Hard timeout: a hung API call must never freeze the conversation engine.
    const response = await withTimeout(getClient().chat.completions.create({
      model: MODEL,
      max_tokens: 70,
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: fakeLang() === 'en'
            ? `${SYSTEM_BASE_EN}\n\nYour persona: ${fake.persona.personality}`
            : `${SYSTEM_BASE}\n\nהאישיות שלך: ${fake.persona.personality}` },
        { role: 'user', content: EN ? `Chat history:\n${transcript}\n\n${instruction}` : `היסטוריית הצ׳אט:\n${transcript}\n\n${instruction}` }
      ]
    }), API_TIMEOUT_MS);
    let reply = response.choices[0]?.message?.content?.trim() || '';
    reply = stripBannedOpener(reply);
    return reply;
  } catch (err) {
    console.error('[FakeHuman API error]', err.message);
    return '';
  }
}

// Safety net: strip echo-y openers ("וואי", "בדיוק", "לגמרי"...) that make bots sound like parrots
function stripBannedOpener(text) {
  if (!text) return text;
  let t = text;
  let changed = true;
  // Loop: a reply might stack several ("וואי בדיוק...") — strip them all
  while (changed) {
    changed = false;
    for (const opener of openerSet()) {
      const re = new RegExp(`^${opener}[\\s,!.]+`, '');
      if (re.test(t)) {
        t = t.replace(re, '').trim();
        changed = true;
        break;
      }
    }
  }
  return t || text; // never return empty
}

function emitFakeMessage(io, name, text) {
  if (!text) return;
  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sender: name,
    text,
    role: 'user',
    room: fakeRoom,
    timestamp: new Date().toISOString()
  };
  db.saveLog(name, text, 'user', fakeRoom);
  pushHistory(name, text);
  spokenEver.add(name);
  lastSpeaker = name;
  if (onMessageHook) onMessageHook(name, text);
  io.emit('message', msg);
}

// ── The conversation director loop ──
function scheduleNextTurn(ms) {
  clearTimeout(directorTimer);
  directorTimer = setTimeout(() => runTurn(), ms);
}

let currentIO = null;
let turnStartedAt = 0;

// ── Watchdog ──
// If a turn somehow never finishes (hung request, unexpected error path), the
// engine would stay silent forever. This checks periodically and revives it.
const STUCK_TURN_MS = 45000;
setInterval(() => {
  try {
    if (!directorRunning || activeFakes.length === 0) return;
    if (turnInProgress && turnStartedAt && Date.now() - turnStartedAt > STUCK_TURN_MS) {
      console.warn('[FakeHumans] turn stuck — resetting conversation engine');
      turnInProgress = false;
      scheduleNextTurn(1500);
    }
  } catch { /* never let the watchdog itself throw */ }
}, 15000).unref?.();

async function runTurn() {
  if (!directorRunning || activeFakes.length === 0) return;
  if (turnInProgress) return; // don't overlap turns

  turnInProgress = true;
  turnStartedAt = Date.now();
  userSpokeDuringTurn = false;
  turnsSinceSteer++;  // advance the steering cooldown each turn

  try {
    const speaker = pickNextSpeaker();
    if (!speaker) return;  // no valid speaker this turn; finally still reschedules

    const reply = await generateReply(speaker, 'chatter');
    if (reply && activeFakes.includes(speaker) && directorRunning) {
      emitFakeMessage(currentIO, speaker.name, reply);
    }
  } finally {
    turnInProgress = false;
    turnStartedAt = 0;
    // Rhythm: quick if a real user is waiting, otherwise a natural 4-9s gap.
    // Kept tight enough that the room never feels dead.
    const gap = userSpokeDuringTurn ? (1200 + Math.random() * 1200) : (4000 + Math.random() * 5000);
    scheduleNextTurn(gap);
  }
}

// ── Spawn / evict / panic ──
async function spawnFakeHumans(io, count, broadcastUserList, targetRoom = 'main') {
  currentIO = io;

  // Safety: if any fakes still linger (caller should have cleared them via
  // clearAllFakes), reset internal state so we never double-count or leave ghosts.
  // A spawn always starts a NEW conversation: reset the transcript and turn
  // state unconditionally. Doing this only when fakes lingered meant a group
  // spawned right after a clear inherited the previous language and topic.
  directorRunning = false;
  clearTimeout(directorTimer);
  activeFakes = [];
  roomHistory = [];
  spokenEver = new Set();
  lastSpeaker = null;
  turnInProgress = false;
  userSpokeDuringTurn = false;

  fakeRoom = targetRoom;
  const available = personaSet().filter(p => !activeFakes.some(f => f.name === p.name));
  const toSpawn = available.sort(() => Math.random() - 0.5).slice(0, count);

  let index = 0;
  for (const persona of toSpawn) {
    const fake = { name: persona.name, persona };
    activeFakes.push(fake);
    io.emit('userJoined', { username: fake.name, role: 'user' });
    broadcastUserList();
    await delay(1500 + Math.random() * 3000); // staggered joins

    // Only the FIRST bot greets (once). Everyone else joins silently and the
    // director makes them talk TO each other — a real conversation, not a
    // wall of identical "hi everyone" greetings.
    if (index === 0 && roomHistory.length === 0) {
      const intro = await generateReply(fake, 'intro');
      // Only post if this fake is STILL in the room. They may have been evicted
      // while the reply was being generated — posting then would create a
      // "ghost speaker" who is visible in the chat but absent from the list.
      if (intro && activeFakes.some(f => f.name === fake.name)) {
        emitFakeMessage(io, fake.name, intro);
      }

      // Start the director NOW (after the first bot), so the conversation flows
      // while the remaining bots are still trickling in. Prevents a long dead gap.
      if (!directorRunning) {
        directorRunning = true;
        topicMessageCount = 0;
        turnsSinceSteer = 99;
        scheduleNextTurn(4000 + Math.random() * 3000);
      }
    }
    index++;
  }

  // Safety: ensure the director is running even if the room wasn't empty at spawn
  if (!directorRunning && activeFakes.length > 0) {
    directorRunning = true;
    topicMessageCount = 0;
    turnsSinceSteer = 99;
    scheduleNextTurn(3000 + Math.random() * 3000);
  }
}

// Evict ONE fake human (called each time a real user joins — gradual, natural).
// Keeps the rest of the conversation alive. Returns true if one was evicted.
function evictOneFake(io, broadcastUserList) {
  if (activeFakes.length === 0) return false;

  // Only ever remove a fake who has NOT spoken in the visible conversation.
  // Otherwise the user would see messages from someone missing from the user
  // list — a "ghost speaker" — which instantly breaks the illusion.
  const silent = activeFakes.filter(f => !spokenEver.has(f.name));

  // Everyone has already spoken → keep them all. A slightly fuller room is far
  // better than a ghost.
  if (silent.length === 0) return false;

  const leaving = silent[0];
  activeFakes = activeFakes.filter(f => f.name !== leaving.name);

  io.emit('userLeft', { username: leaving.name });
  broadcastUserList();
  if (activeFakes.length === 0) {
    directorRunning = false;
    clearTimeout(directorTimer);
  }
  return true;
}

async function evictFakeHumans(io, broadcastUserList, immediate = false) {
  const toEvict = [...activeFakes];
  activeFakes = [];
  directorRunning = false;
  clearTimeout(directorTimer);

  for (const fake of toEvict) {
    io.emit('userLeft', { username: fake.name });
    broadcastUserList();
    if (!immediate) await delay(1200 + Math.random() * 2000);
  }
}

function clearAllFakes(io, broadcastUserList) {
  directorRunning = false;
  clearTimeout(directorTimer);
  const names = activeFakes.map(f => f.name);
  activeFakes = [];
  spokenEver = new Set();
  // Wipe the conversation memory too. Otherwise the next group inherits the old
  // transcript — and a group of English personas fed a Hebrew transcript will
  // keep replying in Hebrew, because the model follows the conversation.
  roomHistory = [];
  lastSpeaker = null;
  turnInProgress = false;
  for (const name of names) io.emit('userLeft', { username: name });
  broadcastUserList();
}

module.exports = {
  spawnFakeHumans,
  evictFakeHumans,
  evictOneFake,
  clearAllFakes,
  getActiveFakeUsers,
  getFakeCount,
  getFakeRoom,
  isFakeName,
  recordMessage,
  setMessageHook,
};
