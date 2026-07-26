export default function BotStatus({ status }) {
  return (
    <div className="bot-status-bar">
      <span className={`bot-chip ${status.riley === 'online' ? 'chip-on' : 'chip-off'}`}>
        💗 Riley
      </span>
      <span className={`bot-chip ${status.alex === 'online' ? 'chip-on' : 'chip-off'}`}>
        💜 Alex
      </span>
    </div>
  )
}
