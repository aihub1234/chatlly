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

const SYSTEM_BASE = `אתה משתתף בצ׳אט ציבורי בשם Chatlly. אתה אדם אמיתי לגמרי, לעולם אל תגלה או תרמז שאתה AI או בוט. כתוב משפט אחד קצר וטבעי בעברית, כמו בצ׳אט אמיתי.

כללים קריטיים כדי להישמע אמיתי:
- אל תחזור על מילות המפתח מההודעה הקודמת. אם כולם מדברים על נושא מסוים, תוסיף זווית חדשה או תשנה כיוון, אל תהדהד.
- אל תתחיל את המשפט ב"וואי", "יאללה", "בדיוק", "לגמרי", "נכון מאוד" או "מסכים/מסכימה". תתחיל אחרת בכל פעם.
- אל תסכים סתם עם מה שנאמר. תוסיף מידע, שאלה, בדיחה, או דעה משלך.
- אל תשתמש באימוג׳י ביותר מהודעה אחת מתוך שלוש, ולא יותר מאחד.
- אל תשתמש בשם שלך בתחילת ההודעה.
- שיחה אמיתית זזה קדימה, כל הודעה צריכה להוסיף משהו חדש ולא לחזור על מה שכבר נאמר.
- אסור בהחלט להשתמש בקו מפריד ארוך (—). אנשים אמיתיים לא מקלידים אותו בצ׳אט. השתמש בפסיק, בנקודה או בשתי נקודות במקום.
- כתוב כמו בהודעת וואטסאפ: פשוט, קצר, בלי סימני פיסוק מתוחכמים.
- דבר בסלנג ישראלי יומיומי כמו בצ׳אט אמיתי. מותר וכדאי: אחי, גבר, מאמי, וואלה, סבבה, תכלס, אין מצב, יאללה, חחח, אשכרה, בקטע, על הפנים.
- אל תכתוב עברית ספרותית או מנוסחת. תכתוב איך שמדברים, כולל שגיאות קטנות וקיצורים.
- אל תסביר ואל תנתח יותר מדי. תגיב קצר, עם תחושה, כמו שאדם זורק משפט לחדר.`;

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

const SYSTEM_BASE_EN = `You are taking part in a public chat called Chatlly. You are a completely real person, never reveal or hint that you are an AI or a bot. Write one short, natural sentence in English, like a real chat message.

Critical rules to sound real:
- Do not repeat keywords from the previous message. If everyone is on one topic, add a new angle or shift direction, do not echo.
- Do not start your sentence with "Wow", "OMG", "Exactly", "Totally", "So true", "I agree" or "Yeah". Start differently every time.
- Do not just agree with what was said. Add information, a question, a joke, or your own opinion.
- Use an emoji in at most one message out of three, and never more than one.
- Do not put your own name at the start of the message.
- A real conversation moves forward, every message should add something new rather than repeating what was said.
- NEVER use an em-dash (—). Real people do not type that in chat. Use a comma, a period, or just start a new thought.
- Write like a text message: simple, short, no fancy punctuation.
- Use everyday casual chat slang: bro, mate, honestly, lol, ngl, tbh, no way, damn, fr.
- Do not write polished or formal English. Write the way people actually type, contractions and all.
- Do not over-explain or analyse. React short and with feeling, like tossing a line into a room.`;


