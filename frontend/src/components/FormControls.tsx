import type { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithChildren } from 'react';
import { normalizeRoomCode } from '../utilities/room-code';

export function PrimaryButton({ children, className = '', ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button className={`button button-primary ${className}`} {...props}>{children}</button>;
}
export function TextField({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="field"><span>{label}</span><input {...props} /></label>;
}
export function RoomCodeInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { value: string; onChange: (value: string) => void }) {
  return <label className="field"><span>Room Code</span><input {...props} value={props.value} onChange={(event) => props.onChange(normalizeRoomCode(event.target.value))} className="code-input" autoCapitalize="characters" autoCorrect="off" inputMode="text" maxLength={4} /></label>;
}
export function PinInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <label className="field"><span>4-digit PIN</span><input {...props} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="one-time-code" /></label>;
}
