export default function Message({ msg, isOwn, isAdmin, onContextMenu }) {
  function openMenu(e) {
    e.preventDefault()
    if (isOwn) return
    onContextMenu(e, { username: msg.sender, role: msg.role })
  }

  // Tap the sender name to open the menu (mobile-friendly — no right-click on phones)
  function tapSender(e) {
    e.stopPropagation()
    if (isOwn) return
    onContextMenu(e, { username: msg.sender, role: msg.role })
  }

  function senderIcon() {
    if (msg.role === 'admin') return '🛡️ '
    if (msg.sender === 'Riley') return '💗 '
    if (msg.sender === 'Alex') return '💜 '
    return ''
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div
      className={`message ${isOwn ? 'msg-own' : 'msg-other'} msg-role-${msg.role} msg-sender-${msg.sender.toLowerCase()}`}
      onContextMenu={openMenu}
    >
      <div className="msg-header">
        <span
          className={`msg-sender sender-${msg.role} sender-${msg.sender.toLowerCase()} ${!isOwn ? 'msg-sender-tap' : ''}`}
          onClick={tapSender}
          title={!isOwn ? 'הקש לאפשרויות' : ''}
        >
          {senderIcon()}{msg.sender}
        </span>
        <span className="msg-time">{fmtTime(msg.timestamp)}</span>
      </div>
      <div className="msg-text">{msg.text}</div>
    </div>
  )
}