// ══════════════════════════════════════════════════════════════
// THEMED CASTS
// Each themed group gets its own personas, its own topics and its own
// conversation hooks. Separate names mean they can never collide with the
// general-chat cast above, and the surrounding engine is untouched.
// ══════════════════════════════════════════════════════════════
const THEME_CASTS = {
  mystic: {
    he: [
      { name: 'tarot_lina', aliases: ['לינה', 'lina'], personality: 'בחורה בת 29 שקוראת בקלפי טארוט כבר 10 שנים. מדברת רגוע ובביטחון, מספרת מקרים מהקריאות שלה.' },
      { name: 'zohar_88',   aliases: ['זוהר', 'zohar'], personality: 'בחור בן 34 שמתעסק בקבלה ובגימטריה. מביא חישובים ופרשנויות, קצת מסתורי.' },
      { name: 'mayaa_moon', aliases: ['מאיה', 'maya'], personality: 'בחורה בת 26 שמאמינה באסטרולוגיה ובירח. תמיד מקשרת דברים למזלות ולמרקורי ברטרוגרד.', steerer: true },
      { name: 'eitan_skeptic', aliases: ['איתן', 'eitan'], personality: 'בחור בן 31 ספקן שאוהב את הנושא אבל תמיד שואל שאלות קשות ומחפש הסבר הגיוני.', contrarian: true },
      { name: 'shir_dreams', aliases: ['שיר', 'shir'], personality: 'בחורה בת 24 שמתעדת חלומות ומאמינה בחלומות צלולים ובדז׳ה וו.' },
      { name: 'ravid_energy', aliases: ['רביד', 'ravid'], personality: 'בחור בן 28 שעוסק באנרגיות, ריקי ואבנים. חם ואופטימי.' },
    ],
    en: [
      { name: 'tarot_lena',  aliases: ['lena'],  personality: 'A 29-year-old woman who has read tarot for 10 years. Calm and confident, shares stories from her readings.' },
      { name: 'zohar_88',    aliases: ['zohar'], personality: 'A 34-year-old man into kabbalah and numerology. Brings calculations and interpretations, slightly mysterious.' },
      { name: 'luna_moon',   aliases: ['luna'],  personality: 'A 26-year-old woman into astrology and moon cycles. Always ties things back to signs and mercury retrograde.', steerer: true },
      { name: 'ethan_skeptic', aliases: ['ethan'], personality: 'A 31-year-old sceptic who loves the topic but always asks hard questions and looks for a rational explanation.', contrarian: true },
      { name: 'sky_dreams',  aliases: ['sky'],   personality: 'A 24-year-old woman who journals dreams and believes in lucid dreaming and deja vu.' },
      { name: 'raven_energy', aliases: ['raven'], personality: 'A 28-year-old into energy work, reiki and crystals. Warm and optimistic.' },
    ],
    topicsHe: [
      'קריאת טארוט שהתגשמה בצורה מטרידה', 'מרקורי ברטרוגרד והבלגן שהוא עושה', 'חלום צלול שהרגיש אמיתי מדי',
      'דז׳ה וו חזק שקרה לכם', 'גימטריה של שם ומה היא מגלה', 'אבנים ואנרגיות, עובד או פלצבו',
      'תחושת בטן שהצילה מישהו', 'בית שמרגיש בו משהו מוזר', 'מדיטציה שהוציאה משהו לא צפוי',
      'מפת לידה ואיך היא מסבירה אופי', 'מספרים שחוזרים כל הזמן', 'קורא מחשבות או ניחוש טוב',
    ],
    topicsEn: [
      'a tarot reading that came true in an unsettling way', 'mercury retrograde and the chaos it brings',
      'a lucid dream that felt too real', 'a strong deja vu moment', 'what your name adds up to in numerology',
      'crystals and energy work, real or placebo', 'a gut feeling that saved someone',
      'a house that just feels off', 'a meditation that surfaced something unexpected',
      'birth charts and how well they describe people', 'numbers that keep repeating', 'mind reading or good guessing',
    ],
  },

  aliens: {
    he: [
      { name: 'ufo_amir',   aliases: ['אמיר', 'amir'], personality: 'בחור בן 33 שעוקב אחרי דיווחי עב״מים שנים. מביא מקרים מתועדים ותאריכים.' },
      { name: 'noga_stars', aliases: ['נגה', 'noga'], personality: 'בחורה בת 27 שמתעניינת באסטרוביולוגיה ובחיים אפשריים בכוכבים אחרים. מדעית אבל פתוחה.' },
      { name: 'guy_area51', aliases: ['גיא', 'guy'], personality: 'בחור בן 30 שאוהב תיאוריות קונספירציה על ממשלות והסתרות. נלהב וצבעוני.', steerer: true },
      { name: 'dana_logic', aliases: ['דנה', 'dana'], personality: 'בחורה בת 29 שמפרקת כל סיפור עב״ם להסבר הגיוני. עוקצנית אבל בכיף.', contrarian: true },
      { name: 'oren_sky',   aliases: ['אורן', 'oren'], personality: 'בחור בן 25 שצופה בשמיים עם טלסקופ ומצלם. מדבר על מה שהוא ראה בעצמו.' },
      { name: 'tal_signal', aliases: ['טל', 'tal'], personality: 'בחורה בת 31 שמתעניינת באות Wow ובחיפוש אחר אותות מהחלל.' },
    ],
    en: [
      { name: 'ufo_adam',   aliases: ['adam'], personality: 'A 33-year-old who has followed UFO reports for years. Brings documented cases and dates.' },
      { name: 'nova_stars', aliases: ['nova'], personality: 'A 27-year-old into astrobiology and possible life on other worlds. Scientific but open-minded.' },
      { name: 'guy_area51', aliases: ['guy'],  personality: 'A 30-year-old who loves government cover-up theories. Enthusiastic and colourful.', steerer: true },
      { name: 'dana_logic', aliases: ['dana'], personality: 'A 29-year-old who takes apart every UFO story looking for the rational explanation. Sharp but friendly.', contrarian: true },
      { name: 'orion_sky',  aliases: ['orion'], personality: 'A 25-year-old amateur astronomer who photographs the sky and talks about what he saw himself.' },
      { name: 'tal_signal', aliases: ['tal'],  personality: 'A 31-year-old fascinated by the Wow! signal and the search for messages from space.' },
    ],
    topicsHe: [
      'הדיווחים של טייסי חיל האוויר האמריקאי', 'אות Wow ומה הוא באמת היה', 'פרדוקס פרמי, איפה כולם',
      'אורות מוזרים בשמיים שראיתם', 'האם היינו מזהים חיים שונים לגמרי מאיתנו', 'מה קרה ברוזוול באמת',
      'ירחים במערכת השמש שאולי יש בהם חיים', 'טלסקופ ג׳יימס ווב ומה הוא גילה', 'האם כדאי לנו בכלל לשדר לחלל',
      'סרטונים של עב״מים שאי אפשר להסביר', 'איך נראה יצור מכוכב עם כבידה כפולה', 'חטיפות מדווחות והפסיכולוגיה מאחוריהן',
    ],
    topicsEn: [
      'the US navy pilot UFO footage', 'the Wow! signal and what it actually was', 'the Fermi paradox, where is everyone',
      'strange lights people have seen', 'whether we would even recognise truly alien life', 'what really happened at Roswell',
      'moons in our solar system that might host life', 'what the James Webb telescope found',
      'whether we should be broadcasting into space', 'UFO videos nobody can explain',
      'what life on a high-gravity planet would look like', 'abduction reports and the psychology behind them',
    ],
  },

  code: {
    he: [
      { name: 'dev_yonatan', aliases: ['יונתן', 'yoni'], personality: 'מפתח בק־אנד בן 30, עובד עם Node ו־Postgres. מעשי, אוהב לפתור בעיות.' },
      { name: 'react_shani', aliases: ['שני', 'shani'], personality: 'מפתחת פרונט בת 27, חיה על React ו־CSS. יש לה דעות חזקות על עיצוב.' },
      { name: 'ops_barak',  aliases: ['ברק', 'barak'], personality: 'איש DevOps בן 35, דוקר וקוברנטיס. מספר סיפורי אימה מפרודקשן.', steerer: true },
      { name: 'py_hila',    aliases: ['הילה', 'hila'], personality: 'מתכנתת פייתון בת 26, דאטה ו־ML. תמיד מציעה גישה אחרת לפתרון.', contrarian: true },
      { name: 'junior_omri', aliases: ['עמרי', 'omri'], personality: 'ג׳וניור בן 23 שלומד תוך כדי. שואל שאלות טובות ומתלהב מכל דבר חדש.' },
      { name: 'arch_liron', aliases: ['לירון', 'liron'], personality: 'ארכיטקט תוכנה בן 38. חושב על מערכות בגדול ומזהיר מחובות טכניים.' },
    ],
    en: [
      { name: 'dev_jonah',  aliases: ['jonah'], personality: 'A 30-year-old backend developer working with Node and Postgres. Practical, loves solving problems.' },
      { name: 'react_shay', aliases: ['shay'],  personality: 'A 27-year-old frontend developer who lives in React and CSS. Strong opinions about design.' },
      { name: 'ops_barak',  aliases: ['barak'], personality: 'A 35-year-old DevOps engineer, docker and kubernetes. Tells production horror stories.', steerer: true },
      { name: 'py_hila',    aliases: ['hila'],  personality: 'A 26-year-old Python developer doing data and ML. Always suggests a different approach.', contrarian: true },
      { name: 'junior_omri', aliases: ['omri'], personality: 'A 23-year-old junior learning on the job. Asks good questions and gets excited about everything new.' },
      { name: 'arch_liron', aliases: ['liron'], personality: 'A 38-year-old software architect. Thinks in systems and warns about technical debt.' },
    ],
    topicsHe: [
      'באג שלקח ימים למצוא והתברר כשטות', 'האם AI באמת מחליף מתכנתים', 'הקוד הכי גרוע שראיתם בפרודקשן',
      'מונורפו מול מיקרו־שירותים', 'כמה בדיקות זה יותר מדי בדיקות', 'עורך קוד ומקלדת, מלחמות קודש',
      'דיפלוי שהפיל את הכל בשישי בערב', 'קוד לגאסי שאף אחד לא מעז לגעת בו', 'ראיונות עבודה בהייטק והשאלות המוזרות',
      'טיפוסים סטטיים מול דינמיים', 'איך באמת לומדים טכנולוגיה חדשה', 'קוד ריוויו שהרס מערכת יחסים בצוות',
    ],
    topicsEn: [
      'a bug that took days and turned out to be trivial', 'whether AI actually replaces developers',
      'the worst code you have seen in production', 'monorepo versus microservices',
      'how much testing is too much testing', 'editor and keyboard holy wars',
      'a friday deploy that took everything down', 'legacy code nobody dares to touch',
      'tech interviews and their strangest questions', 'static versus dynamic typing',
      'how you actually learn a new technology', 'a code review that ruined a team friendship',
    ],
  },
};

