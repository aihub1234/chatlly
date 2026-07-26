import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import socket from '../socket'

export default function AdminPanel({ user, token, onLogout }) {
  const [banList, setBanList] = useState([])
  const [logs, setLogs] = useState([])
  const [stats, setStats] = useState(null)
  const [activeTab, setActiveTab] = useState('bans')
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const navigate = useNavigate()

  function showToast(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3000)
  }

  useEffect(() => {
    if (!socket.connected) {
      socket.auth = { token }
      socket.connect()
      socket.once('connect', () => {
        socket.emit('rejoin', { token })
        fetchData()
      })
    } else {
      fetchData()
    }

    socket.on('banList', setBanList)
    socket.on('chatLogs', setLogs)
    socket.on('stats', setStats)
    socket.on('adminMessage', ({ message }) => showToast(`🔔 ${message}`))

    return () => {
      socket.off('banList')
      socket.off('chatLogs')
      socket.off('stats')
      socket.off('adminMessage')
    }
  }, [])

  function fetchData() {
    socket.emit('admin:getBanList')
    socket.emit('admin:getLogs')
    socket.emit('admin:getStats')
  }

  function handleUnban(username) {
    socket.emit('admin:unban', { username })
    setBanList(prev => prev.filter(b => b.username !== username))
  }

  function handleLogout() {
    socket.disconnect()
    onLogout()
    navigate('/', { replace: true })
  }

  function fmt(ts) {
    return new Date(ts).toLocaleString('he-IL', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h2>⚙️ לוח ניהול</h2>
        <div className="admin-header-actions">
          <button className="btn-secondary" onClick={() => navigate('/chat')}>← צ'אט</button>
          <button className="btn-secondary" onClick={fetchData}>🔄 רענן</button>
          <button className="logout-btn" onClick={handleLogout}>יציאה</button>
        </div>
      </div>

      {toast && <div className="notification-bar">{toast}</div>}

      {/* Stats */}
      {stats && (
        <div className="admin-stats">
          <div className="stat-card">
            <div className="stat-val">{stats.totalMessages}</div>
            <div className="stat-label">הודעות</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{stats.totalUsers}</div>
            <div className="stat-label">משתמשים</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{stats.activeBans}</div>
            <div className="stat-label">חסומים</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="admin-tabs">
        <button
          className={`tab ${activeTab === 'bans' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('bans')}
        >🚫 חסומים ({banList.length})</button>
        <button
          className={`tab ${activeTab === 'logs' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >📜 לוגים ({logs.length})</button>
      </div>

      {/* Content */}
      <div className="admin-content">
        {activeTab === 'bans' && (
          <div className="ban-list">
            {banList.length === 0 && (
              <div className="empty-state">אין חסומים כרגע ✓</div>
            )}
            {banList.map(ban => (
              <div key={ban.id} className="ban-item">
                <div className="ban-info">
                  <span className="ban-username">
                    {ban.ip && !ban.username ? `🌐 IP: ${ban.ip}` : `👤 ${ban.username}`}
                  </span>
                  <span className="ban-reason">📌 {ban.reason || 'ללא סיבה'}</span>
                  <span className="ban-meta">
                    {ban.duration === 0 ? '♾️ לצמיתות' : `⏱️ ${ban.duration} דקות`}
                    &nbsp;·&nbsp;{fmt(ban.banned_at)}
                    &nbsp;·&nbsp;ע"י {ban.banned_by || 'מנהל'}
                  </span>
                </div>
                {ban.username && (
                  <button className="unban-btn" onClick={() => handleUnban(ban.username)}>
                    שחרר
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="logs-list">
            {logs.length === 0 && <div className="empty-state">אין לוגים</div>}
            {logs.map((log, i) => (
              <div key={i} className="log-item">
                <span className="log-time">{fmt(log.timestamp)}</span>
                <span className={`log-sender log-role-${log.role}`}>{log.sender}</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
