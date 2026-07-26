import { useState } from 'react'
import { detectLang, t } from '../legal'

export default function UserContextMenu({ contextMenu, currentUser, onAction, onRequestPrivate, onClose }) {
  const L = t(detectLang())
  const [showBanForm, setShowBanForm] = useState(false)
  const [banReason, setBanReason] = useState('')
  const [banDuration, setBanDuration] = useState(0)

  const { username, role } = contextMenu
  const isAdmin = currentUser.role === 'admin'
  const isBot = role === 'bot'

  function handleBanSubmit() {
    onAction('admin:ban', {
      username,
      reason: banReason || 'הפרת כללים',
      duration: Number(banDuration)
    })
    setShowBanForm(false)
  }

  function copyUsername() {
    navigator.clipboard?.writeText(username).catch(() => {})
    onClose()
  }

  return (
    <div
      className="ctx-menu"
      style={{ top: contextMenu.y, left: contextMenu.x }}
      onClick={e => e.stopPropagation()}
    >
      <div className="ctx-title">
        {role === 'admin' ? '🛡️ ' : role === 'bot' ? (username === 'Riley' ? '💗 ' : '💜 ') : ''}
        {username}
      </div>

      <button className="ctx-item" onClick={copyUsername}>
        📋 {L.copyName}
      </button>

      {!isBot && (
        <button className="ctx-item" onClick={() => { onRequestPrivate(username); }}>
          💬 {L.privateChat}
        </button>
      )}

      {isAdmin && !isBot && (
        <>
          <div className="ctx-divider" />

          <button className="ctx-item" onClick={() => { onAction('admin:kick', { username }); onClose() }}>
            🦶 {L.kick}
          </button>

          <button className="ctx-item ctx-danger" onClick={() => setShowBanForm(v => !v)}>
            🚫 {L.ban}
          </button>

          <button className="ctx-item ctx-danger" onClick={() => { onAction('user:banIP', { username }); onClose() }}>
            🌐 {L.banIP}
          </button>

          {showBanForm && (
            <div className="ctx-ban-form" onClick={e => e.stopPropagation()}>
              <input
                className="ctx-input"
                type="text"
                placeholder={L.banReason}
                value={banReason}
                onChange={e => setBanReason(e.target.value)}
                autoFocus
              />
              <select
                className="ctx-select"
                value={banDuration}
                onChange={e => setBanDuration(e.target.value)}
              >
                <option value={0}>{L.banForever}</option>
                <option value={30}>{L.ban30}</option>
                <option value={60}>{L.banHour}</option>
                <option value={1440}>{L.banDay}</option>
                <option value={10080}>{L.banWeek}</option>
              </select>
              <button className="ctx-ban-confirm" onClick={handleBanSubmit}>
                {L.confirmBan}
              </button>
            </div>
          )}

          {role !== 'admin' && (
            <button className="ctx-item" onClick={() => { onAction('admin:makeAdmin', { username }); onClose() }}>
              ⬆️ {L.makeAdmin}
            </button>
          )}
        </>
      )}
    </div>
  )
}