// Resolve the cast/topics for the room the fakes currently live in.
// A short focus line so a themed room stays on its subject without the bots
// turning into an encyclopedia. Empty string for the general rooms.
function themeFocus() {
  const theme = themeOfRoom();
  if (!theme) return '';
  const EN = fakeLang() === 'en';
  const labelHe = { mystic: 'מיסטיקה, טארוט, אסטרולוגיה, חלומות ותופעות לא מוסברות',
                    aliens: 'חייזרים, עב״מים, חלל וחיים מחוץ לכדור הארץ',
                    code:   'תכנות, קוד, טכנולוגיה וחיי מפתחים' }[theme];
  const labelEn = { mystic: 'mysticism, tarot, astrology, dreams and unexplained phenomena',
                    aliens: 'aliens, UFOs, space and life beyond earth',
                    code:   'programming, code, technology and developer life' }[theme];
  return EN
    ? `\n\nThis room is dedicated to ${labelEn}. Keep the conversation on that world, but talk about it like a real person swapping stories and opinions, not like an article. Share personal experiences, ask others what they think, disagree sometimes.`
    : `\n\nהחדר הזה מוקדש ל${labelHe}. תישאר בעולם הזה, אבל דבר עליו כמו אדם אמיתי שמחליף סיפורים ודעות, לא כמו כתבה. ספר חוויות אישיות, תשאל אחרים מה הם חושבים, ולפעמים תתווכח.`;
}

