import { useCallback, useEffect, useRef, useState } from "react";
import { CENTRE_REGION, decodeWithNative, decodeWithZxing, hasNativeDetector, type DecodedBarcode } from "./decoder";
import { ScanDeduplicator } from "./dedupe";

export type CameraStatus = "idle" | "starting" | "scanning" | "paused" | "error";

const FRAME_INTERVAL_MS = 100;
/** The whole frame is shrunk to at most this width for ZXing; the centre is always full size. */
const MAX_FULL_FRAME_WIDTH = 1280;
/** With a built-in detector, ZXing still runs every few frames for formats the detector lacks. */
const ZXING_EVERY_WITH_NATIVE = 4;

function cameraErrorMessage(error: unknown): string {
  if (!window.isSecureContext) return "The camera only works over HTTPS. Use the barcode field below instead.";
  const name = error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
      return "Camera access was blocked. Allow it in your browser's site settings, or use the barcode field below.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device. Use the barcode field below or a USB/Bluetooth scanner.";
    case "NotReadableError":
      return "The camera is in use by another app. Close it and try again.";
    default:
      return "The camera could not be started. Use the barcode field below instead.";
  }
}

interface CameraCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  focusMode?: string[];
}

export function useCameraScanner(onDetect: (code: string, format: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pausedRef = useRef(false);
  const dedupe = useRef(new ScanDeduplicator());
  const onDetectRef = useRef(onDetect);
  const frameRef = useRef(0);
  const nativeRef = useRef(false);

  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  const stopStream = useCallback(() => {
    window.clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  /** Draws part of the current frame onto the canvas, at `scale`, and returns its pixels. */
  const grab = useCallback((video: HTMLVideoElement, sx: number, sy: number, sw: number, sh: number, scale: number) => {
    canvasRef.current ??= document.createElement("canvas");
    const canvas = canvasRef.current;
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  }, []);

  const readFrame = useCallback(
    async (video: HTMLVideoElement): Promise<DecodedBarcode | undefined> => {
      const frame = frameRef.current++;
      if (nativeRef.current) {
        const [found] = await decodeWithNative(video);
        if (found) return found;
        if (frame % ZXING_EVERY_WITH_NATIVE !== 0) return undefined;
      }
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      // Alternate between the centre at full resolution (small or distant codes) and the whole
      // frame (a code held off-centre).
      const centre = Math.floor(frame / (nativeRef.current ? ZXING_EVERY_WITH_NATIVE : 1)) % 2 === 0;
      const image = centre
        ? grab(video, (vw * (1 - CENTRE_REGION.width)) / 2, (vh * (1 - CENTRE_REGION.height)) / 2, vw * CENTRE_REGION.width, vh * CENTRE_REGION.height, 1)
        : grab(video, 0, 0, vw, vh, Math.min(1, MAX_FULL_FRAME_WIDTH / vw));
      if (!image) return undefined;
      const [found] = await decodeWithZxing(image);
      return found;
    },
    [grab],
  );

  const scanFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!streamRef.current) return;
    if (video && !pausedRef.current && video.readyState >= 2 && video.videoWidth > 0) {
      try {
        const found = await readFrame(video);
        if (found && !pausedRef.current && dedupe.current.accept(found.text, performance.now())) {
          onDetectRef.current(found.text, found.format);
        }
      } catch {
        // A frame that cannot be decoded is simply skipped.
      }
    }
    if (streamRef.current) timerRef.current = window.setTimeout(() => void scanFrame(), FRAME_INTERVAL_MS);
  }, [readFrame]);

  const start = useCallback(
    async (requestedDeviceId?: string) => {
      stopStream();
      setError(null);
      setStatus("starting");
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("Unsupported", "NotSupportedError");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(requestedDeviceId ? { deviceId: { exact: requestedDeviceId } } : { facingMode: { ideal: "environment" } }),
            // More pixels per bar: small or distant barcodes need them.
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        const track = stream.getVideoTracks()[0];
        setDeviceId(track?.getSettings().deviceId ?? null);
        const capabilities = track?.getCapabilities?.() as CameraCapabilities | undefined;
        setTorchSupported(Boolean(capabilities?.torch));
        // Keep refocusing as the barcode moves closer; a blurred barcode is the usual reason for no read.
        if (track && capabilities?.focusMode?.includes("continuous")) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
        }
        nativeRef.current = await hasNativeDetector();
        frameRef.current = 0;
        setTorchOn(false);
        // Device labels are only available once permission has been granted.
        setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput"));
        pausedRef.current = false;
        dedupe.current.reset();
        setStatus("scanning");
        void scanFrame();
      } catch (cause) {
        stopStream();
        setError(cameraErrorMessage(cause));
        setStatus("error");
      }
    },
    [scanFrame, stopStream],
  );

  const stop = useCallback(() => {
    stopStream();
    setStatus("idle");
    setTorchOn(false);
  }, [stopStream]);

  const setPaused = useCallback((paused: boolean) => {
    if (!streamRef.current) return;
    pausedRef.current = paused;
    if (!paused) dedupe.current.reset();
    setStatus(paused ? "paused" : "scanning");
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }, [torchOn]);

  useEffect(() => stopStream, [stopStream]);

  return { videoRef, status, error, devices, deviceId, start, stop, setPaused, torchSupported, torchOn, toggleTorch };
}
