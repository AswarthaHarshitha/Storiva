import { useCallback, useEffect, useRef, useState } from "react";
import { decodeImage } from "./decoder";
import { ScanDeduplicator } from "./dedupe";

export type CameraStatus = "idle" | "starting" | "scanning" | "paused" | "error";

const FRAME_INTERVAL_MS = 120;
const MAX_DECODE_WIDTH = 960;

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

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

export function useCameraScanner(onDetect: (code: string, format: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pausedRef = useRef(false);
  const dedupe = useRef(new ScanDeduplicator());
  const onDetectRef = useRef(onDetect);

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

  const scanFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!streamRef.current) return;
    if (video && !pausedRef.current && video.readyState >= 2 && video.videoWidth > 0) {
      const scale = Math.min(1, MAX_DECODE_WIDTH / video.videoWidth);
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);
      canvasRef.current ??= document.createElement("canvas");
      const canvas = canvasRef.current;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context) {
        context.drawImage(video, 0, 0, width, height);
        try {
          const [found] = await decodeImage(context.getImageData(0, 0, width, height));
          if (found && !pausedRef.current && dedupe.current.accept(found.text, performance.now())) {
            onDetectRef.current(found.text, found.format);
          }
        } catch {
          // A frame that cannot be decoded is simply skipped.
        }
      }
    }
    if (streamRef.current) timerRef.current = window.setTimeout(() => void scanFrame(), FRAME_INTERVAL_MS);
  }, []);

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
            width: { ideal: 1280 },
            height: { ideal: 720 },
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
        setTorchSupported(Boolean((track?.getCapabilities?.() as TorchCapabilities | undefined)?.torch));
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