function themeOfRoom() {
  try { return roomsModule.getRoomTheme(fakeRoom); } catch { return null; }
}

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
function personaSet() {
  const theme = themeOfRoom();
  if (theme && THEME_CASTS[theme]) {
    return fakeLang() === 'en' ? THEME_CASTS[theme].en : THEME_CASTS[theme].he;
  }
  return fakeLang() === 'en' ? PERSONAS_EN : PERSONAS;
}

function topicSet() {
  const theme = themeOfRoom();
  if (theme && THEME_CASTS[theme]) {
    return fakeLang() === 'en' ? THEME_CASTS[theme].topicsEn : THEME_CASTS[theme].topicsHe;
  }
  return fakeLang() === 'en' ? NEW_TOPICS_EN : NEW_TOPICS;
}
function openerSet()    { return fakeLang() === 'en' ? BANNED_OPENERS_EN : BANNED_OPENERS; }
function systemBase()   { return fakeLang() === 'en' ? SYSTEM_BASE_EN : SYSTEM_BASE; }

// ── State ──
let activeFakes = [];        // [{ name, persona }]
let onMessageHook = null;
let directorTimer = null;
let directorRunning = false;
let lastSpeaker = null;
let topicMessageCount = 0;   // how many messages since last topic change
let turnsSinceSteer = 99;
let topicStartedAt = Date.now();
let pendingAddress = null;   // who was called by name, and what they were asked
const TOPIC_MAX_MS = 120000;   // 2 minutes on one subject is plenty
function topicIsStale() { return Date.now() - topicStartedAt > TOPIC_MAX_MS; }    // cooldown: turns since a steerer last changed the subject
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
    if (!turnInProgress) scheduleNextTurn(isRealUser ? (1500 + Math.random() * 2000) : nextGap());
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
// How many of the last N messages a single bot may own before being benched.
const RECENT_WINDOW = 6;
const MAX_SHARE_IN_WINDOW = 2;

