export const CHAT_COLORS = ['#ffffff', '#7dd3fc', '#fda4af', '#86efac', '#fde047', '#c4b5fd', '#fdba74', '#67e8f9', '#f0abfc', '#bef264', '#a5b4fc'];
export function participantColor(metadata?: string) {
  try {
    const slot: unknown = (JSON.parse(metadata ?? '{}') as { chatColor?: unknown } | null)?.chatColor;
    if (typeof slot === 'number' && Number.isInteger(slot) && slot >= 0 && slot <= 10000) {
      return CHAT_COLORS[slot] ?? `hsl(${Math.round(slot * 137.508) % 360} 85% 78%)`;
    }
  } catch { /* Old credentials have no color metadata. */ }
  return '#ffffff';
}
