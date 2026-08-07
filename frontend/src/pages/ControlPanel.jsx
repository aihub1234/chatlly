import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import socket from '../socket'

export default function ControlPanel() {
  const [authed, setAuthed] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loading, setLoading] = useState(false)

  const [config, setConfig] = useState(null)
  const [stats, setStats] = useState(null)
  const [rooms, setRooms] = useState([])
  const [groups, setGroups] = useState([])
  const [geoConf, setGeoConf] = useState(null)
  const [geoAvail, setGeoAvail] = useState(true)
  const [blockList, setBlockList] = useState('')
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomEmoji, setNewRoomEmoji] = useState('💭')
  const [spawnRoom, setSpawnRoom] = useState('main')
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const navigate = useNavigate()

  function showToast(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2500)
  }

  // ── Socket wiring ──
  useEffect(() => {
    function onAuthorized({ token, config, stats }) {
      sessionStorage.setItem('chatlly_panel_token', token)
      setAuthed(true)
      setConfig(config)
      setStats(stats)
      setLoading(false)
      socket.emit('getRooms')
      socket.emit('panel:getGeo')
    }
    function onDenied({ message }) {
      setLoginError(message || 'גישה נדחתה')
      setLoading(false)
    }
    function onState({ config, stats }) {
      setConfig(config)
      setStats(stats)
    }
    function onConfigChanged(cfg) { setConfig(cfg) }
    function onGeoState({ config, available }) {
      setGeoConf(config)
      setGeoAvail(available)
      setBlockList((config.blockedCountries || []).join(', '))
    }
    function onRoomList(list, counts, grps) { setRooms(list); if (grps) setGroups(grps) }

    socket.on('panel:authorized', onAuthorized)
    socket.on('panel:denied', onDenied)
    socket.on('panel:state', onState)
    socket.on('panel:configChanged', onConfigChanged)
    socket.on('panel:geoState', onGeoState)
    socket.on('roomList', onRoomList)

    // Ensure connection, then try token re-auth
    if (!socket.connected) {
      socket.auth = {}
      socket.connect()
    }
    const savedToken = sessionStorage.getItem('chatlly_panel_token')
    if (savedToken) {
      const tryAuth = () => socket.emit('panel:auth', { token: savedToken })
      if (socket.connected) tryAuth()
      else socket.once('connect', tryAuth)
    }

    // Poll stats every 4s while authed
    const poll = setInterval(() => {
      if (socket.connected) socket.emit('panel:getState')
    }, 4000)

    return () => {
      socket.off('panel:authorized', onAuthorized)
      socket.off('panel:denied', onDenied)
      socket.off('panel:state', onState)
      socket.off('panel:configChanged', onConfigChanged)
      socket.off('panel:geoState', onGeoState)
      socket.off('roomList', onRoomList)
      clearInterval(poll)
    }
  }, [])

  function handleLogin(e) {
    e.preventDefault()
    setLoginError('')
    setLoading(true)
    if (!socket.connected) {
      socket.auth = {}
      socket.connect()
      socket.once('connect', () => socket.emit('panel:login', { username, password }))
    } else {
      socket.emit('panel:login', { username, password })
    }
  }

  function update(patch) {
    socket.emit('panel:setConfig', patch)
  }

  function spawnNow() {
    socket.emit('panel:spawnFakes', { roomId: spawnRoom })
    const roomName = rooms.find(r => r.id === spawnRoom)?.name || 'ראשי'
    showToast(`🤖 בוטים אנושיים נכנסים ל"${roomName}"...`)
  }

  function panic() {
    if (!window.confirm('לנקות את כל הבוטים האנושיים מכל החדרים?')) return
    socket.emit('panel:panic')
    showToast('🛑 מנקה הכל...')
  }

  function setGeo(patch) {
    socket.emit('panel:setGeo', patch)
  }

  function applyBlockList() {
    const list = blockList.split(',').map(x => x.trim().toUpperCase()).filter(Boolean)
    setGeo({ blockedCountries: list })
    showToast('רשימת מדינות חסומות עודכנה')
  }

  function toggleGroupFilter(groupId, enabled) {
    socket.emit('panel:setGroupFilter', { groupId, enabled })
  }

  function addRoom() {
    if (!newRoomName.trim()) return
    socket.emit('panel:addRoom', { name: newRoomName.trim(), emoji: newRoomEmoji || '💭' })
    setNewRoomName('')
    setNewRoomEmoji('💭')
    showToast('חדר נוסף')
  }

  function removeRoom(roomId, roomName) {
    if (!window.confirm(`למחוק את החדר "${roomName}"?`)) return
    socket.emit('panel:removeRoom', { roomId })
    showToast('חדר נמחק')
  }

  // ── LOGIN SCREEN ──
  if (!authed) {
    return (
      <div className="panel-login-container">
        <div className="panel-login-box">
          <div className="panel-lock">🔐</div>
          <h1 className="panel-login-title">Control Panel</h1>
          <p className="panel-login-sub">גישה מוגבלת</p>
          <form onSubmit={handleLogin} className="panel-login-form" noValidate>
            <input
              className="panel-input"
              type="text"
              placeholder="שם משתמש"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              disabled={loading}
            />
            <input
              className="panel-input"
              type="password"
              placeholder="סיסמה"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
            />
            {loginError && <div className="panel-login-error">⚠️ {loginError}</div>}
            <button className="panel-login-btn" type="submit" disabled={loading}>
              {loading ? '⏳...' : 'כניסה'}
            </button>
          </form>
          <button className="panel-back-link" onClick={() => navigate('/')}>← חזרה לצ'אט</button>
        </div>
      </div>
    )
  }

  // ── PANEL ──
  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>🎛️ לוח שליטה — בוטים</h2>
        <button className="panel-exit" onClick={() => navigate('/')}>← צ'אט</button>
      </div>

      {toast && <div className="notification-bar">{toast}</div>}

      {/* ── Dashboard ── */}
      <div className="panel-section">
        <div className="panel-section-title">📊 מידע כללי</div>
        <div className="panel-dash">
          <div className="dash-card">
            <span className={`dash-dot ${stats?.serverUp ? 'dot-on' : 'dot-off'}`} />
            <div className="dash-label">סטטוס שרת</div>
            <div className="dash-val">{stats?.serverUp ? 'פעיל' : 'מנותק'}</div>
          </div>
          <div className="dash-card">
            <div className="dash-label">משתמשים אמיתיים</div>
            <div className="dash-val">{stats?.realUsers ?? 0}</div>
          </div>
          <div className="dash-card">
            <div className="dash-label">בוטים אנושיים</div>
            <div className="dash-val">{stats?.fakeHumans ?? 0}</div>
          </div>
          <div className="dash-card">
            <div className="dash-label">חימום (Riley+Alex)</div>
            <div className="dash-val">{stats?.warmupActive ? 'פעיל' : 'כבוי'}</div>
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="panel-section">
        <div className="panel-section-title">⚙️ פיצ'רים ושליטה</div>

        {config && (
          <>
            {/* Warmup bots */}
            <div className="panel-toggle-row">
              <div className="toggle-info">
                <div className="toggle-name">🔥 בוטי חימום (Riley + Alex)</div>
                <div className="toggle-desc">2 הבוטים המקוריים שמתחילים דינמיקה בחדר ריק</div>
              </div>
              <Toggle on={config.warmupBots} onClick={() => update({ warmupBots: !config.warmupBots })} />
            </div>

            {/* Fake humans */}
            <div className="panel-toggle-row">
              <div className="toggle-info">
                <div className="toggle-name">👥 מילוי חדרים באנשים</div>
                <div className="toggle-desc">בוטים שמתחזים למשתמשים אמיתיים ליצירת מראה שוקק</div>
              </div>
              <Toggle on={config.fakeHumans} onClick={() => update({ fakeHumans: !config.fakeHumans })} />
            </div>

            {/* Count slider */}
            <div className="panel-slider-row">
              <div className="slider-label">
                🎚️ כמות בוטים אנושיים לחדר: <strong>{config.fakeHumansCount}</strong>
              </div>
              <input
                className="panel-slider"
                type="range"
                min="1"
                max="10"
                value={config.fakeHumansCount}
                onChange={e => update({ fakeHumansCount: Number(e.target.value) })}
              />
            </div>

            {/* Auto-evict */}
            <div className="panel-toggle-row">
              <div className="toggle-info">
                <div className="toggle-name">🚪 פינוי בוטים אוטומטי</div>
                <div className="toggle-desc">כשמשתמש אמיתי נכנס, הבוטים עוזבים בהדרגה</div>
              </div>
              <Toggle on={config.autoEvict} onClick={() => update({ autoEvict: !config.autoEvict })} />
            </div>

            {/* Manual spawn */}
            {/* Manual spawn with room picker */}
            <div className="panel-spawn-row">
              <label className="spawn-room-label">לאיזה חדר?</label>
              <select
                className="panel-room-select"
                value={spawnRoom}
                onChange={e => setSpawnRoom(e.target.value)}
              >
                {groups.length
                  ? groups.map(g => {
                      const rs = rooms.filter(r => r.group === g.id)
                      if (!rs.length) return null
                      return (
                        <optgroup key={g.id} label={`${g.emoji} ${g.name}`}>
                          {rs.map(r => (
                            <option key={r.id} value={r.id}>{r.emoji} {r.name}</option>
                          ))}
                        </optgroup>
                      )
                    })
                  : rooms.map(r => (
                      <option key={r.id} value={r.id}>{r.emoji} {r.name}</option>
                    ))}
              </select>
            </div>
            <button className="panel-spawn-btn" onClick={spawnNow}>
              ➕ הכנס בוטים אנושיים לחדר שנבחר
            </button>

            {/* Panic */}
            <button className="panel-panic-btn" onClick={panic}>
              🛑 נקה את כל הבוטים (Panic)
            </button>
          </>
        )}
      </div>

      {/* ── Geo blocking / read-only ── */}
      <div className="panel-section">
        <div className="panel-section-title">🌍 חסימה גיאוגרפית וצפייה בלבד</div>
        {!geoAvail && (
          <p style={{fontSize:'11px', color:'var(--danger)', margin:'0 0 8px 0'}}>
            ⚠️ ספריית הזיהוי לא מותקנת — הפיצ'ר מושבת (כולם מקבלים גישה מלאה). הרץ SETUP.bat שוב.
          </p>
        )}
        {geoConf && (
          <>
            <div className="panel-toggle-row">
              <div className="toggle-info">
                <span className="toggle-name">הפעל זיהוי אזור</span>
                <span className="toggle-desc">מתג ראשי — כשכבוי, כולם מקבלים גישה מלאה</span>
              </div>
              <Toggle on={!!geoConf.enabled} onClick={() => setGeo({ enabled: !geoConf.enabled })} />
            </div>

            <div className="panel-toggle-row">
              <div className="toggle-info">
                <span className="toggle-name">חסום את כל האיחוד האירופי</span>
                <span className="toggle-desc">GDPR / AI Act — חוסם מדינות EU</span>
              </div>
              <Toggle on={!!geoConf.blockEU} onClick={() => setGeo({ blockEU: !geoConf.blockEU })} />
            </div>

            <div className="panel-toggle-row">
              <div className="toggle-info">
                <span className="toggle-name">צפייה בלבד לזרים</span>
                <span className="toggle-desc">מבקר לא־ישראלי רואה את קבוצת ישראל אך כותב רק בבינלאומית</span>
              </div>
              <Toggle on={!!geoConf.readOnlyForForeign} onClick={() => setGeo({ readOnlyForForeign: !geoConf.readOnlyForForeign })} />
            </div>

            <div className="panel-room-add" style={{marginTop:'12px'}}>
              <input
                type="text"
                placeholder="מדינות חסומות, למשל: US, CA"
                value={blockList}
                onChange={e => setBlockList(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyBlockList()}
              />
              <button onClick={applyBlockList}>עדכן</button>
            </div>
            <p style={{fontSize:'10.5px', color:'var(--text2)', margin:'6px 0 0 0'}}>
              קודי מדינה בני 2 אותיות, מופרדים בפסיק. VPN יכול לעקוף — זה מסנן את רוב התנועה, לא חומה אטומה.
            </p>
          </>
        )}
      </div>

      {/* ── Content filter per group ── */}
      <div className="panel-section">
        <div className="panel-section-title">🛡️ פילטר תוכן לפי קבוצה</div>
        <p style={{fontSize:'11px', color:'var(--text2)', margin:'0 0 10px 0'}}>
          תוכן פלילי (קטינים, איומים, doxxing) חסום תמיד ובכל מקום. המתג כאן שולט רק על תוכן רגיש (קללות, שפה בוטה).
        </p>
        {groups.map(g => (
          <div key={g.id} className="panel-group-row">
            <div className="panel-group-info">
              <span className="panel-group-name">{g.emoji} {g.name}</span>
              <span className="panel-group-desc">
                {g.filterSensitive ? 'מסנן שפה בוטה' : 'שפה חופשית'}
              </span>
            </div>
            <Toggle on={!!g.filterSensitive} onClick={() => toggleGroupFilter(g.id, !g.filterSensitive)} />
          </div>
        ))}
      </div>

      {/* ── Rooms management ── */}
      <div className="panel-section">
        <div className="panel-section-title">🚪 ניהול חדרים</div>
        {rooms.map(room => (
          <div key={room.id} className="panel-room-item">
            <span>{room.emoji} {room.name}{room.system ? ' (קבוע)' : ''}</span>
            {!room.system && (
              <button className="room-del" onClick={() => removeRoom(room.id, room.name)}>מחק</button>
            )}
          </div>
        ))}
        <div className="panel-room-add">
          <input
            type="text"
            placeholder="🎬"
            value={newRoomEmoji}
            onChange={e => setNewRoomEmoji(e.target.value)}
            style={{ maxWidth: '60px', textAlign: 'center' }}
            maxLength={2}
          />
          <input
            type="text"
            placeholder="שם החדר החדש"
            value={newRoomName}
            onChange={e => setNewRoomName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addRoom()}
          />
          <button onClick={addRoom}>הוסף</button>
        </div>
      </div>
    </div>
  )
}

function Toggle({ on, onClick }) {
  return (
    <button className={`switch ${on ? 'switch-on' : 'switch-off'}`} onClick={onClick} type="button">
      <span className="switch-knob" />
    </button>
  )
}
