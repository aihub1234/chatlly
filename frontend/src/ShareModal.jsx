import { useEffect, useState } from 'react'
import { t } from '../legal'

/**
 * Share sheet: captures a snapshot of the current chat and hands it to the
 * user's social apps with the FOMO caption pre-written.
 *
 * The capture is done with the browser's own canvas so there is no extra
 * dependency and nothing leaves the device unless the user shares it.
 */
export default function ShareModal({ open, onClose, lang, messages = [], roomName }) {
  const L = t(lang)
  const [imageUrl, setImageUrl] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [status, setStatus] = useState('preparing')
  const [toast, setToast] = useState('')

  const siteUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const caption = `${L.shareFomoText}\n${siteUrl}`

  useEffect(() => {
    if (!open) return
    setStatus('preparing')
    setImageUrl(null)
    setImageFile(null)

    // Draw the last few messages onto a canvas — a clean, readable snapshot
    // rather than a raw screen grab (which browsers do not allow anyway).
    const timer = setTimeout(() => {
      try {
        const isRTL = L.dir === 'rtl'
        const W = 1080, H = 1080
        const canvas = document.createElement('canvas')
        canvas.width = W; canvas.height = H
        const ctx = canvas.getContext('2d')

        // Background
        const grad = ctx.createLinearGradient(0, 0, W, H)
        grad.addColorStop(0, '#16121f')
        grad.addColorStop(1, '#0d0d0d')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, W, H)

        // Header
        ctx.fillStyle = '#9d6bff'
        ctx.font = 'bold 62px system-ui, sans-serif'
        ctx.textAlign = isRTL ? 'right' : 'left'
        const hx = isRTL ? W - 70 : 70
        ctx.fillText('Chatlly', hx, 110)

        ctx.fillStyle = '#8a8a96'
        ctx.font = '34px system-ui, sans-serif'
        ctx.fillText(roomName || '', hx, 165)

        // Messages
        const shown = messages.filter(m => m && m.text).slice(-7)
        let y = 250
        ctx.textAlign = isRTL ? 'right' : 'left'

        for (const m of shown) {
          if (y > H - 190) break
          ctx.fillStyle = m.role === 'bot' ? '#ff7ac6' : '#6cc7ff'
          ctx.font = 'bold 30px system-ui, sans-serif'
          ctx.fillText(String(m.sender || ''), hx, y)
          y += 44

          ctx.fillStyle = '#ececf1'
          ctx.font = '32px system-ui, sans-serif'
          const words = String(m.text).split(' ')
          let line = ''
          const maxWidth = W - 140
          for (const w of words) {
            const test = line ? line + ' ' + w : w
            if (ctx.measureText(test).width > maxWidth && line) {
              ctx.fillText(line, hx, y)
              y += 42
              line = w
              if (y > H - 190) break
            } else {
              line = test
            }
          }
          if (line && y <= H - 190) { ctx.fillText(line, hx, y); y += 42 }
          y += 26
        }

        // Footer call to action
        ctx.fillStyle = '#9d6bff'
        ctx.fillRect(0, H - 130, W, 130)
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 40px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(siteUrl.replace(/^https?:\/\//, ''), W / 2, H - 55)

        canvas.toBlob(blob => {
          if (!blob) { setStatus('failed'); return }
          setImageUrl(URL.createObjectURL(blob))
          try {
            setImageFile(new File([blob], 'chatlly.png', { type: 'image/png' }))
          } catch { /* File constructor unsupported — link-only sharing */ }
          setStatus('ready')
        }, 'image/png')
      } catch {
        setStatus('failed')
      }
    }, 60)

    return () => clearTimeout(timer)
  }, [open, messages, lang, roomName, siteUrl, L.dir])

  if (!open) return null

  function flash(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  async function copyCaption() {
    try { await navigator.clipboard.writeText(caption); flash(L.shareCopied) } catch { /* ignore */ }
  }

  // Native sheet: the only path that can attach the image directly on mobile
  async function nativeShare() {
    try {
      if (imageFile && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
        await navigator.share({ files: [imageFile], text: caption })
        return
      }
      if (navigator.share) { await navigator.share({ text: caption, url: siteUrl }); return }
      copyCaption()
    } catch { /* user cancelled */ }
  }

  // Networks that accept a prefilled link/text via URL
  function openNetwork(kind) {
    const text = encodeURIComponent(caption)
    const url = encodeURIComponent(siteUrl)
    const targets = {
      whatsapp: `https://wa.me/?text=${text}`,
      telegram: `https://t.me/share/url?url=${url}&text=${encodeURIComponent(L.shareFomoText)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`,
      x:        `https://twitter.com/intent/tweet?text=${text}`,
    }
    // Instagram and TikTok have no web share endpoint: copy the caption and
    // save the image so the user only has to paste inside the app.
    if (kind === 'instagram' || kind === 'tiktok') {
      copyCaption()
      downloadImage()
      return
    }
    window.open(targets[kind], '_blank', 'noopener,noreferrer')
  }

  function downloadImage() {
    if (!imageUrl) return
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = 'chatlly.png'
    a.click()
  }

  return (
    <div className="share-overlay" onClick={onClose}>
      <div className="share-modal" dir={L.dir} onClick={e => e.stopPropagation()}>
        <div className="share-header">
          <h3>{L.shareTitle}</h3>
          <button className="share-close" onClick={onClose} aria-label={L.close}>✕</button>
        </div>

        <div className="share-preview">
          {status === 'preparing' && <div className="share-loading">{L.sharePreparing}</div>}
          {status === 'ready' && <img src={imageUrl} alt="" />}
          {status === 'failed' && <div className="share-loading">{L.shareFailed}</div>}
        </div>

        <p className="share-hint">{L.shareHint}</p>

        <div className="share-networks">
          <button onClick={nativeShare} className="share-net share-net-primary">
            <span className="share-ico">📲</span><span>{L.shareNative}</span>
          </button>
          <button onClick={() => openNetwork('whatsapp')} className="share-net">
            <span className="share-ico">💬</span><span>WhatsApp</span>
          </button>
          <button onClick={() => openNetwork('instagram')} className="share-net">
            <span className="share-ico">📸</span><span>Instagram</span>
          </button>
          <button onClick={() => openNetwork('tiktok')} className="share-net">
            <span className="share-ico">🎵</span><span>TikTok</span>
          </button>
          <button onClick={() => openNetwork('facebook')} className="share-net">
            <span className="share-ico">👍</span><span>Facebook</span>
          </button>
          <button onClick={() => openNetwork('telegram')} className="share-net">
            <span className="share-ico">✈️</span><span>Telegram</span>
          </button>
        </div>

        <div className="share-actions">
          <button onClick={copyCaption}>{L.shareCopyLink}</button>
          <button onClick={downloadImage} disabled={!imageUrl}>{L.shareDownload}</button>
        </div>

        {toast && <div className="share-toast">{toast}</div>}
      </div>
    </div>
  )
}
