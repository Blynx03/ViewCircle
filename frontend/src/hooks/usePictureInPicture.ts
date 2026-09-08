import { useCallback, useEffect, useState, type RefObject } from 'react';

export interface SafariVideo extends HTMLVideoElement {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
}
export function isPictureInPicture(video: SafariVideo | null) {
  return Boolean(video && (document.pictureInPictureElement === video || video.webkitPresentationMode === 'picture-in-picture'));
}
export function supportsPictureInPicture(video: SafariVideo | null) {
  return Boolean(video && ((document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function') ||
    (video.webkitSetPresentationMode && video.webkitSupportsPresentationMode?.('picture-in-picture'))));
}
export function usePictureInPicture(ref: RefObject<HTMLVideoElement | null>, hasVideo: boolean, ended = false) {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const video: SafariVideo | null = ref.current;
    const update = () => { setActive(isPictureInPicture(video)); setSupported(supportsPictureInPicture(video)); };
    update();
    video?.addEventListener('enterpictureinpicture', update);
    video?.addEventListener('leavepictureinpicture', update);
    video?.addEventListener('webkitpresentationmodechanged', update);
    return () => {
      video?.removeEventListener('enterpictureinpicture', update);
      video?.removeEventListener('leavepictureinpicture', update);
      video?.removeEventListener('webkitpresentationmodechanged', update);
    };
  }, [ref, hasVideo]);
  useEffect(() => {
    const video: SafariVideo | null = ref.current;
    return () => {
    if (video && document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => {});
    if (video?.webkitPresentationMode === 'picture-in-picture') video.webkitSetPresentationMode?.('inline');
    };
  }, [ref, ended]);
  const toggle = useCallback(async () => {
    const video: SafariVideo | null = ref.current;
    if (!video) return;
    setMessage('');
    try {
      if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
      else if (video.webkitPresentationMode === 'picture-in-picture') video.webkitSetPresentationMode?.('inline');
      else if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function') await video.requestPictureInPicture();
      else if (supportsPictureInPicture(video)) video.webkitSetPresentationMode?.('picture-in-picture');
    } catch { setMessage('Picture in Picture is unavailable right now. You can still listen here.'); }
  }, [ref]);
  return { active, supported, message, toggle };
}
