import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import ChatRoom from './pages/ChatRoom'
import AdminPanel from './pages/AdminPanel'
import ControlPanel from './pages/ControlPanel'

export default function App() {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Prefer localStorage (remember me) then sessionStorage
    const savedToken = localStorage.getItem('chatlly_token') || sessionStorage.getItem('chatlly_token')
    const savedUser = localStorage.getItem('chatlly_user') || sessionStorage.getItem('chatlly_user')
    if (savedToken && savedUser) {
      try {
        setToken(savedToken)
        setUser(JSON.parse(savedUser))
      } catch {
        localStorage.clear()
        sessionStorage.clear()
      }
    }
    setLoading(false)
  }, [])

  function onLogin(user, token, rememberMe = true) {
    setUser(user)
    setToken(token)
    const store = rememberMe ? localStorage : sessionStorage
    const other = rememberMe ? sessionStorage : localStorage
    store.setItem('chatlly_token', token)
    store.setItem('chatlly_user', JSON.stringify(user))
    other.removeItem('chatlly_token')
    other.removeItem('chatlly_user')
  }

  function onUpdateUser(updatedUser) {
    setUser(updatedUser)
    const str = JSON.stringify(updatedUser)
    if (localStorage.getItem('chatlly_token')) localStorage.setItem('chatlly_user', str)
    else sessionStorage.setItem('chatlly_user', str)
  }

  function onLogout() {
    setUser(null)
    setToken(null)
    localStorage.removeItem('chatlly_token')
    localStorage.removeItem('chatlly_user')
    sessionStorage.removeItem('chatlly_token')
    sessionStorage.removeItem('chatlly_user')
  }

  if (loading) return null

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={user ? <Navigate to="/chat" replace /> : <Login onLogin={onLogin} />}
        />
        <Route
          path="/chat"
          element={user ? <ChatRoom user={user} token={token} onLogout={onLogout} onUpdateUser={onUpdateUser} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/admin"
          element={user?.role === 'admin' ? <AdminPanel user={user} token={token} onLogout={onLogout} /> : <Navigate to="/" replace />}
        />
        <Route path="/panel" element={<ControlPanel />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
