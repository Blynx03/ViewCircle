/** Static identity stays in normal flow, above the temporary status/action row. */
export function HostRoomHeader({ roomCode, people, connection, connected, showCode = true }: {
  roomCode: string; people: number; connection: string; connected: boolean; showCode?: boolean;
}) {
  return <header className="live-header host-room-header">
    <strong>ViewCircle</strong>
    <span className="host-room-code" aria-label={showCode ? `Room code ${roomCode}` : undefined}>{showCode ? <>Room <strong>{roomCode}</strong></> : 'Starting…'}</span>
    <span className="host-people">{people} people</span>
    <span className="live-badge">LIVE</span>
    <span className={`connection ${connected ? 'ok' : ''}`} title={connection}>{connection}</span>
  </header>;
}
