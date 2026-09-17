// Only the public room code and optional display name travel to Safari.
// A fragment keeps the name out of the HTTP request; no credentials or PIN.
export function sessionJoinLink(origin: string, roomCode: string, name = '') {
  const url = new URL(`/join/${encodeURIComponent(roomCode)}`, origin);
  if (name.trim()) url.hash = new URLSearchParams({ name: name.trim().slice(0, 40) }).toString();
  return url.toString();
}
export function guestNameFromFragment(hash: string) {
  return (new URLSearchParams(hash.replace(/^#/, '')).get('name') ?? '').slice(0, 40);
}
