import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import socket from '../socket'
import Message from '../components/Message'
import UserList from '../components/UserList'
import UserContextMenu from '../components/UserContextMenu'
import BotStatus from '../components/BotStatus'
import { detectLang, t } from '../legal'

const EMOJI_LIST = [
  '😊','😂','🤣','😍','😘','😉','😎','🥰','😅','🙃',
  '👍','👎','🙏','👏','🙌','💪','🤝','✌️','🤞','👋',
  '❤️','🔥','✨','💯','🎉','🎶','☕','🍕','🥙','🍺',
  '😭','😩','😤','🤔','😏','🙄','😱','🥳','😴','🤗',
  '💃','🕺','🏖️','🌙','⭐','💕','😇','🤩','😜','🫶'
]

export default function ChatRoom({ user: initialUser, token, onLogout, onUpdateUser }) {
  const [currentUser, setCurrentUser] = useState(initialUser)
  const [lang] = useState(detectLang())  // local copy - allows role update
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [users, setUsers] = useState([])
  const [botStatus, setBotStatus] = useState({ riley: 'online', alex: 'online' })
  const [typingBot, setTypingBot] = useState(null)  // 'Riley' | 'Alex' | null
  const [contextMenu, setContextMenu] = useState(null)
  const [showUserList, setShowUserList] = useState(false)
  const [notification, setNotification] = useState('')
  const [connected, setConnected] = useState(socket.connected)
  // Rooms
  const [rooms, setRooms] = useState([])
  const [roomCounts, setRoomCounts] = useState({})
  const [groups, setGroups] = useState([])
  const [accessLevel, setAccessLevel] = useState('full')
  const [currentRoom, setCurrentRoom] = useState('main')
  const [showRooms, setShowRooms] = useState(false)
  // Private chats: { room, with, messages: [] }
  const [privateChats, setPrivateChats] = useState([])
  const [activePrivate, setActivePrivate] = useState(null) // room id of open private window
  const [incomingPrivate, setIncomingPrivate] = useState(null) // { from }
  const [openToPrivate, setOpenToPrivate] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const messagesEndRef = useRef(null)
  const messagesAreaRef = useRef(null)
  const isAtBottomRef = useRef(true)
  const navigate = useNavigate()
  const L = t(lang)

  // ── Smart scroll: only auto-scroll if user is near bottom ──
  const scrollToBottom = useCallback(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  function handleScroll() {
    const el = messagesAreaRef.current
    if (!el) return
    const threshold = 120
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }

  useEffect(() => { scrollToBottom() }, [messages, typingBot, scrollToBottom])

  // ── Socket events ────────────────────────────────────────
  useEffect(() => {
    function onConnect() {
      setConnected(true)
      // Page refresh: rejoin with saved token
      if (!socket.user) {
        socket.emit('rejoin', { token })
      } else {
        socket.emit('getHistory')
      }
      socket.emit('getRooms')  // always ensure room list is loaded
    }

    function onDisconnect() {
      setConnected(false)
    }

    function onMessage(msg) {
      setMessages(prev => [...prev, msg])
      // Clear typing indicator when the bot's message arrives
      if (msg.role === 'bot') setTypingBot(null)
    }

    function onHistory(history) {
      setMessages(history.map(h => ({
        id: h.id || String(Math.random()),
        sender: h.sender,
        text: h.message,
        role: h.role,
        timestamp: h.timestamp
      })))
    }

    function onUserList(list) { setUsers(list) }
    function onBotStatus(status) { setBotStatus(status) }
    function onBotTyping({ bot }) { setTypingBot(bot) }
    function onBotStopTyping() { setTypingBot(null) }

    // Rooms
    function onJoinedAccess(d) {
      if (d && d.accessLevel) setAccessLevel(d.accessLevel)
    }
    function onRoomList(list, counts, grps) { setRooms(list); if (counts) setRoomCounts(counts); if (grps) setGroups(grps) }
    function onRoomJoined({ roomId }) {
      setCurrentRoom(roomId)
      setMessages([])  // history will follow
    }

    // Private chat
    function onPrivateIncoming({ from }) {
      setIncomingPrivate({ from })
    }
    function onPrivateRequested({ to }) {
      showNotif(`${L.privateRequestSent} ${to}`)
    }
    function onPrivateOpened({ room, with: withUser }) {
      setPrivateChats(prev => {
        if (prev.some(p => p.room === room)) return prev
        return [...prev, { room, with: withUser, messages: [] }]
      })
      setActivePrivate(room)
      setIncomingPrivate(null)
    }
    function onPrivateDeclined({ by }) {
      showNotif(`${by} ${L.declined}`)
    }
    function onPrivateMessage(msg) {
      setPrivateChats(prev => prev.map(p =>
        p.room === msg.room ? { ...p, messages: [...p.messages, msg] } : p
      ))
    }
    function onPrivateClosed({ room }) {
      setPrivateChats(prev => prev.filter(p => p.room !== room))
      setActivePrivate(cur => cur === room ? null : cur)
    }

    function onUserJoined({ username, role }) {
      showNotif(`${role === 'admin' ? '🛡️ ' : ''}${username} ${L.joinedChat}`)
    }

    function onUserLeft({ username }) {
      showNotif(`${username} עזב`)
    }

    function onAdminMessage({ message }) {
      showNotif(`🔔 ${message}`)
    }

    function onKicked({ reason }) {
      alert(`הוצאת מהחדר: ${reason}`)
      handleLogout()
    }

    function onBanned({ reason }) {
      alert(`חסמו אותך: ${reason}`)
      handleLogout()
    }

    function onRoleUpdated({ role }) {
      setCurrentUser(prev => {
        const updated = { ...prev, role }
        onUpdateUser?.(updated)  // App handles correct storage (local/session) + route guards
        return updated
      })
      if (role === 'admin') showNotif(L.promotedAdmin)
    }

    function onError({ message }) {
      showNotif(`❌ ${message}`)
    }

    function onSessionExpired() {
      // Token no longer valid (e.g. server restarted with a new JWT_SECRET).
      // Clear the stale session and return to login instead of looping "reconnecting".
      handleLogout()
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('message', onMessage)
    socket.on('history', onHistory)
    socket.on('userList', onUserList)
    socket.on('botStatus', onBotStatus)
    socket.on('botTyping', onBotTyping)
    socket.on('botStopTyping', onBotStopTyping)
    socket.on('joined', onJoinedAccess)
    socket.on('roomList', onRoomList)
    socket.on('roomJoined', onRoomJoined)
    socket.on('private:incoming', onPrivateIncoming)
    socket.on('private:requested', onPrivateRequested)
    socket.on('private:opened', onPrivateOpened)
    socket.on('private:declined', onPrivateDeclined)
    socket.on('private:message', onPrivateMessage)
    socket.on('private:closed', onPrivateClosed)
    socket.on('userJoined', onUserJoined)
    socket.on('userLeft', onUserLeft)
    socket.on('adminMessage', onAdminMessage)
    socket.on('kicked', onKicked)
    socket.on('banned', onBanned)
    socket.on('roleUpdated', onRoleUpdated)
    socket.on('error', onError)
    socket.on('sessionExpired', onSessionExpired)

    // Connect handling: if arriving from Login socket is already connected.
    // On page refresh it's not — connect and let onConnect fire rejoin.
    if (socket.connected) {
      setConnected(true)
      socket.emit('getHistory')
    } else {
      socket.auth = { token }
      socket.connect()
      // onConnect handler (registered above) will fire rejoin
    }

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('message', onMessage)
      socket.off('history', onHistory)
      socket.off('userList', onUserList)
      socket.off('botStatus', onBotStatus)
      socket.off('botTyping', onBotTyping)
      socket.off('botStopTyping', onBotStopTyping)
      socket.off('joined', onJoinedAccess)
      socket.off('roomList', onRoomList)
      socket.off('roomJoined', onRoomJoined)
      socket.off('private:incoming', onPrivateIncoming)
      socket.off('private:requested', onPrivateRequested)
      socket.off('private:opened', onPrivateOpened)
      socket.off('private:declined', onPrivateDeclined)
      socket.off('private:message', onPrivateMessage)
      socket.off('private:closed', onPrivateClosed)
      socket.off('userJoined', onUserJoined)
      socket.off('userLeft', onUserLeft)
      socket.off('adminMessage', onAdminMessage)
      socket.off('kicked', onKicked)
      socket.off('banned', onBanned)
      socket.off('roleUpdated', onRoleUpdated)
      socket.off('error', onError)
      socket.off('sessionExpired', onSessionExpired)
    }
  }, [token])

  // ── Helpers ──────────────────────────────────────────────
  let notifTimer = useRef(null)
  function showNotif(msg) {
    setNotification(msg)
    clearTimeout(notifTimer.current)
    notifTimer.current = setTimeout(() => setNotification(''), 3500)
  }

  function sendMessage(e) {
    e.preventDefault()
    if (!inputText.trim() || !connected) return
    socket.emit('message', { text: inputText.trim() })
    setInputText('')
  }

  function handleLogout() {
    socket.disconnect()
    onLogout()
    navigate('/', { replace: true })
  }

  function handleFullLogout() {
    // Hard reset: disconnect, wipe every stored token/session, return to login.
    // Fixes any stale/broken token stuck in storage.
    try {
      socket.removeAllListeners()
      socket.disconnect()
    } catch {}
    localStorage.removeItem('chatlly_token')
    localStorage.removeItem('chatlly_user')
    sessionStorage.removeItem('chatlly_token')
    sessionStorage.removeItem('chatlly_user')
    sessionStorage.removeItem('chatlly_panel_token')
    onLogout()
    navigate('/', { replace: true })
  }

  function handleContextMenu(e, targetUser) {
    e.preventDefault()
    if (targetUser.username === currentUser.username) return
    if (targetUser.role === 'bot' && currentUser.role !== 'admin') return

    const menuWidth = 200
    const menuHeight = 300
    setContextMenu({
      username: targetUser.username,
      role: targetUser.role,
      x: Math.min(e.clientX, window.innerWidth - menuWidth),
      y: Math.min(e.clientY, window.innerHeight - menuHeight)
    })
  }

  function handleAdminAction(event, data) {
    socket.emit(event, data)
    setContextMenu(null)
  }

  function switchRoom(roomId) {
    if (roomId === currentRoom) { setShowRooms(false); return }
    socket.emit('switchRoom', { roomId })
    setShowRooms(false)
  }

  function requestPrivate(username) {
    socket.emit('private:request', { targetUsername: username })
    setContextMenu(null)
  }

  function acceptPrivate() {
    if (incomingPrivate) socket.emit('private:accept', { fromUsername: incomingPrivate.from })
  }

  function declinePrivate() {
    if (incomingPrivate) socket.emit('private:decline', { fromUsername: incomingPrivate.from })
    setIncomingPrivate(null)
  }

  function sendPrivateMessage(room, text) {
    socket.emit('private:message', { room, text })
  }

  function closePrivate(room) {
    socket.emit('private:close', { room })
    setPrivateChats(prev => prev.filter(p => p.room !== room))
    setActivePrivate(cur => cur === room ? null : cur)
  }

  const _curRoomObj = rooms.find(r => r.id === currentRoom)
  const _curGroup = _curRoomObj ? _curRoomObj.group : 'israel'
  const canPost = accessLevel === 'full' || _curGroup === 'intl'

  const _cr = rooms.find(r => r.id === currentRoom)
  const currentRoomInfo = _cr
    ? { name: lang === 'en' && _cr.nameEn ? _cr.nameEn : _cr.name, emoji: _cr.emoji }
    : { name: lang === 'en' ? 'Main' : 'ראשי', emoji: '🏠' }

  return (
    <div className="chat-container" onClick={() => { setContextMenu(null); setShowEmoji(false) }}>

      {/* ── Header ── */}
      <div className="chat-header">
        <div className="chat-header-left">
          <button
            className="rooms-toggle"
            onClick={e => { e.stopPropagation(); setShowRooms(v => !v); socket.emit('getRooms') }}
            title={L.rooms}
          >
            {currentRoomInfo.emoji} {currentRoomInfo.name}
          </button>
          <button
            className="users-toggle"
            onClick={e => { e.stopPropagation(); setShowUserList(v => !v) }}
            title={L.connected}
          >
            👥 {users.length}
          </button>
          <label className="private-toggle" title="פתוח לצ'אט פרטי" onClick={e => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={openToPrivate}
              onChange={e => {
                const val = e.target.checked
                setOpenToPrivate(val)
                socket.emit('private:setOpen', { open: val })
              }}
            />
            <span>💬 {L.openToPrivate}</span>
          </label>
          <span
            className={`conn-dot ${connected ? 'conn-on' : 'conn-off'}`}
            title={connected ? L.online : L.disconnected}
          />
        </div>

        <BotStatus status={botStatus} />

        <div className="chat-header-right">
          <span className={`current-user-badge badge-${currentUser.role}`}>
            {currentUser.role === 'admin' ? '🛡️ ' : ''}{currentUser.username}
          </span>
          {currentUser.role === 'admin' && (
            <button className="admin-panel-btn" onClick={() => navigate('/admin')} title={L.kick}>⚙️</button>
          )}
          <button className="panel-link-btn" onClick={() => navigate('/panel')} title="לוח שליטה בבוטים">ADMIN</button>
          <button className="hard-logout-btn" onClick={handleFullLogout} title="ניקוי חיבור וחזרה למסך התחברות">LOGOUT</button>
          <button className="logout-btn" onClick={handleLogout}>{L.exit}</button>
        </div>
      </div>

      {/* ── Connection status ── */}
      {!connected && (
        <div className="disconnected-bar">⚠️ {L.reconnecting}...</div>
      )}

      {/* ── Notification ── */}
      {notification && (
        <div className="notification-bar">{notification}</div>
      )}

      {/* ── Main area ── */}
      <div className="chat-main">
        {showRooms && (
          <div className="rooms-panel" onClick={e => e.stopPropagation()}>
            <div className="rooms-header">
              <span>{L.rooms}</span>
              <button className="close-btn" onClick={() => setShowRooms(false)}>✕</button>
            </div>
            <div className="rooms-list">
              {groups.map(group => {
                const groupRooms = rooms.filter(r => r.group === group.id)
                if (groupRooms.length === 0) return null
                const gName = lang === 'en' && group.nameEn ? group.nameEn : group.name
                return (
                  <div key={group.id} className="group-block">
                    <div className="group-header">
                      <span className="group-emoji">{group.emoji}</span>
                      <span className="group-name">{gName}</span>
                      {group.filterSensitive && (
                        <span className="group-filter-badge" title={L.contentFilter}>🛡️</span>
                      )}
                    </div>
                    {groupRooms.map(room => (
                      <button
                        key={room.id}
                        className={`room-item ${room.id === currentRoom ? 'room-active' : ''}`}
                        onClick={() => switchRoom(room.id)}
                      >
                        <span className="room-emoji">{room.emoji}</span>
                        <span className="room-name">{lang === 'en' && room.nameEn ? room.nameEn : room.name}</span>
                        <span className="room-count">{roomCounts[room.id] || 0} 👥</span>
                        {room.id === currentRoom && <span className="room-check">●</span>}
                      </button>
                    ))}
                  </div>
                )
              })}
              {/* Fallback: rooms with no matching group */}
              {groups.length === 0 && rooms.map(room => (
                <button
                  key={room.id}
                  className={`room-item ${room.id === currentRoom ? 'room-active' : ''}`}
                  onClick={() => switchRoom(room.id)}
                >
                  <span className="room-emoji">{room.emoji}</span>
                  <span className="room-name">{lang === 'en' && room.nameEn ? room.nameEn : room.name}</span>
                  <span className="room-count">{roomCounts[room.id] || 0} 👥</span>
                  {room.id === currentRoom && <span className="room-check">●</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {showUserList && (
          <UserList
            users={users}
            currentUser={currentUser}
            botStatus={botStatus}
            onContextMenu={handleContextMenu}
            onClose={() => setShowUserList(false)}
          />
        )}

        <div className="messages-area" ref={messagesAreaRef} onScroll={handleScroll}>
          {messages.length === 0 && (
            <div className="empty-chat">{L.emptyChat}</div>
          )}
          {messages.map((msg, i) => (
            <Message
              key={msg.id || i}
              msg={msg}
              isOwn={msg.sender === currentUser.username}
              isAdmin={currentUser.role === 'admin'}
              onContextMenu={handleContextMenu}
            />
          ))}

          {typingBot && (
            <div className={`message msg-other typing-bubble msg-sender-${typingBot.toLowerCase()}`}>
              <div className="msg-header">
                <span className={`msg-sender sender-${typingBot.toLowerCase()}`}>
                  {typingBot === 'Riley' ? '💗 Riley' : '💜 Alex'}
                </span>
              </div>
              <div className="typing-dots"><span></span><span></span><span></span></div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Read-only banner (foreign visitor in a local group) ── */}
      {!canPost && (
        <div className="readonly-banner">{L.readOnlyBanner}</div>
      )}

      {/* ── Input ── */}
      <form className="chat-input-area" onSubmit={sendMessage}>
        <button
          type="button"
          className="emoji-btn"
          onClick={e => { e.stopPropagation(); setShowEmoji(v => !v) }}
          title="אימוג'ים"
        >
          😊
        </button>
        {showEmoji && (
          <div className="emoji-picker" onClick={e => e.stopPropagation()}>
            {EMOJI_LIST.map(em => (
              <button
                key={em}
                type="button"
                className="emoji-item"
                onClick={() => { setInputText(t => (t + em).slice(0, 500)); }}
              >
                {em}
              </button>
            ))}
          </div>
        )}
        <input
          type="text"
          className="chat-input"
          placeholder={!canPost ? L.readOnlyInput : (connected ? L.writeMessage : L.connectingShort)}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          maxLength={500}
          disabled={!connected || !canPost}
        />
        <button type="submit" className="send-btn" disabled={!connected || !canPost || !inputText.trim()}>
          {L.send}
        </button>
      </form>

      {/* ── Context menu ── */}
      {contextMenu && (
        <UserContextMenu
          contextMenu={contextMenu}
          currentUser={currentUser}
          onAction={handleAdminAction}
          onRequestPrivate={requestPrivate}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* ── Incoming private request ── */}
      {incomingPrivate && (
        <div className="private-prompt">
          <div className="private-prompt-box">
            <div className="private-prompt-text">
              💬 <strong>{incomingPrivate.from}</strong> {L.privateIncoming}
            </div>
            <div className="private-prompt-actions">
              <button className="pp-accept" onClick={acceptPrivate}>{L.accept}</button>
              <button className="pp-decline" onClick={declinePrivate}>{L.decline}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Private chat windows ── */}
      <div className="private-windows">
        {privateChats.map(pc => (
          <PrivateWindow
            key={pc.room}
            chat={pc}
            currentUser={currentUser}
            isAdmin={currentUser.role === 'admin'}
            minimized={activePrivate !== pc.room}
            onFocus={() => setActivePrivate(pc.room)}
            onSend={(text) => sendPrivateMessage(pc.room, text)}
            onClose={() => closePrivate(pc.room)}
            onBan={(username) => socket.emit('admin:ban', { username, reason: 'חסימה מפרטי', duration: 0 })}
            onBanIP={(username) => socket.emit('user:banIP', { username })}
          />
        ))}
      </div>
    </div>
  )
}

// ── Private chat window component ──
function PrivateWindow({ chat, currentUser, isAdmin, minimized, onFocus, onSend, onClose, onBan, onBanIP }) {
  const [text, setText] = useState('')
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView() }, [chat.messages])

  function submit(e) {
    e.preventDefault()
    if (!text.trim()) return
    onSend(text.trim())
    setText('')
  }

  if (minimized) {
    return (
      <div className="private-window minimized" onClick={onFocus}>
        <span>💬 {chat.with}</span>
        <button className="pw-close" onClick={(e) => { e.stopPropagation(); onClose() }}>✕</button>
      </div>
    )
  }

  return (
    <div className="private-window">
      <div className="pw-header">
        <span className="pw-title">💬 {chat.with}</span>
        <div className="pw-actions">
          {isAdmin && (
            <>
              <button className="pw-ban" onClick={() => onBan(chat.with)} title="חסימה רגילה">🚫</button>
              <button className="pw-banip" onClick={() => onBanIP(chat.with)} title="חסימת IP">🌐</button>
            </>
          )}
          <button className="pw-close" onClick={onClose} title="סגור">✕</button>
        </div>
      </div>
      <div className="pw-messages">
        {chat.messages.length === 0 && <div className="pw-empty">{L.privateStart}</div>}
        {chat.messages.map((m, i) => (
          <div key={m.id || i} className={`pw-msg ${m.sender === currentUser.username ? 'pw-own' : 'pw-other'}`}>
            <span className="pw-msg-text">{m.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="pw-input-area" onSubmit={submit}>
        <input
          className="pw-input"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={L.privateMessage}
          maxLength={500}
        />
        <button type="submit" className="pw-send">{L.send}</button>
      </form>
    </div>
  )
}
