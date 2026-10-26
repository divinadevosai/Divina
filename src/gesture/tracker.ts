/**
 * MediaPipe hand tracking lifecycle. The wasm runtime and the model are
 * served from this app (public/) only — never from a CDN. The
 * MediaPipe bundle is loaded lazily, only when tracking is switched on.
 */
import { BASE_PATH } from '@/lib/edition';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { useSystem, log } from '@/stores/system';
import { classify, resetClassifier, type HandFrame, type Landmark } from './classifier';

type FrameHandler = (hands: HandFrame[], t: number) => void;

class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private running = false;
  private lastVideoTime = -1;
  private handler: FrameHandler = () => {};

  onFrame(h: FrameHandler) {
    this.handler = h;
  }

  get active() {
    return this.running;
  }

  async start() {
    if (this.running) return;
    const sys = useSystem.getState();
    sys.setTracking('loading');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user', frameRate: { ideal: 30 } }, audio: false });
    } catch (err) {
      const denied = (err as DOMException).name === 'NotAllowedError';
      sys.setTracking(denied ? 'denied' : 'error');
      log('warn', denied ? 'camera permission denied — mouse fallback active' : `camera unavailable: ${(err as Error).message}`);
      return;
    }
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.srcObject = this.stream;
    await video.play();
    this.video = video;

    if (!this.landmarker) {
      const vision = await import('@mediapipe/tasks-vision');
      // Only Divina's own copies: no code or model is ever fetched from a third party.
      const fileset = await vision.FilesetResolver.forVisionTasks(`${BASE_PATH}/mediapipe/wasm`);
      const create = (modelAssetPath: string, delegate: 'GPU' | 'CPU') =>
        vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.5,
        });
      try {
        this.landmarker = await create(`${BASE_PATH}/models/hand_landmarker.task`, 'GPU');
      } catch {
        this.landmarker = await create(`${BASE_PATH}/models/hand_landmarker.task`, 'CPU');
      }
    }
    this.running = true;
    sys.setTracking('searching');
    log('ok', 'hand tracking online');
    this.loop();
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video = null;
    resetClassifier();
    useSystem.getState().setTracking('off');
    this.handler([], performance.now());
  }

  private loop = () => {
    if (!this.running || !this.video || !this.landmarker) return;
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      const now = performance.now();
      const res = this.landmarker.detectForVideo(v, now);
      const aspect = v.videoWidth / Math.max(1, v.videoHeight);
      const hands: HandFrame[] = res.landmarks.map((lm, i) => {
        const cat = res.handedness[i]?.[0];
        // MediaPipe reports handedness for the un-mirrored image.
        const id = cat?.categoryName === 'Left' ? 'Right' : 'Left';
        return classify(lm as Landmark[], id, cat?.score ?? 0.5, aspect);
      });
      const sys = useSystem.getState();
      const status = hands.length ? 'tracking' : 'searching';
      if (sys.tracking !== status) sys.setTracking(status);
      this.handler(hands, now);
    }
    const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => void }).requestVideoFrameCallback;
    if (rvfc) rvfc.call(v, this.loop);
    else requestAnimationFrame(this.loop);
  };
}

export const tracker = new HandTracker();