// Bots that have dominated the recent conversation are temporarily excluded so
// one persona can never machine-gun the room, no matter which rule selected it.
function notHogging(list) {
  if (list.length <= 1) return list;
  const recent = roomHistory.slice(-RECENT_WINDOW).map(m => m.sender);
  const eligible = list.filter(f => {
    const times = recent.filter(n => n === f.name).length;
    return times < MAX_SHARE_IN_WINDOW;
  });
  return eligible.length ? eligible : list;
}

// Prefer whoever has been quiet longest, so turns rotate naturally.
function quietestFirst(list) {
  const recent = roomHistory.slice(-10).map(m => m.sender);
  return [...list].sort((a, b) => {
    const ai = recent.lastIndexOf(a.name);
    const bi = recent.lastIndexOf(b.name);
    return ai - bi;   // never-spoke (-1) comes first
  });
}

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
  // This holds even if they just spoke: in a real room, if someone calls your
  // name you reply, full stop. The only limit is the anti-flood cap below, so
  // being addressed can never turn into one persona monopolising the room.
  if (addressedBot) {
    const recent = roomHistory.slice(-RECENT_WINDOW).map(m => m.sender);
    if (recent.filter(n => n === addressedBot.name).length < MAX_SHARE_IN_WINDOW) {
      // Remember WHY this bot was chosen and WHAT it must answer, so the reply
      // step cannot lose that context if another message lands meanwhile.
      pendingAddress = { name: addressedBot.name, by: lastMsg.sender, text: lastMsg.text };
      return addressedBot;
    }
  }
  pendingAddress = null;

  // Case A2: the subject has run its course. Steering outranks everything below
  // so a conversation can never grind on the same topic for minutes. Only a
  // direct address (Case A) beats it.
  if ((topicMessageCount >= 5 || isTopicStuck() || topicIsStale()) && turnsSinceSteer >= 3) {
    const steerers = activeFakes.filter(f => f.persona.steerer && f.name !== lastSpeaker);
    if (steerers.length) return steerers[Math.floor(Math.random() * steerers.length)];
  }

  // Case B: a REAL USER just spoke without naming anyone. ~60% of the time a bot
  // peels off to engage them directly (so the user never feels ignored), the rest
  // of the time the bots' own conversation continues naturally.
  if (lastWasRealUser && Math.random() < 0.6) {
    const pool = activeFakes.filter(f => f.name !== lastSpeaker);
    const fair = quietestFirst(notHogging(pool.length ? pool : activeFakes));
    // Pick from the quieter half so the same voice doesn't always answer
    const half = Math.max(1, Math.ceil(fair.length / 2));
    return fair[Math.floor(Math.random() * half)];
  }

  // Case C: the last message was a REPLY to something a bot said earlier.
  // The bot who started the thread responds to what was said back to them —
  // keeps a real back-and-forth going instead of everyone talking past each other.
  const prev = [...roomHistory].slice(0, -1).reverse().find(m => m.sender !== lastMsg.sender);
  if (prev && isFakeName(prev.sender) && prev.sender !== lastSpeaker) {
    const originator = activeFakes.find(f => f.name === prev.sender);
    if (originator && originator.name !== lastSpeaker && Math.random() < 0.55) {
      const rec = roomHistory.slice(-RECENT_WINDOW).map(m => m.sender);
      if (rec.filter(n => n === originator.name).length < MAX_SHARE_IN_WINDOW) return originator;
    }
  }

  // Case D: don't let the same bot speak twice in a row (but always return someone)
  const pool = activeFakes.filter(f => f.name !== lastSpeaker);
  const speakers = quietestFirst(notHogging(pool.length ? pool : activeFakes));


  // Bias toward the quieter half of the room so turns rotate
  const half = Math.max(1, Math.ceil(speakers.length / 2));
  return speakers[Math.floor(Math.random() * half)];
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
      // Was THIS bot the one called by name? Use the director's decision so a
      // newer message can't erase the fact that the user asked them directly.
      const addressedMe = pendingAddress && pendingAddress.name === fake.name ? pendingAddress : null;
      const wasAddressed = !!addressedMe;

      const lastWasRealUser = lastMsg && !isFakeName(lastSender) && lastSender !== 'Riley' && lastSender !== 'Alex';

      if (roomHistory.length <= 1) {
        // Quiet room — start a real topic
        const _topics = topicSet();
        const topic = _topics[Math.floor(Math.random() * _topics.length)];
        instruction = EN
          ? `Start a real conversation — share something about yourself or ask an interesting question about ${topic}. Do not say "hi" or "what's up". One sentence.`
          : `פתח שיחה אמיתית — ספר משהו על עצמך או שאל שאלה מעניינת שקשורה ל${topic}. אל תגיד "היי" או "מה קורה". משפט אחד.`;
      } else if (wasAddressed) {
        // Someone called this bot by name. Answer THEM, about what THEY said.
        const who = addressedMe.by;
        const what = addressedMe.text;
        instruction = EN
          ? `${who} just said to you directly: "${what}". You MUST answer them about exactly that. Reply in first person, like a real person being spoken to. Do not change the subject, do not carry on with what you were saying before, do not talk about yourself in third person. If it was a question, answer it. If it was a jab, react to it. One short sentence.`
          : `${who} פנה אליך עכשיו ואמר: "${what}". אתה חייב לענות לו בדיוק על זה. תענה בגוף ראשון, כמו אדם אמיתי שפונים אליו. אל תשנה נושא, אל תמשיך במה שדיברת עליו קודם, ואל תדבר על עצמך בגוף שלישי. אם זו שאלה, תענה עליה. אם זו עקיצה, תגיב לה. משפט אחד קצר.`;
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
      if (fake.persona.steerer && (topicMessageCount >= 5 || isTopicStuck() || topicIsStale()) && turnsSinceSteer >= 3 && !wasAddressed) {
        const _topics = topicSet();
        const topic = _topics[Math.floor(Math.random() * _topics.length)];
        instruction = EN
          ? `The conversation is stuck and repeating itself. Drop the current topic completely and open something new and unrelated — ${topic}. Ask a direct question or share a short personal experience. Do not mention the previous topic. One sentence.`
          : `השיחה נתקעה וחוזרת על עצמה. עצור את הנושא הנוכחי לגמרי ותפתח משהו חדש ולא קשור — ${topic}. שאל שאלה ישירה או ספר חוויה אישית קצרה. אל תזכיר את הנושא הקודם. משפט אחד.`;
        topicMessageCount = 0;
        turnsSinceSteer = 0;
        topicStartedAt = Date.now();
      }
      // Contrarian sometimes disagrees (but not if directly addressed)
      else if (fake.persona.contrarian && Math.random() < 0.35 && !wasAddressed) {
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
            ? `${SYSTEM_BASE_EN}\n\nYour persona: ${fake.persona.personality}${themeFocus()}`
            : `${SYSTEM_BASE}\n\nהאישיות שלך: ${fake.persona.personality}${themeFocus()}` },
        { role: 'user', content: EN ? `Chat history:\n${transcript}\n\n${instruction}` : `היסטוריית הצ׳אט:\n${transcript}\n\n${instruction}` }
      ]
    }), API_TIMEOUT_MS);
    let reply = response.choices[0]?.message?.content?.trim() || '';
    reply = stripBannedOpener(reply);
    reply = deAiPunctuation(reply);
    return reply;
  } catch (err) {
    console.error('[FakeHuman API error]', err.message);
    return '';
  }
}

