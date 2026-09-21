/** Static identity stays in normal flow, above the temporary status/action row. */
export function HostRoomHeader({ roomCode, people, connection, connected }: {
  roomCode: string; people: number; connection: string; connected: boolean;
}) {
  return <header className="live-header host-room-header">
    <strong>ViewCircle</strong>
    <span className="host-room-code" aria-label={`Room code ${roomCode}`}>Room <strong>{roomCode}</strong></span>
    <span className="host-people">{people} people</span>
    <span className="live-badge">LIVE</span>
    <span className={`connection ${connected ? 'ok' : ''}`} title={connection}>{connection}</span>
  </header>;
}
