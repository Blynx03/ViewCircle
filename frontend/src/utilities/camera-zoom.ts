// Zoom is not yet declared in every TypeScript DOM library. Keep the extension
// local, and trust only capabilities/settings returned by the active camera.
export interface ZoomRange { min: number; max: number; step: number; value: number }
type ZoomSettings = MediaTrackSettings & { zoom?: number };
type ZoomConstraint = MediaTrackConstraintSet & { zoom?: number | ConstrainDouble };

export function readCameraZoom(track: MediaStreamTrack | null): ZoomRange | null {
  try {
    if (!track || track.readyState !== 'live' || !track.enabled || !track.applyConstraints) return null;
    const range = (track.getCapabilities?.() as MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number } })?.zoom;
    const value = (track.getSettings() as ZoomSettings).zoom;
    if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min <= 0 || range.max <= range.min ||
      typeof value !== 'number' || !Number.isFinite(value) || value < range.min || value > range.max) return null;
    const step = range.step === undefined || range.step === 0 ? (range.max - range.min) / 100 : range.step;
    if (!Number.isFinite(step) || step <= 0 || step > range.max - range.min) return null;
    return { min: range.min, max: range.max, step, value };
  } catch { return null; }
}

export function clampZoom(value: number, range: ZoomRange): number {
  const steps = Math.floor((range.max - range.min) / range.step + 1e-8);
  const index = Math.max(0, Math.min(steps, Math.round((value - range.min) / range.step)));
  return Number((range.min + index * range.step).toPrecision(12));
}

/** Native constraints modify the very same MediaStreamTrack that LiveKit sends.
 * One request at a time, at most eight per second; dragging coalesces to the
 * latest intent. Never acquires, stops, restarts, or republishes media.
 */
export class CameraZoomController {
  private track: MediaStreamTrack | null = null;
  private range: ZoomRange | null = null;
  private failed = new WeakSet<MediaStreamTrack>();
  private pending: number | null = null;
  private requested: number | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight = false;
  private disposed = false;
  private lastStart = -Infinity;
  private device = '';
  private intent: number | null = null;

  constructor(private getTrack: () => MediaStreamTrack | null, private update: (range: ZoomRange | null) => void) {}

  refresh = () => {
    if (this.disposed) return;
    const next = this.getTrack();
    const changed = next !== this.track;
    let device = '';
    try { const settings = next?.getSettings(); device = `${settings?.deviceId ?? ''}/${settings?.facingMode ?? ''}`; } catch { /* Unsupported camera. */ }
    const switchedDevice = changed && Boolean(this.device) && device !== this.device;
    if (changed) {
      this.track = next; this.pending = null; this.requested = null;
      clearTimeout(this.timer); this.timer = undefined;
    }
    this.device = device;
    const range = next && !this.failed.has(next) ? readCameraZoom(next) : null;
    this.publish(range);
    // Restarts of the same camera read back actual settings. A different camera
    // retains the user's relative zoom intent, snapped to its own valid range.
    if (switchedDevice && range && this.intent !== null) this.set(range.min + this.intent * (range.max - range.min));
  };

  private publish(range: ZoomRange | null) {
    const previous = this.range;
    this.range = range;
    if (previous?.min !== range?.min || previous?.max !== range?.max || previous?.step !== range?.step || previous?.value !== range?.value) this.update(range);
  }

  set = (value: number) => {
    if (!Number.isFinite(value) || this.disposed) return;
    this.refresh();
    if (!this.range) return;
    this.pending = clampZoom(value, this.range);
    this.requested = this.pending;
    this.intent = (this.pending - this.range.min) / (this.range.max - this.range.min);
    this.schedule();
  };

  step = (direction: number) => {
    this.refresh();
    if (!this.range) return;
    // A reported step may be very fine: +/- traverses the range in about 20
    // presses while remaining an exact multiple of the hardware step.
    const increment = this.range.step * Math.max(1, Math.round((this.range.max - this.range.min) / 20 / this.range.step));
    this.set((this.requested ?? this.range.value) + direction * increment);
  };

  private schedule() {
    if (this.disposed || this.inFlight || this.timer !== undefined || this.pending === null) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.apply(); }, Math.max(0, 125 - (Date.now() - this.lastStart)));
  }

  private async apply() {
    if (this.inFlight || this.disposed) return;
    this.refresh();
    const track = this.track; const value = this.pending;
    if (!track || !this.range || value === null || this.disposed) return;
    this.pending = null; this.inFlight = true; this.lastStart = Date.now();
    try {
      // applyConstraints replaces constraints, so retain existing capture options
      // and non-zoom advanced constraints instead of silently discarding them.
      const constraints = track.getConstraints();
      const advanced = (constraints.advanced ?? []).map((entry: ZoomConstraint) => {
        const copy = { ...entry }; delete copy.zoom; return copy;
      });
      const next: MediaTrackConstraints & { zoom?: ConstrainDouble } = { ...constraints, advanced: [...advanced, { zoom: value } as ZoomConstraint] };
      delete next.zoom;
      await track.applyConstraints(next);
      if (this.disposed || this.getTrack() !== track) return;
      const actual = readCameraZoom(track);
      // Some browsers silently ignore advanced constraints. Never show a
      // requested value as if the camera applied it, or leave a broken control.
      if (!actual || Math.abs(actual.value - value) > Math.max(actual.step / 2, 1e-7)) throw new Error('Zoom was not applied');
      this.publish(actual);
    } catch {
      this.failed.add(track);
      if (!this.disposed && this.getTrack() === track) { this.pending = null; this.requested = null; this.publish(null); }
    } finally {
      this.inFlight = false;
      if (this.pending === null) this.requested = null;
      if (!this.disposed) { this.refresh(); this.schedule(); }
    }
  }

  dispose() { this.disposed = true; clearTimeout(this.timer); this.pending = null; }
}
