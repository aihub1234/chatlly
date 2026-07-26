// ── Crisis detection (isolated module) ──
// Detects expressions of severe distress / self-harm intent and returns a
// supportive helpline referral. Runs in real time, before anything else.
// Deliberately conservative: better a rare false positive than a missed cry for help.
//
// This module ONLY reads text and returns a message. It touches no state,
// no sockets, and no bot logic.

// Hebrew and English phrases that indicate possible self-harm / suicidal intent.
// Kept as phrases (not single words) to reduce false positives.
const CRISIS_PATTERNS_HE = [
  'רוצה למות', 'רוצה להתאבד', 'אתאבד', 'להתאבד', 'לשים סוף לחיים',
  'לגמור עם החיים', 'אין לי סיבה לחיות', 'אין טעם לחיות', 'נמאס לי לחיות',
  'לא רוצה לחיות', 'עדיף שאמות', 'כולם יהיו יותר טוב בלעדיי',
  'אני רוצה להיעלם לנצח', 'לפגוע בעצמי', 'לחתוך את עצמי',
];

const CRISIS_PATTERNS_EN = [
  'want to die', 'wanna die', 'kill myself', 'killing myself', 'end my life',
  'suicide', 'suicidal', 'no reason to live', 'no point in living',
  'better off without me', 'want to disappear forever', 'hurt myself',
  'harm myself', 'cut myself', 'end it all',
];

// Supportive responses — warm, non-judgmental, with a real resource.
const RESPONSE_HE =
  '💜 שמעתי אותך, ואני רוצה שתדע שלא צריך להתמודד עם זה לבד. ' +
  'יש אנשים שאפשר לדבר איתם עכשיו — ער"ן בטלפון 1201 (24 שעות ביממה, בחינם), ' +
  'או סה"ר בצ׳אט באתר sahar.org.il. הם שם בשבילך.';

const RESPONSE_EN =
  '💜 I hear you, and you don\'t have to face this alone. ' +
  'There are people you can talk to right now — in the US call or text 988 ' +
  '(Suicide & Crisis Lifeline, 24/7), or find your local line at findahelpline.com. ' +
  'They are there for you.';

// Detect Hebrew characters to choose the response language
function isHebrew(text) {
  return /[\u0590-\u05FF]/.test(text);
}

/**
 * Check a message for crisis indicators.
 * @param {string} text
 * @returns {{ detected: boolean, response: string|null }}
 */
function checkMessage(text) {
  if (!text || typeof text !== 'string') {
    return { detected: false, response: null };
  }
  const lower = text.toLowerCase();

  const hitHe = CRISIS_PATTERNS_HE.some(p => lower.includes(p));
  const hitEn = CRISIS_PATTERNS_EN.some(p => lower.includes(p));

  if (!hitHe && !hitEn) {
    return { detected: false, response: null };
  }

  // Respond in the language of the message
  const response = (hitHe || isHebrew(text)) ? RESPONSE_HE : RESPONSE_EN;
  return { detected: true, response };
}

module.exports = { checkMessage };