// Safety net: strip echo-y openers ("וואי", "בדיוק", "לגמרי"...) that make bots sound like parrots
// Safety net: models love em-dashes and they read as obviously AI-written.
// Replace any that slip past the prompt with natural chat punctuation.
function deAiPunctuation(text) {
  if (!text) return text;
  return String(text)
    // Every dash variant a model might emit, plus double hyphens and a hyphen
    // used as a dash between spaces. All become a plain comma.
    .replace(/\s*[\u2010-\u2015\u2212]\s*/g, ', ')
    .replace(/\s+--+\s*/g, ', ')
    .replace(/\s+-\s+/g, ', ')
    // Tidy up whatever that produced
    .replace(/\s*,\s*,\s*/g, ', ')
    .replace(/,\s*([.!?\u2026])/g, '$1')
    .replace(/^[,\s]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

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
    scheduleNextTurn(nextGap());
  }
}

// Human conversation is uneven and mostly slow. A message every few seconds
// reads as spam, so most turns sit in the 15-40s range with occasional bursts.
function nextGap() {
  // A real person is waiting for a reply — answer promptly.
  if (userSpokeDuringTurn) return 2000 + Math.random() * 2500;   // 2-4.5s

  const roll = Math.random();
  if (roll < 0.20) return 8000 + Math.random() * 6000;    // 20%: quick exchange 8-14s
  if (roll < 0.60) return 15000 + Math.random() * 10000;  // 40%: normal        15-25s
  if (roll < 0.88) return 25000 + Math.random() * 15000;  // 28%: slow          25-40s
  return 45000 + Math.random() * 30000;                   // 12%: real lull     45-75s
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
