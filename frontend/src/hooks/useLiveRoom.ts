import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionState as LKConnectionState, LocalAudioTrack, LocalVideoTrack, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Room, RoomEvent, Track, TrackPublication } from 'livekit-client';
import type { Credentials } from '../types/session';

export interface ParticipantView { identity: string; name: string; micOn: boolean; speaking: boolean }
const NO_LOCAL_TRACKS: PublishableLocalTrack[] = [];

export type PublishableLocalTrack = LocalAudioTrack | LocalVideoTrack;
export function useLiveRoom(credentials: Credentials | null, localTracks: PublishableLocalTrack[] = NO_LOCAL_TRACKS, initialFacingMode: 'user' | 'environment' = 'user') {
  const roomRef = useRef<Room | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('connecting');
  const [participants, setParticipants] = useState<ParticipantView[]>([]);
  const [hasVideo, setHasVideo] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  const cameraFacingRef = useRef<'user' | 'environment'>(initialFacingMode);
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
    const room = new Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true });
    roomRef.current = room;
    const attach = (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Video && participant.identity.startsWith('host-') && videoRef.current) {
        track.attach(videoRef.current); setHasVideo(true);
      }
      if (track.kind === Track.Kind.Audio && audioContainerRef.current) {
        const element = track.attach(); element.muted = !soundOnRef.current; audioContainerRef.current.append(element);
      }
      refresh(room);
    };
    const detached = (track: RemoteTrack) => { track.detach(); if (track.kind === Track.Kind.Video) setHasVideo(false); refresh(room); };
    const state = (next: LKConnectionState) => setConnection(next === LKConnectionState.Connected ? 'connected' : next === LKConnectionState.Reconnecting ? 'reconnecting' : 'disconnected');
    const update = () => refresh(room);
    const muted = (publication: TrackPublication) => { if (publication.source === Track.Source.Camera) setHasVideo(false); update(); };
    const unmuted = (publication: TrackPublication) => { if (publication.source === Track.Source.Camera) setHasVideo(true); update(); };
    const playback = () => setAudioBlocked(!room.canPlaybackAudio);
    room.on(RoomEvent.TrackSubscribed, attach).on(RoomEvent.TrackUnsubscribed, detached)
      .on(RoomEvent.ParticipantConnected, update).on(RoomEvent.ParticipantDisconnected, update)
      .on(RoomEvent.ActiveSpeakersChanged, update).on(RoomEvent.TrackMuted, muted).on(RoomEvent.TrackUnmuted, unmuted)
      .on(RoomEvent.ConnectionStateChanged, state).on(RoomEvent.AudioPlaybackStatusChanged, playback)
      .on(RoomEvent.Disconnected, () => setConnection('disconnected'));
    void (async () => {
      try {
        await room.connect(credentials.livekitUrl, credentials.token);
        for (const track of localTracks) {
          await room.localParticipant.publishTrack(track);
          if (track.kind === Track.Kind.Video && videoRef.current) {
            const currentFacing = track.mediaStreamTrack.getSettings().facingMode;
            if (currentFacing === 'user' || currentFacing === 'environment') cameraFacingRef.current = currentFacing;
            else cameraFacingRef.current = initialFacingMode;
            track.attach(videoRef.current); setHasVideo(true);
          }
        }
        refresh(room); setConnection('connected');
      } catch { setConnection('disconnected'); }
    })();
    return () => { room.removeAllListeners(); void room.disconnect(); roomRef.current = null; };
  }, [credentials, initialFacingMode, localTracks, refresh]);

  const setMic = useCallback(async (enabled: boolean) => {
    const room = roomRef.current; if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(enabled, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
    refresh(room);
  }, [refresh]);
  const toggleCamera = useCallback(async () => {
    const room = roomRef.current; if (!room) return;
    const next = !room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(next); setHasVideo(next);
    refresh(room);
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
  const enableAudio = useCallback(async () => { await roomRef.current?.startAudio(); setAudioBlocked(false); }, []);
  return { roomRef, videoRef, audioContainerRef, connection, participants, hasVideo, soundOn, audioBlocked, setMic, toggleCamera, flipCamera, toggleSound, enableAudio };
}
