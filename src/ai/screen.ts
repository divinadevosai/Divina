/**
 * "What's on my screen?": one picture of the screen, made smaller, for one
 * question. Divina for Windows takes it through the desktop bridge; the
 * browser edition asks the browser to share the screen (the browser shows
 * its own picker). Nothing is kept afterwards.
 */
import { desktop } from '@/lib/client/desktop';
import { IOS, WEB } from '@/lib/edition';

export interface Shot {
  mime: 'image/jpeg';
  data: string; // base64
  preview: string; // data URL, shown so the person sees exactly what was sent
}

const MAX_SIDE = 1568; // what the AI services read well; larger only costs more

function shrink(img: CanvasImageSource, w: number, h: number): Shot {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.82);
  return { mime: 'image/jpeg', data: url.slice(url.indexOf(',') + 1), preview: url };
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('could not read the screenshot'));
    i.src = src;
  });

export const screenSupported = () => !WEB || (typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia);

export async function captureScreen(): Promise<Shot | { error: string }> {
  if (!WEB) {
    const r = await desktop('screenshot', {});
    if (!r.ok) return { error: r.message };
    const img = await loadImage((r.data as { dataUrl: string }).dataUrl);
    return shrink(img, img.naturalWidth, img.naturalHeight);
  }
  if (IOS) return { error: 'Apple doesn’t let apps see your screen on iPhone, so I can’t look at it here. On a computer, Divina can.' };
  if (!navigator.mediaDevices?.getDisplayMedia) return { error: 'This browser can’t share its screen (phones and tablets can’t). Try Chrome or Edge on a computer.' };
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    await new Promise((r) => setTimeout(r, 250)); // let the first real frame arrive
    return shrink(video, video.videoWidth, video.videoHeight);
  } catch (err) {
    return { error: (err as Error).name === 'NotAllowedError' ? 'Okay, I won’t look.' : 'I couldn’t see your screen.' };
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
  }
}
