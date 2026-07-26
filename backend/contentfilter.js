// ── Content filter (isolated module) ──
// Two tiers:
//   TIER 1 — CRIMINAL: always blocked, everywhere, no toggle. Non-negotiable.
//   TIER 2 — SENSITIVE: blocked only when a room/group has the filter enabled.
//
// This module only reads text and returns a verdict. It touches no state,
// no sockets, no bot logic. Fails open (allows) on any unexpected input.

// ═══════ TIER 1: CRIMINAL — ALWAYS BLOCKED ═══════
// Sexual content involving minors. Patterns are combinations, so a message must
// pair a sexual term with a minor term to trigger — this avoids blocking
// legitimate talk about children.
const MINOR_TERMS = [
  'ילד', 'ילדה', 'ילדים', 'קטין', 'קטינה', 'בת 12', 'בת 13', 'בת 14', 'בת 15',
  'בן 12', 'בן 13', 'בן 14', 'בן 15', 'תלמידה', 'תלמיד', 'בגן', 'בכיתה',
  'child', 'kid', 'minor', 'underage', 'teen', 'schoolgirl', 'schoolboy',
  'preteen', 'loli', 'shota',
];

const SEXUAL_TERMS = [
  'סקס', 'זיון', 'לזיין', 'עירום', 'עירומה', 'שד', 'שדיים', 'תחת', 'זין',
  'כוס', 'אונן', 'לאונן', 'פורנו', 'חשפנית', 'מציצה',
  'sex', 'sexy', 'nude', 'naked', 'porn', 'fuck', 'horny', 'nsfw', 'xxx',
];

// Doxxing: Israeli ID numbers, phone numbers, explicit address sharing
const DOX_PATTERNS = [
  /\b\d{9}\b/,                               // Israeli ID (9 digits)
  /\b0[2-9]\d[- ]?\d{7}\b/,                  // Israeli landline
  /\b05\d[- ]?\d{7}\b/,                      // Israeli mobile
  /\b\+972[- ]?\d{8,9}\b/,                   // Israel int'l format
  /\b\d{3}[- ]?\d{3}[- ]?\d{4}\b/,           // US-style phone
];

// ═══════ TIER 2: SENSITIVE — TOGGLEABLE ═══════
const PROFANITY = [
  'זונה', 'שרמוטה', 'בן זונה', 'כוסאמק', 'אמק', 'מניאק', 'חרא',
  'לך תזדיין', 'תמות', 'דפוק', 'מפגר',
  'bitch', 'whore', 'slut', 'cunt', 'retard', 'faggot',
];

const HATE_SPEECH = [
  'מוות לערבים', 'מוות ליהודים', 'היטלר צדק', 'שואה שנייה',
  'kill all', 'gas the', 'heil hitler', 'white power',
];

const THREATS = [
  'אני ארצח אותך', 'אהרוג אותך', 'אני יודע איפה אתה גר', 'אני בא לחסל',
  'אשבור לך את', 'תיזהר ממני',
  'i will kill you', 'im gonna kill you', 'i know where you live',
  'i will find you and',
];

function normalize(text) {
  return String(text)
    .toLowerCase()
    // collapse common evasion: repeated chars, separators between letters
    .replace(/[\u0591-\u05C7]/g, '')     // strip Hebrew niqqud
    .replace(/(.)\1{2,}/g, '$1$1');      // "אאאא" -> "אא"
}

function containsAny(text, list) {
  return list.some(term => text.includes(term));
}

/**
 * Check a message against the content policy.
 * @param {string} text - the message
 * @param {boolean} sensitiveEnabled - whether Tier 2 is enabled for this room/group
 * @returns {{ blocked: boolean, tier: 1|2|null, reason: string|null }}
 */
function checkContent(text, sensitiveEnabled = false) {
  if (!text || typeof text !== 'string') {
    return { blocked: false, tier: null, reason: null };
  }

  const norm = normalize(text);

  // ── TIER 1: CRIMINAL (always enforced, never toggleable) ──
  const hasMinor = containsAny(norm, MINOR_TERMS);
  const hasSexual = containsAny(norm, SEXUAL_TERMS);
  if (hasMinor && hasSexual) {
    return {
      blocked: true,
      tier: 1,
      reason: 'ההודעה נחסמה. תוכן מסוג זה אסור בהחלט. / Message blocked. This content is strictly prohibited.',
    };
  }

  // Doxxing — sharing someone's ID / phone number
  if (DOX_PATTERNS.some(re => re.test(text))) {
    return {
      blocked: true,
      tier: 1,
      reason: 'אסור לפרסם פרטים אישיים (טלפון / ת.ז). / Sharing personal details (phone / ID) is not allowed.',
    };
  }

  // Explicit threats of violence — criminal tier
  if (containsAny(norm, THREATS)) {
    return {
      blocked: true,
      tier: 1,
      reason: 'איומים אסורים בפלטפורמה. / Threats are not allowed on this platform.',
    };
  }

  // Hate speech — criminal tier
  if (containsAny(norm, HATE_SPEECH)) {
    return {
      blocked: true,
      tier: 1,
      reason: 'הסתה ושנאה אסורות. / Hate speech is not allowed.',
    };
  }

  // ── TIER 2: SENSITIVE (only if enabled for this room/group) ──
  if (sensitiveEnabled && containsAny(norm, PROFANITY)) {
    return {
      blocked: true,
      tier: 2,
      reason: 'ההודעה מכילה שפה שאינה מתאימה לחדר זה. / Your message contains language not allowed in this room.',
    };
  }

  return { blocked: false, tier: null, reason: null };
}

module.exports = { checkContent };
