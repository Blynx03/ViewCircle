import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionState as LKConnectionState, LocalAudioTrack, LocalVideoTrack, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Room, RoomEvent, Track, TrackPublication } from 'livekit-client';
import { isIOSStandalone } from '../utilities/browser-environment';
import { api } from '../api/client';
import { isPictureInPicture } from './usePictureInPicture';
import type { Credentials } from '../types/session';

const installedIOSGuest = (identity: string) => identity.startsWith('guest-') && isIOSStandalone(navigator, window.matchMedia?.('(display-mode: standalone)').matches ?? false);

export interface ParticipantView { identity: string; name: string; micOn: boolean; speaking: boolean }
const NO_LOCAL_TRACKS: PublishableLocalTrack[] = [];

export type PublishableLocalTrack = LocalAudioTrack | LocalVideoTrack;
export function useLiveRoom(credentials: Credentials | null, localTracks: PublishableLocalTrack[] = NO_LOCAL_TRACKS, initialFacingMode: 'user' | 'environment' = 'user', roomCode?: string) {
  const roomRef = useRef<Room | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('connecting');
  const [participants, setParticipants] = useState<ParticipantView[]>([]);
  const [hasVideo, setHasVideo] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  const cameraFacingRef = useRef<'user' | 'environment'>(initialFacingMode);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [mediaMessage, setMediaMessage] = useState('');
  const [videoPaused, setVideoPaused] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const refresh = useCallback((room: Room) => {
    const all = [room.localParticipant, ...room.remoteParticipants.values()];
    setParticipants(all.map((participant) => ({
      identity: participant.identity, name: participant.name || 'Guest',
      micOn: participant.isMicrophoneEnabled, speaking: participant.isSpeaking
    })));
  }, []);

  useEffect(() => {
    if (!credentials) return;
    const room = new Room({ adaptiveStream: false, dynacast: true, disconnectOnPageLeave: false });
    roomRef.current = room;
    let disposed = false;
    let recovering = false;
    let hidden = document.visibilityState === 'hidden';
    let terminal = false;
    const retained = new Set<PublishableLocalTrack>(localTracks);
    const mediaListeners = new Map<MediaStreamTrack, () => void>();
    const monitor = (track: PublishableLocalTrack) => {
      for (const previous of retained) if (previous !== track && previous.kind === track.kind) retained.delete(previous);
      retained.add(track);
      const native = track.mediaStreamTrack;
      for (const [old, listener] of mediaListeners) {
        if (![...retained].some((current) => current.mediaStreamTrack === old)) {
          for (const event of ['mute', 'unmute', 'ended']) old.removeEventListener(event, listener);
          mediaListeners.delete(old);
        }
      }
      if (mediaListeners.has(native)) return;
      const updateMedia = () => {
        if (disposed || terminal || track.isMuted) return;
        const interrupted = native.muted || native.readyState === 'ended';
        setMediaMessage(interrupted ? (installedIOSGuest(credentials.identity) && track.kind === Track.Kind.Audio ? 'Microphone interrupted. Use the Mic control to reconnect, or continue in Safari for background two-way audio.' : 'Camera or microphone interrupted. Return to ViewCircle to recover.') : '');
        if (track.kind === Track.Kind.Video) setHasVideo(!interrupted);
      };
      for (const event of ['mute', 'unmute', 'ended']) native.addEventListener(event, updateMedia);
      mediaListeners.set(native, updateMedia);
      updateMedia();
    };
    const syncVideo = () => {
      if (disposed || terminal) return;
      const receive = !hidden || isPictureInPicture(videoRef.current);
      setVideoPaused(hidden && !receive && credentials.identity.startsWith('guest-'));
      for (const participant of room.remoteParticipants.values()) {
        if (!participant.identity.startsWith('host-')) continue;
        for (const publication of participant.videoTrackPublications.values()) {
          if (publication.isDesired !== receive) publication.setSubscribed(receive);
        }
      }
    };
    const checkSession = async () => {
      if (!roomCode) return true;
      try {
        const status = await api.participantStatus(roomCode, credentials.identity);
        if (disposed || terminal) return false;
        if (status.removed || ['ENDED', 'EXPIRED'].includes(status.status)) {
          terminal = true; window.clearInterval(recoveryTimer); setVideoPaused(false); setMediaMessage(''); setRemoved(status.removed); setSessionEnded(!status.removed);
          retained.forEach((track) => track.stop()); await room.disconnect(); return false;
        }
        return true;
      } catch (error) {
        if (disposed || terminal) return false;
        if ((error as { code?: string }).code === 'SESSION_NOT_FOUND') {
          terminal = true; window.clearInterval(recoveryTimer); setVideoPaused(false); setMediaMessage(''); setSessionEnded(true); retained.forEach((track) => track.stop()); await room.disconnect();
        }
        return false;
      }
    };
    const recover = async () => {
      if (disposed || hidden || recovering || terminal) return;
      recovering = true;
      try {
        if (!await checkSession() || disposed) return;
        if (room.state === LKConnectionState.Disconnected) {
          setConnection('reconnecting');
          await room.connect(credentials.livekitUrl, credentials.token);
          if (disposed) { await room.disconnect(); return; }
          for (const track of retained) {
            if (![...room.localParticipant.trackPublications.values()].some((publication) => publication.track === track)) {
              if (!track.isMuted && track.mediaStreamTrack.readyState === 'ended' && !(installedIOSGuest(credentials.identity) && track.kind === Track.Kind.Audio)) await track.restartTrack(track.kind === Track.Kind.Video ? { facingMode: cameraFacingRef.current } : undefined);
              if (disposed || terminal) { track.stop(); return; }
              await room.localParticipant.publishTrack(track);
              if (track.kind === Track.Kind.Video && videoRef.current) track.attach(videoRef.current);
            }
          }
        }
        if (room.state !== LKConnectionState.Connected) return;
        for (const publication of room.localParticipant.trackPublications.values()) {
          const track = publication.track;
          if (!(track instanceof LocalAudioTrack || track instanceof LocalVideoTrack) || track.isMuted || (installedIOSGuest(credentials.identity) && track.kind === Track.Kind.Audio)) continue;
          if (track.mediaStreamTrack.readyState === 'ended' || track.mediaStreamTrack.muted) await track.restartTrack(track.kind === Track.Kind.Video ? { facingMode: cameraFacingRef.current } : undefined);
          if (disposed || terminal) { track.stop(); return; }
        }
        for (const track of retained) monitor(track);
        syncVideo();
        await room.startAudio().catch(() => setAudioBlocked(true));
        if (videoRef.current?.srcObject) await videoRef.current.play().catch(() => {});
        setMediaMessage(''); refresh(room);
      } catch { setMediaMessage('Could not restore media yet. Check camera and microphone access, then try again.'); }
      finally { recovering = false; }
    };
    const visibility = () => { hidden = document.visibilityState === 'hidden'; syncVideo(); if (!hidden) void recover(); };
    const hide = () => { hidden = true; syncVideo(); };
    const show = () => { hidden = document.visibilityState === 'hidden'; syncVideo(); void recover(); };
    const videoElement = videoRef.current;
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show); window.addEventListener('online', show);
    for (const event of ['enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged']) videoElement?.addEventListener(event, syncVideo);
    const recoveryTimer = window.setInterval(() => {
      if (!hidden) void recover();
    }, 30000);
    const attach = (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Video && participant.identity.startsWith('host-') && videoRef.current) {
        track.attach(videoRef.current); setHasVideo(!_publication.isMuted);
      }
      if (track.kind === Track.Kind.Audio && audioContainerRef.current) {
        const element = track.attach(); element.muted = !soundOnRef.current; audioContainerRef.current.append(element);
      }
      refresh(room);
    };
    const detached = (track: RemoteTrack) => { track.detach().forEach((element) => { if (element.tagName === 'AUDIO') element.remove(); }); if (track.kind === Track.Kind.Video) setHasVideo(false); refresh(room); };
    const state = (next: LKConnectionState) => setConnection(next === LKConnectionState.Connected ? 'connected' : next === LKConnectionState.Connecting ? 'connecting' : next === LKConnectionState.Reconnecting || next === LKConnectionState.SignalReconnecting ? 'reconnecting' : 'disconnected');
    const update = () => refresh(room);
    const muted = (publication: TrackPublication) => { if (publication.source === Track.Source.Camera) setHasVideo(false); update(); };
    const unmuted = (publication: TrackPublication) => { if (publication.source === Track.Source.Camera) setHasVideo(true); update(); };
    const playback = () => setAudioBlocked(!room.canPlaybackAudio);
    room.on(RoomEvent.TrackSubscribed, attach).on(RoomEvent.TrackUnsubscribed, detached)
      .on(RoomEvent.ParticipantConnected, update).on(RoomEvent.ParticipantDisconnected, update)
      .on(RoomEvent.ActiveSpeakersChanged, update).on(RoomEvent.TrackMuted, muted).on(RoomEvent.TrackUnmuted, unmuted)
      .on(RoomEvent.ConnectionStateChanged, state).on(RoomEvent.AudioPlaybackStatusChanged, playback)
      .on(RoomEvent.TrackPublished, syncVideo).on(RoomEvent.Reconnected, () => { syncVideo(); void recover(); })
      .on(RoomEvent.LocalTrackPublished, (publication) => { if (publication.track) monitor(publication.track as PublishableLocalTrack); })
      .on(RoomEvent.LocalTrackUnpublished, (publication) => { if (publication.track) retained.add(publication.track as PublishableLocalTrack); })
      .on(RoomEvent.Disconnected, () => { setConnection('disconnected'); if (!disposed && !terminal) void checkSession(); });
    void (async () => {
      try {
        await room.connect(credentials.livekitUrl, credentials.token);
        if (disposed) { await room.disconnect(); return; }
        for (const track of localTracks) {
          await room.localParticipant.publishTrack(track);
          if (disposed || terminal) { track.stop(); await room.disconnect(); return; }
          monitor(track);
          if (track.kind === Track.Kind.Video && videoRef.current) {
            const currentFacing = track.mediaStreamTrack.getSettings().facingMode;
            if (currentFacing === 'user' || currentFacing === 'environment') cameraFacingRef.current = currentFacing;
            else cameraFacingRef.current = initialFacingMode;
            track.attach(videoRef.current); setHasVideo(true);
          }
        }
        syncVideo(); refresh(room); setConnection('connected');
      } catch { setConnection('disconnected'); }
    })();
    return () => {
      disposed = true; window.clearInterval(recoveryTimer);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show); window.removeEventListener('online', show);
      for (const event of ['enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged']) videoElement?.removeEventListener(event, syncVideo);
      for (const [native, listener] of mediaListeners) for (const event of ['mute', 'unmute', 'ended']) native.removeEventListener(event, listener);
      room.removeAllListeners(); retained.forEach((track) => track.stop()); void room.disconnect(); roomRef.current = null;
    };
  }, [credentials, initialFacingMode, localTracks, refresh, roomCode]);

  const setMic = useCallback(async (enabled: boolean) => {
    const room = roomRef.current; if (!room) return;
    const manualCapture = installedIOSGuest(room.localParticipant.identity);
    const existing = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
    // Only a deliberate Mic action may reacquire interrupted installed-iOS capture.
    if (enabled && manualCapture && existing instanceof LocalAudioTrack &&
      (existing.mediaStreamTrack.readyState === 'ended' || existing.mediaStreamTrack.muted)) await existing.restartTrack();
    await room.localParticipant.setMicrophoneEnabled(enabled, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
    const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
    if (enabled && manualCapture && track instanceof LocalAudioTrack) {
      // Public SDK ownership option: retain this same track, but prevent SDK
      // visibility/ended/reconnect handlers from automatically requesting capture.
      await track.replaceTrack(track.mediaStreamTrack, { userProvidedTrack: true });
    }
    refresh(room);
  }, [refresh]);
  const toggleCamera = useCallback(async () => {
    const room = roomRef.current; if (!room) return;
    const next = !room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(next); setHasVideo(next);
    refresh(room);
  }, [refresh]);
  const retryCamera = useCallback(async () => {
    const room = roomRef.current; if (!room) return;
    const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
    if (track && 'restartTrack' in track) await track.restartTrack({ facingMode: cameraFacingRef.current });
    await room.localParticipant.setCameraEnabled(true); refresh(room);
  }, [refresh]);
  const flipCamera = useCallback(async () => {
    const publication = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = publication?.track;
    if (track && 'restartTrack' in track) {
      const next = cameraFacingRef.current === 'environment' ? 'user' : 'environment';
      await track.restartTrack({ facingMode: next }); cameraFacingRef.current = next;
    }
  }, []);
  const toggleSound = useCallback(() => {
    setSoundOn((current) => {
      const next = !current;
      soundOnRef.current = next;
      audioContainerRef.current?.querySelectorAll('audio').forEach((element) => { element.muted = !next; });
      return next;
    });
  }, []);
  const enableAudio = useCallback(async () => { try { await roomRef.current?.startAudio(); setAudioBlocked(!roomRef.current?.canPlaybackAudio); } catch { setAudioBlocked(true); } }, []);
  return { sessionEnded, removed, mediaMessage, videoPaused, roomRef, videoRef, audioContainerRef, connection, participants, hasVideo, soundOn, audioBlocked, setMic, toggleCamera, retryCamera, flipCamera, toggleSound, enableAudio };
}
