import { useState, useEffect, useRef } from 'react'
import socket from '../socket'
import { detectLang, setLang as saveLang, t } from '../legal'
import LegalModal from '../components/LegalModal'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Legal / compliance
  const [lang, setLang] = useState(detectLang())
  const [ageOk, setAgeOk] = useState(() => {
    try { return localStorage.getItem('chatlly_age_ok') === '1' } catch { return false }
  })
  const [legalOpen, setLegalOpen] = useState(null) // 'tos' | 'privacy' | null
  const [geoBlocked, setGeoBlocked] = useState(false)
  const mountedRef = useRef(true)

  const L = t(lang)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Clean up any pending socket.once listeners if component unmounts during login
      socket.off('joined')
      socket.off('connect_join')
    }
  }, [])

  function toggleLang() {
    const next = lang === 'he' ? 'en' : 'he'
    setLang(next)
    saveLang(next)
  }

  function handleAgeChange(checked) {
    setAgeOk(checked)
    try {
      if (checked) localStorage.setItem('chatlly_age_ok', '1')
      else localStorage.removeItem('chatlly_age_ok')
    } catch {}
  }

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = username.trim()
    if (trimmed.length < 2) return setError(L.errShort)
    // Age gate - required before entering
    if (!ageOk) return setError(L.ageRequired)
    setError('')
    setLoading(true)

    // Disconnect cleanly first
    if (socket.connected) socket.disconnect()
    socket.auth = { token: null }

    // Register ALL listeners BEFORE connecting (prevents race condition)
    function onJoined({ user, token }) {
      socket.off('connect_error', onConnectError)
      if (!mountedRef.current) return
      setLoading(false)
      onLogin(user, token, rememberMe)
    }

    function onAuthError({ message }) {
      socket.off('joined', onJoined)
      socket.off('connect_error', onConnectError)
      if (!mountedRef.current) return
      setLoading(false)
      setError(message)
      socket.disconnect()
    }

    function onConnectError(err) {
      socket.off('joined', onJoined)
      socket.off('error', onAuthError)
      if (!mountedRef.current) return
      setLoading(false)
      setError(L.errConn)
    }

    function onConnect() {
      socket.emit('join', { username: trimmed, password })
    }

    function onGeoBlocked() {
      socket.off('joined', onJoined)
      socket.off('error', onAuthError)
      socket.off('connect_error', onConnectError)
      if (!mountedRef.current) return
      setLoading(false)
      setGeoBlocked(true)
      socket.disconnect()
    }

    socket.once('geoBlocked', onGeoBlocked)
    socket.once('joined', onJoined)
    socket.once('error', onAuthError)
    socket.once('connect_error', onConnectError)
    socket.once('connect', onConnect)

    // Connect AFTER listeners are registered
    socket.connect()
  }

  if (geoBlocked) {
    return (
      <div className="login-container" dir={L.dir}>
        <div className="login-box geo-blocked-box">
          <div className="geo-blocked-icon">🌍</div>
          <h2 className="geo-blocked-title">{L.geoBlockedTitle}</h2>
          <p className="geo-blocked-body">{L.geoBlockedBody}</p>
          <button className="lang-switch geo-lang" onClick={toggleLang} type="button">
            🌐 {L.langSwitch}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-container" dir={L.dir}>
      <div className="login-box">
        <button className="lang-switch" onClick={toggleLang} type="button">
          🌐 {L.langSwitch}
        </button>

        <div className="login-logo-wrap">
          <svg className="login-logo-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="chatllyGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop stopColor="#9d6bff" />
                <stop offset="1" stopColor="#5c35cc" />
              </linearGradient>
            </defs>
            <path d="M12 10h40a6 6 0 0 1 6 6v24a6 6 0 0 1-6 6H28l-12 10v-10h-4a6 6 0 0 1-6-6V16a6 6 0 0 1 6-6Z" fill="url(#chatllyGrad)"/>
            <circle cx="24" cy="28" r="3.2" fill="#fff"/>
            <circle cx="34" cy="28" r="3.2" fill="#fff"/>
            <circle cx="44" cy="28" r="3.2" fill="#fff"/>
          </svg>
        </div>
        <h1 className="login-title">Chatlly</h1>
        <p className="login-subtitle">{L.subtitle}</p>

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <input
            type="text"
            placeholder={L.username}
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="login-input"
            maxLength={20}
            autoComplete="username"
            autoFocus
            disabled={loading}
          />
          <input
            type="password"
            placeholder={L.password}
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="login-input"
            autoComplete="current-password"
            disabled={loading}
          />

          <label className="login-remember">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
              disabled={loading}
            />
            <span>{L.remember}</span>
          </label>

          {/* Age gate: required 18+ */}
          <label className="login-age">
            <input
              type="checkbox"
              checked={ageOk}
              onChange={e => handleAgeChange(e.target.checked)}
              disabled={loading}
            />
            <span>{L.ageConfirm}</span>
          </label>

          {error && <div className="login-error">⚠️ {error}</div>}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? L.connecting : L.enter}
          </button>
        </form>

        <p className="login-hint">{L.hint}</p>

        {/* Disclosure: one small line, as agreed */}
        <p className="login-disclosure">{L.disclosure}</p>

        {/* Legal links */}
        <div className="login-legal-links">
          <button type="button" onClick={() => setLegalOpen('tos')}>{L.tos}</button>
          <span className="legal-sep">&middot;</span>
          <button type="button" onClick={() => setLegalOpen('privacy')}>{L.privacy}</button>
        </div>

        {/* Support (optional, non-intrusive) */}
        <a
          className="login-support"
          href="https://buymeacoffee.com/legacyhub"
          target="_blank"
          rel="noopener noreferrer"
          title={L.supportTip}
        >
          {L.supportUs}
        </a>
      </div>

      <LegalModal kind={legalOpen} lang={lang} onClose={() => setLegalOpen(null)} />
    </div>
  )
}
