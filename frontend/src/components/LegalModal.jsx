import { t } from '../legal'

// Simple modal that shows Terms of Service or Privacy Policy.
// Isolated component — renders only when opened from the login screen.
export default function LegalModal({ kind, lang, onClose }) {
  const L = t(lang)
  if (!kind) return null

  const title = kind === 'tos' ? L.tosTitle : L.privTitle
  const body = kind === 'tos' ? L.tosBody : L.privBody

  return (
    <div className="legal-overlay" onClick={onClose}>
      <div
        className="legal-modal"
        dir={L.dir}
        onClick={e => e.stopPropagation()}
      >
        <div className="legal-header">
          <h2>{title}</h2>
          <button className="legal-close" onClick={onClose} aria-label={L.close}>✕</button>
        </div>

        <div className="legal-content">
          {body.map(([heading, text], i) => (
            <div key={i} className="legal-section">
              <h3>{heading}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>

        <div className="legal-footer">
          <button className="legal-ok" onClick={onClose}>{L.close}</button>
        </div>
      </div>
    </div>
  )
}
