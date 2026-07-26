import { io } from 'socket.io-client'

// ─────────────────────────────────────────────────────────────
// Local development — the backend runs on port 3900.
// VITE_BACKEND_URL can override this if needed.
// ─────────────────────────────────────────────────────────────
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3900'

const socket = io(BACKEND_URL, {
  autoConnect: false,
  auth: {}
})

export default socket
