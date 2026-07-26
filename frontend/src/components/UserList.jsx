import { detectLang, t } from '../legal'

export default function UserList({ users, currentUser, botStatus, onContextMenu, onClose }) {
  const L = t(detectLang())
  return (
    <div className="user-list-panel">
      <div className="user-list-header">
        <span>{L.connected} ({users.length})</span>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="user-list-items">
        {/* Bots always first */}
        <div className="user-item user-bot">
          <span className={`dot ${botStatus.riley === 'online' ? 'dot-on' : 'dot-off'}`} />
          <span className="user-name-bot">💗 Riley</span>
          <span className="user-status-label">{botStatus.riley === 'online' ? 'online' : 'offline'}</span>
        </div>

        <div className="user-item user-bot">
          <span className={`dot ${botStatus.alex === 'online' ? 'dot-on' : 'dot-off'}`} />
          <span className="user-name-bot">💜 Alex</span>
          <span className="user-status-label">{botStatus.alex === 'online' ? 'online' : 'offline'}</span>
        </div>

        {users.length > 0 && <div className="user-divider" />}

        {users.map(u => (
          <div
            key={u.username}
            className={`user-item ${u.username === currentUser.username ? 'user-self' : 'user-other'}`}
            onContextMenu={e => {
              if (u.username !== currentUser.username) {
                onContextMenu(e, u)
              }
            }}
          >
            <span className="dot dot-on" />
            <span className={`user-name user-name-${u.role}`}>
              {u.role === 'admin' ? '🛡️ ' : ''}{u.username}
              {u.username === currentUser.username ? (t(detectLang()).dir === 'rtl' ? ' (אתה)' : ' (you)') : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
