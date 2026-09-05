import { createLocalAudioTrack, createLocalVideoTrack, type LocalAudioTrack, type LocalVideoTrack } from 'livekit-client';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { PermissionHelp, type MediaPermissionKind } from '../components/PermissionHelp';
import { ControlButton, OrientationControl } from '../components/SessionControls';
import { FriendlyError } from '../components/StatusViews';
import { useFullscreen } from '../hooks/useFullscreen';
import { useLiveRoom } from '../hooks/useLiveRoom';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useOrientation } from '../hooks/useOrientation';
import { usePermissionState } from '../hooks/usePermissionState';
import { useWakeLock } from '../hooks/useWakeLock';
import type { Credentials, PublicSession } from '../types/session';

export function HostRoomPage() {
  const { roomCode = '' } = useParams(); const navigate = useNavigate();
  const [session, setSession] = useState<PublicSession | null>(null); const [preview, setPreview] = useState<LocalVideoTrack | null>(null);
  const [tracks, setTracks] = useState<Array<LocalAudioTrack | LocalVideoTrack>>([]); const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [microphone, setMicrophone] = useState<LocalAudioTrack | null>(null); const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraCount, setCameraCount] = useState(0); const [busyPermission, setBusyPermission] = useState<MediaPermissionKind | null>(null); const [permissionHelp, setPermissionHelp] = useState<MediaPermissionKind | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [drawer, setDrawer] = useState<'share' | 'guests' | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false); const [locked, setLocked] = useState(false); const previewElement = useRef<HTMLVideoElement>(null);
  const previewTrackRef = useRef<LocalVideoTrack | null>(null); const publishedTracksRef = useRef<Array<LocalAudioTrack | LocalVideoTrack>>([]);
  const orientation = useOrientation(); const fullscreen = useFullscreen(); const online = useNetworkStatus();
  const cameraPermission = usePermissionState('camera'); const microphonePermission = usePermissionState('microphone');
  const releaseOrientation = orientation.release;
  const live = useLiveRoom(credentials, tracks, facingMode); useWakeLock(Boolean(credentials));
  const isLive = Boolean(credentials);

  useEffect(() => { void api.getSession(roomCode).then((value) => { setSession(value); setLocked(value.locked); }).catch((reason: Error) => setError(reason.message)); }, [roomCode]);
  useEffect(() => {
    previewTrackRef.current = preview;
    if (preview && previewElement.current) preview.attach(previewElement.current);
    return () => { if (preview) preview.detach(); };
  }, [preview]);
  useEffect(() => { publishedTracksRef.current = tracks; }, [tracks]);
  const microphoneRef = useRef<LocalAudioTrack | null>(null);
  useEffect(() => { microphoneRef.current = microphone; }, [microphone]);
  useEffect(() => () => { previewTrackRef.current?.stop(); microphoneRef.current?.stop(); publishedTracksRef.current.forEach((track) => track.stop()); releaseOrientation(); }, [releaseOrientation]);

  const enableCamera = async () => {
    setBusyPermission('camera'); setError('');
    try {
      const track = await createLocalVideoTrack({ facingMode, resolution: { width: 1280, height: 720, frameRate: 24 } });
      setPreview(track); cameraPermission.setState('granted'); setPermissionHelp(null);
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCameraCount(devices.filter((device) => device.kind === 'videoinput').length);
      } catch { setCameraCount(1); }
    } catch (reason) {
      cameraPermission.setState('denied');
      if (reason instanceof DOMException && reason.name === 'NotFoundError') setError('No camera was found on this device.');
      else setPermissionHelp('camera');
    } finally { setBusyPermission(null); }
  };
  const chooseCamera = async (next: 'user' | 'environment') => {
    if (!preview) return; setBusyPermission('camera'); setError('');
    try { await preview.restartTrack({ facingMode: next }); setFacingMode(next); }
    catch { setError(`${next === 'user' ? 'Front' : 'Rear'} camera is not available. Your current camera is still ready.`); }
    finally { setBusyPermission(null); }
  };
  const enableMicrophone = async () => {
    setBusyPermission('microphone'); setError('');
    try {
      const track = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      setMicrophone(track); microphonePermission.setState('granted'); setPermissionHelp(null);
    } catch (reason) {
      microphonePermission.setState('denied');
      if (reason instanceof DOMException && reason.name === 'NotFoundError') setError('No microphone was found on this device. You can still share your camera.');
      else setPermissionHelp('microphone');
    } finally { setBusyPermission(null); }
  };
  const start = async () => {
    if (!preview) return; setBusy(true); setError('');
    try {
      const nextTracks: Array<LocalAudioTrack | LocalVideoTrack> = [preview];
      if (microphone) nextTracks.push(microphone);
      setTracks(nextTracks); setCredentials(await api.hostToken(roomCode));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start the session.'); }
    finally { setBusy(false); }
  };
  const toggleLock = async () => { const result = await api.lock(roomCode, !locked); setLocked(result.locked); };
  const end = async () => {
    setBusy(true);
    try { await api.end(roomCode); tracks.forEach((track) => track.stop()); orientation.release(); void navigate('/ended', { replace: true }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not end the session.'); setBusy(false); }
  };
  const shareUrl = `${window.location.origin}/join/${roomCode}`;
  const share = async () => {
    if (navigator.share) await navigator.share({ title: 'Join my ViewCircle', text: `Join my ViewCircle. Room code: ${roomCode}`, url: shareUrl });
    else await navigator.clipboard.writeText(shareUrl);
  };

  if (!session) return <AppLayout><section className="center-card">{error ? <FriendlyError message={error} action="Return home and create another session." /> : <p>Preparing your circle…</p>}</section></AppLayout>;
  if (!isLive) return <AppLayout><section className="setup-page"><div className="room-chip">ROOM <strong>{roomCode}</strong></div><h1>Set up your camera and mic</h1><p>Nothing is broadcasting yet. You control what ViewCircle can use.</p>
    <div className="media-permission-list">
      <section className={`media-permission-card ${preview ? 'is-ready' : ''}`}><div><span className="media-icon" aria-hidden="true">◉</span><span><h2>Camera</h2><p>{preview ? 'Camera Ready ✓' : cameraPermission.state === 'denied' ? 'Camera access is currently blocked.' : 'Camera access is needed to share your view.'}</p></span></div>
        {!preview && <button className="button button-primary" onClick={() => void enableCamera()} disabled={Boolean(busyPermission)}>{busyPermission === 'camera' ? 'ENABLING…' : 'ENABLE CAMERA'}</button>}
      </section>
      <section className={`media-permission-card ${microphone ? 'is-ready' : ''}`}><div><span className="media-icon" aria-hidden="true">●</span><span><h2>Microphone</h2><p>{microphone ? 'Microphone Ready ✓' : microphonePermission.state === 'denied' ? 'Microphone access is currently blocked.' : 'Microphone access lets everyone hear you.'}</p></span></div>
        {!microphone && <button className="button button-primary" onClick={() => void enableMicrophone()} disabled={Boolean(busyPermission)}>{busyPermission === 'microphone' ? 'ENABLING…' : 'ENABLE MICROPHONE'}</button>}
      </section>
    </div>
    {preview && <div className="preview-frame"><video ref={previewElement} muted playsInline /></div>}
    {preview && cameraCount > 1 && <fieldset className="camera-choice"><legend>Which camera do you want to use?</legend><button type="button" className={`button ${facingMode === 'user' ? 'button-primary' : ''}`} onClick={() => void chooseCamera('user')} disabled={Boolean(busyPermission)}>FRONT CAMERA</button><button type="button" className={`button ${facingMode === 'environment' ? 'button-primary' : ''}`} onClick={() => void chooseCamera('environment')} disabled={Boolean(busyPermission)}>REAR CAMERA</button></fieldset>}
    {error && <FriendlyError message={error} />}
    <div className="setup-controls"><OrientationControl value={orientation.orientation} choose={(value) => void orientation.choose(value)} /></div>
    {orientation.message && <p className="hint">{orientation.message}</p>}
    <button className="button button-live" onClick={() => void start()} disabled={busy || !preview}>{busy ? 'STARTING…' : 'START SESSION'}</button>
    {!microphone && preview && <p className="hint">You can start without a microphone and continue sharing your camera.</p>}
    {permissionHelp && <PermissionHelp kind={permissionHelp} busy={busyPermission === permissionHelp} retry={() => void (permissionHelp === 'camera' ? enableCamera() : enableMicrophone())} close={() => setPermissionHelp(null)} />}
  </section></AppLayout>;

  return <LiveHostView roomCode={roomCode} live={live} online={online} locked={locked} drawer={drawer} setDrawer={setDrawer} orientation={orientation} fullscreen={fullscreen} shareUrl={shareUrl} share={share} toggleLock={toggleLock} confirmEnd={confirmEnd} setConfirmEnd={setConfirmEnd} end={end} busy={busy} error={error} />;
}

type LiveHook = ReturnType<typeof useLiveRoom>;
function LiveHostView({ roomCode, live, online, locked, drawer, setDrawer, orientation, fullscreen, shareUrl, share, toggleLock, confirmEnd, setConfirmEnd, end, busy, error }: {
  roomCode: string; live: LiveHook; online: boolean; locked: boolean; drawer: 'share' | 'guests' | null; setDrawer: (value: 'share' | 'guests' | null) => void;
  orientation: ReturnType<typeof useOrientation>; fullscreen: ReturnType<typeof useFullscreen>; shareUrl: string; share: () => Promise<void>; toggleLock: () => Promise<void>; confirmEnd: boolean; setConfirmEnd: (value: boolean) => void; end: () => Promise<void>; busy: boolean; error: string;
}) {
  const guests = useMemo(() => live.participants.filter((person) => person.identity.startsWith('guest-')), [live.participants]);
  const local = live.participants.find((person) => person.identity.startsWith('host-'));
  const [micHelp, setMicHelp] = useState(false); const [micBusy, setMicBusy] = useState(false); const [mediaError, setMediaError] = useState('');
  const toggleMic = async () => {
    setMicBusy(true); setMediaError('');
    try { await live.setMic(!local?.micOn); setMicHelp(false); }
    catch { setMicHelp(true); }
    finally { setMicBusy(false); }
  };
  const toggleCamera = async () => { setMediaError(''); try { await live.toggleCamera(); } catch { setMediaError('Camera could not be changed. Check camera access and try again.'); } };
  const flipCamera = async () => { setMediaError(''); try { await live.flipCamera(); } catch { setMediaError('Another camera is not available. Your current camera remains connected.'); } };
  return <main className="live-page"><header className="live-header"><strong>ViewCircle</strong><span className="live-badge">LIVE</span><span>{guests.length + 1} people</span><span className={`connection ${online && live.connection === 'connected' ? 'ok' : ''}`}>{!online ? 'No internet' : live.connection}</span></header>
    <div className="room-overlay">Room <strong>{roomCode}</strong></div>
    <section className="video-stage"><video ref={live.videoRef} muted playsInline className="host-video mirror-local" /><div ref={live.audioContainerRef} hidden />
      {(error || mediaError) && <div className="floating-error">{error || mediaError}</div>}
    </section>
    <nav className="controls-bar" aria-label="Host controls">
      <ControlButton label={micBusy ? 'Requesting…' : local?.micOn ? 'Mic On' : 'Mic Off'} active={Boolean(local?.micOn)} disabled={micBusy} onClick={() => void toggleMic()} />
      <ControlButton label={live.hasVideo ? 'Camera On' : 'Camera Off'} active={live.hasVideo} onClick={() => void toggleCamera()} />
      <ControlButton label={live.soundOn ? 'Sound On' : 'Sound Off'} active={live.soundOn} onClick={live.toggleSound} />
      <ControlButton label="Flip" onClick={() => void flipCamera()} />
      <OrientationControl value={orientation.orientation} choose={(value) => void orientation.choose(value)} />
      <ControlButton label="Full Screen" active={fullscreen.active} onClick={() => void fullscreen.toggle()} />
      <ControlButton label={`Guests ${guests.length}`} onClick={() => setDrawer('guests')} />
      <ControlButton label="Share" onClick={() => setDrawer('share')} />
      <ControlButton label={locked ? 'Unlock' : 'Lock'} active={locked} onClick={() => void toggleLock()} />
      <ControlButton label="End Session" danger onClick={() => setConfirmEnd(true)} />
    </nav>
    {drawer && <div className="sheet-backdrop" onClick={() => setDrawer(null)}><section className="bottom-sheet" onClick={(event) => event.stopPropagation()}><button className="sheet-close" onClick={() => setDrawer(null)}>Close</button>
      {drawer === 'share' ? <><h2>Invite Guests</h2><div className="share-code">{roomCode}</div><QRCodeSVG value={shareUrl} size={150} bgColor="transparent" fgColor="#eef2ff" /><p>PIN is never included in this link.</p><button className="button button-primary" onClick={() => void share()}>SHARE LINK</button></>
      : <><h2>Guests — {guests.length}</h2><div className="guest-list">{guests.length === 0 && <p>No Guests yet.</p>}{guests.map((guest) => <div key={guest.identity}><span><strong>{guest.name}</strong><small>{guest.speaking ? 'Speaking' : guest.micOn ? 'Mic On' : 'Muted'}</small></span><button onClick={() => void api.remove(roomCode, guest.identity)}>Remove</button></div>)}</div></>}
    </section></div>}
    {confirmEnd && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true"><h2>End this session?</h2><p>Everyone will be disconnected.</p><div><button className="button" onClick={() => setConfirmEnd(false)}>CANCEL</button><button className="button button-danger" disabled={busy} onClick={() => void end()}>{busy ? 'ENDING…' : 'END SESSION'}</button></div></div></div>}
    {micHelp && <PermissionHelp kind="microphone" busy={micBusy} retry={() => void toggleMic()} close={() => setMicHelp(false)} />}
  </main>;
}
