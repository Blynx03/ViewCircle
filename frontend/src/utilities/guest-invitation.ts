/** Deliberately carries only the four-character Guest credential. */
export function guestInvitationUrl(code: string) {
  return new URL(`/join?room=${encodeURIComponent(code)}`, window.location.origin).toString();
}
export async function copyGuestCode(code: string) {
  if (!navigator.clipboard?.writeText) throw new Error('Copy is unavailable. You can share the room code shown here.');
  await navigator.clipboard.writeText(code);
}
export async function shareGuestInvitation(code: string) {
  const url = guestInvitationUrl(code);
  if (navigator.share) await navigator.share({ title: 'Join my ViewCircle', url });
  else {
    if (!navigator.clipboard?.writeText) throw new Error('Sharing is unavailable. You can share the room code shown here.');
    await navigator.clipboard.writeText(url);
  }
}
