// ── Legal / compliance text (bilingual) ──
// Isolated module: pure data + a language helper. Touches nothing else.
// Hebrew for Israeli visitors, English for everyone else.

export function detectLang() {
  try {
    // Manual override wins (user can switch)
    const saved = localStorage.getItem('chatlly_lang')
    if (saved === 'he' || saved === 'en') return saved
    // Otherwise: Hebrew if the browser is Hebrew, English otherwise
    const nav = (navigator.language || navigator.userLanguage || '').toLowerCase()
    return nav.startsWith('he') || nav.startsWith('iw') ? 'he' : 'en'
  } catch {
    return 'he'
  }
}

export function setLang(lang) {
  try { localStorage.setItem('chatlly_lang', lang) } catch {}
}

export const T = {
  he: {
    dir: 'rtl',
    // Login
    subtitle: 'הצטרף לשיחה',
    username: 'שם משתמש',
    password: 'סיסמה (אופציונלי)',
    remember: 'זכור אותי',
    enter: 'כניסה לצ\'אט →',
    connecting: '⏳ מתחבר...',
    hint: 'משתמש רגיל — ללא סיסמה. מנהל — הזן סיסמה.',
    errShort: 'שם משתמש חייב להיות לפחות 2 תווים',
    errConn: 'שגיאת חיבור לשרת — נסה שוב',

    // Age gate (required)
    ageConfirm: 'אני מאשר/ת שאני בן/בת 18 ומעלה',
    ageRequired: 'יש לאשר שאתה בן 18 ומעלה כדי להיכנס',

    // Disclosure — ONE small line, as agreed
    disclosure: 'שים לב: חלק מהמשתתפים בצ\'אט הם אוטומטיים.',

    // Footer links
    tos: 'תנאי שימוש',
    privacy: 'מדיניות פרטיות',
    close: 'סגור',
    langSwitch: 'English',

    // Terms of Service
    tosTitle: 'תנאי שימוש',
    tosBody: [
      ['1. קבלת התנאים', 'השימוש בפלטפורמה מהווה הסכמה מלאה לתנאים אלה. אם אינך מסכים — אל תשתמש בשירות.'],
      ['2. גיל מינימלי', 'השירות מיועד לבני 18 ומעלה בלבד. בכניסה אתה מצהיר שאתה בן 18 לפחות. משתמשים מתחת לגיל 18 ייחסמו.'],
      ['3. אחריות המשתמש לתוכן', 'אתה נושא באחריות המלאה והבלעדית לכל תוכן שאתה מפרסם. השירות ניתן "כמו שהוא" (AS-IS), ואינו מפקח מראש על תוכן משתמשים.'],
      ['4. משתתפים אוטומטיים', 'חלק מהמשתתפים בצ\'אט הם אוטומטיים (מבוססי בינה מלאכותית). אין להסתמך על דבריהם כעצה מקצועית מכל סוג.'],
      ['5. איסורים', 'אסור: תוכן מיני הקשור לקטינים, איומים באלימות, הטרדה, הסתה, פרסום פרטים אישיים של אחרים (doxxing), ספאם, או כל פעילות בלתי חוקית.'],
      ['6. אין ייעוץ מקצועי', 'שום דבר בשירות אינו מהווה ייעוץ רפואי, משפטי, פיננסי או פסיכולוגי.'],
      ['7. אכיפה', 'אנו רשאים להסיר תוכן, לחסום משתמשים ולחסום כתובות IP לפי שיקול דעתנו הבלעדי, ללא הודעה מוקדמת.'],
      ['8. שיפוי', 'אתה מתחייב לשפות אותנו על כל נזק, הוצאה או תביעה שינבעו מהתוכן שפרסמת או משימושך בשירות.'],
      ['9. הגבלת אחריות', 'אחריותנו הכוללת מוגבלת לסכום של 0 ש"ח. איננו אחראים לנזק ישיר או עקיף כלשהו.'],
      ['10. זמינות', 'השירות עשוי להיות מופסק, מוגבל או משתנה בכל עת ללא הודעה מוקדמת.'],
      ['11. דיווח על תוכן פוגעני', 'ניתן לדווח על תוכן פוגעני דרך כפתור הדיווח בצ\'אט. נטפל בדיווחים מוצדקים בהקדם.'],
      ['12. דין חל', 'על תנאים אלה יחולו דיני מדינת ישראל.'],
    ],

    // Privacy Policy
    privTitle: 'מדיניות פרטיות',
    privBody: [
      ['איזה מידע נאסף', 'שם המשתמש שבחרת, כתובת ה-IP שלך, תוכן ההודעות שכתבת בצ\'אט, וזמני התחברות.'],
      ['למה המידע נאסף', 'להפעלת השירות, למניעת שימוש לרעה (חסימות), ולעמידה בדרישות חוק.'],
      ['שמירת מידע', 'הודעות והיסטוריית צ\'אט נשמרות לתקופה מוגבלת לצורכי מודרציה. כתובות IP נשמרות לצורך אכיפת חסימות.'],
      ['שיתוף עם צדדים שלישיים', 'איננו מוכרים מידע אישי. מידע יימסר לרשויות רק על פי צו שיפוטי או חובה חוקית.'],
      ['עוגיות ופרסום', 'האתר עשוי להשתמש בעוגיות ובשירותי פרסום של צד שלישי, שעשויים לאסוף מידע אנונימי לצורכי התאמת מודעות.'],
      ['אין העלאת קבצים', 'הפלטפורמה היא טקסט בלבד. לא ניתן להעלות תמונות, סרטונים או קבצים.'],
      ['זכויותיך', 'ניתן לפנות אלינו בבקשה למחיקת המידע שלך. נטפל בבקשה בכפוף לחובות חוקיות.'],
      ['אבטחה', 'אנו נוקטים באמצעים סבירים לאבטחת המידע, אך אין אבטחה מושלמת ברשת.'],
    ],


    // ── Chat UI ──
    writeMessage: 'כתוב הודעה...',
    connectingShort: 'מתחבר...',
    send: 'שלח',
    rooms: 'חדרים',
    groups: 'קבוצות',
    connected: 'מחוברים',
    online: 'מחובר',
    openToPrivate: 'פתוח לפרטי',
    emptyChat: 'אין הודעות עדיין. תתחיל לדבר! 👋',
    joinedChat: 'הצטרף לצ׳אט',
    leftChat: 'עזב את הצ׳אט',
    reconnecting: 'מתחבר מחדש',
    disconnected: 'מנותק',
    exit: 'יציאה',
    logout: 'LOGOUT',
    promotedAdmin: '✨ קודמת למנהל!',
    msgTooLong: 'הודעה ארוכה מדי (מקס 500 תווים)',

    // ── Context menu ──
    copyName: 'העתק שם',
    privateChat: 'צ׳אט פרטי',
    kick: 'הרחק (Kick)',
    ban: 'חסום (Ban)',
    banIP: 'חסימת IP',
    makeAdmin: 'קדם למנהל',
    banReason: 'סיבה (אופציונלי)',
    banForever: '♾️ לצמיתות',
    ban30: '⏱️ 30 דקות',
    banHour: '⏱️ שעה',
    banDay: '⏱️ יום',
    banWeek: '⏱️ שבוע',
    confirmBan: '✓ בצע Ban',

    // ── Private chat ──
    privateRequestSent: 'בקשת צ׳אט פרטי נשלחה ל',
    privateIncoming: 'רוצה לפתוח איתך צ׳אט פרטי',
    accept: 'קבל',
    decline: 'דחה',
    declined: 'דחה את בקשת הצ׳אט',
    privateStart: 'התחילו לשוחח 👋',
    privateMessage: 'הודעה פרטית...',
    userUnavailable: 'המשתמש לא זמין לצ׳אט פרטי',

    // ── Content filter / system ──
    messageBlocked: 'ההודעה נחסמה',
    contentFilter: 'פילטר תוכן',
    filterOn: 'פעיל',
    filterOff: 'כבוי',


    // ── Geo / access ──
    geoBlockedTitle: 'השירות אינו זמין באזורך',
    geoBlockedBody: 'לצערנו הגישה לשירות אינה זמינה מהאזור שלך כרגע. אנו מתנצלים על אי הנוחות.',
    readOnlyBanner: '👀 אתה צופה בלבד בקבוצה זו — עבור לקבוצה הבינלאומית כדי לשוחח',
    readOnlyInput: 'צפייה בלבד — עבור לקבוצה הבינלאומית כדי לכתוב',
    welcomeIntl: 'ברוך הבא! 🌍 הכנסנו אותך לקבוצה הבינלאומית',
    viewOnly: 'צפייה בלבד',
    geoSettings: 'הגדרות אזור',


    // ── Support ──
    supportUs: '☕ קנו לנו קפה',
    supportTip: 'הפלטפורמה חינמית — תמיכה עוזרת לנו להמשיך',

    crisisNote: 'אם אתה במצוקה — אתה לא לבד. ניתן לפנות לער"ן בטלפון 1201 (24 שעות ביממה).',
  },

  en: {
    dir: 'ltr',
    // Login
    subtitle: 'Join the conversation',
    username: 'Username',
    password: 'Password (optional)',
    remember: 'Remember me',
    enter: 'Enter chat →',
    connecting: '⏳ Connecting...',
    hint: 'Regular user — no password. Admin — enter password.',
    errShort: 'Username must be at least 2 characters',
    errConn: 'Connection error — please try again',

    // Age gate (required)
    ageConfirm: 'I confirm that I am 18 years or older',
    ageRequired: 'You must confirm you are 18+ to enter',

    // Disclosure — ONE small line, as agreed
    disclosure: 'Please note: some participants in this chat are automated.',

    // Footer links
    tos: 'Terms of Service',
    privacy: 'Privacy Policy',
    close: 'Close',
    langSwitch: 'עברית',

    // Terms of Service
    tosTitle: 'Terms of Service',
    tosBody: [
      ['1. Acceptance', 'Using this platform constitutes full acceptance of these terms. If you do not agree, do not use the service.'],
      ['2. Minimum Age', 'This service is for users aged 18 and over only. By entering you confirm you are at least 18. Users under 18 will be blocked.'],
      ['3. User Responsibility for Content', 'You bear full and sole responsibility for any content you post. The service is provided "AS-IS" and does not pre-moderate user content.'],
      ['4. Automated Participants', 'Some participants in this chat are automated (AI-based). Do not rely on anything they say as professional advice of any kind.'],
      ['5. Prohibited Conduct', 'Prohibited: sexual content involving minors, threats of violence, harassment, incitement, publishing others\' personal details (doxxing), spam, or any illegal activity.'],
      ['6. No Professional Advice', 'Nothing in this service constitutes medical, legal, financial, or psychological advice.'],
      ['7. Enforcement', 'We may remove content, ban users, and block IP addresses at our sole discretion, without prior notice.'],
      ['8. Indemnification', 'You agree to indemnify us against any damage, cost, or claim arising from content you posted or your use of the service.'],
      ['9. Limitation of Liability', 'Our total liability is limited to $0. We are not liable for any direct or indirect damages.'],
      ['10. Availability', 'The service may be suspended, limited, or changed at any time without prior notice.'],
      ['11. Reporting Abuse', 'You can report abusive content via the report button in the chat. Justified reports will be handled promptly.'],
      ['12. Governing Law', 'These terms are governed by the laws of the State of Israel.'],
    ],

    // Privacy Policy
    privTitle: 'Privacy Policy',
    privBody: [
      ['What we collect', 'The username you choose, your IP address, the content of messages you write, and connection timestamps.'],
      ['Why we collect it', 'To operate the service, prevent abuse (bans), and comply with legal requirements.'],
      ['Data retention', 'Messages and chat history are stored for a limited period for moderation purposes. IP addresses are retained to enforce bans.'],
      ['Third-party sharing', 'We do not sell personal data. Information is disclosed to authorities only under a court order or legal obligation.'],
      ['Cookies and advertising', 'This site may use cookies and third-party advertising services, which may collect anonymous data for ad personalization.'],
      ['No file uploads', 'This platform is text-only. Images, videos, and files cannot be uploaded.'],
      ['Your rights', 'You may contact us to request deletion of your data. Requests are handled subject to legal obligations.'],
      ['Security', 'We take reasonable measures to secure data, but no online security is perfect.'],
    ],


    // ── Chat UI ──
    writeMessage: 'Write a message...',
    connectingShort: 'Connecting...',
    send: 'Send',
    rooms: 'Rooms',
    groups: 'Groups',
    connected: 'Online',
    online: 'online',
    openToPrivate: 'Open to DMs',
    emptyChat: 'No messages yet. Start the conversation! 👋',
    joinedChat: 'joined the chat',
    leftChat: 'left the chat',
    reconnecting: 'Reconnecting',
    disconnected: 'Disconnected',
    exit: 'Exit',
    logout: 'LOGOUT',
    promotedAdmin: '✨ You are now an admin!',
    msgTooLong: 'Message too long (max 500 characters)',

    // ── Context menu ──
    copyName: 'Copy name',
    privateChat: 'Private chat',
    kick: 'Kick',
    ban: 'Ban',
    banIP: 'IP ban',
    makeAdmin: 'Make admin',
    banReason: 'Reason (optional)',
    banForever: '♾️ Permanent',
    ban30: '⏱️ 30 minutes',
    banHour: '⏱️ 1 hour',
    banDay: '⏱️ 1 day',
    banWeek: '⏱️ 1 week',
    confirmBan: '✓ Confirm ban',

    // ── Private chat ──
    privateRequestSent: 'Private chat request sent to',
    privateIncoming: 'wants to start a private chat with you',
    accept: 'Accept',
    decline: 'Decline',
    declined: 'declined your chat request',
    privateStart: 'Start chatting 👋',
    privateMessage: 'Private message...',
    userUnavailable: 'This user is not available for private chat',

    // ── Content filter / system ──
    messageBlocked: 'Message blocked',
    contentFilter: 'Content filter',
    filterOn: 'On',
    filterOff: 'Off',


    // ── Geo / access ──
    geoBlockedTitle: 'Service unavailable in your region',
    geoBlockedBody: 'Access to this service is not available from your region at this time. We apologize for the inconvenience.',
    readOnlyBanner: '👀 You are viewing only — switch to the International group to chat',
    readOnlyInput: 'View only — switch to the International group to write',
    welcomeIntl: 'Welcome! 🌍 We placed you in the International group',
    viewOnly: 'View only',
    geoSettings: 'Region settings',


    // ── Support ──
    supportUs: '☕ Buy us a coffee',
    supportTip: 'This platform is free — your support keeps it running',

    crisisNote: 'If you are in distress, you are not alone. In the US you can call or text 988 (Suicide & Crisis Lifeline), available 24/7.',
  },
}

export function t(lang) {
  return T[lang] || T.he
}
