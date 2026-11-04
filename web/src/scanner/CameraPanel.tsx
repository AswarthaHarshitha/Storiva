import { Camera, CameraOff, Flashlight, FlashlightOff, Pause, Play } from "lucide-react";
import type { useCameraScanner } from "./useCameraScanner";
import { Button } from "../components/Button";

type Scanner = ReturnType<typeof useCameraScanner>;

export function CameraPanel({ scanner }: { scanner: Scanner }) {
  const { videoRef, status, error, devices, deviceId, start, stop, setPaused, torchSupported, torchOn, toggleTorch } = scanner;
  const live = status === "scanning" || status === "paused" || status === "starting";

  return (
    <section aria-label="Camera scanner" className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="relative aspect-[4/3] bg-ink sm:aspect-video">
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Camera preview"
          className={`absolute inset-0 size-full object-cover ${live ? "" : "hidden"}`}
        />
        {live && (
          <>
            {/* Guide frame. The centre is decoded at full resolution, and the whole image as well. */}
            <div aria-hidden className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[38%] -translate-y-1/2 rounded-md border-2 border-white/85 shadow-[0_0_0_9999px_rgb(0_0_0/0.28)]" />
            <p
              role="status"
              className="absolute top-3 left-3 rounded bg-ink/75 px-2 py-1 text-xs font-medium text-canvas"
            >
              {status === "starting" ? "Starting camera…" : status === "paused" ? "Paused" : "Scanning…"}
            </p>
            {status === "scanning" && (
              <p className="absolute inset-x-3 bottom-3 text-center text-xs font-medium text-canvas [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]">
                Fill the box with the barcode. If it looks blurred, move it a little further away.
              </p>
            )}
          </>
        )}
        {!live && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-canvas">
            <Camera className="size-7 opacity-80" aria-hidden />
            <p className="max-w-xs text-sm text-canvas/85">
              Codes are read on this device. Camera images are never uploaded.
            </p>
            <Button onClick={() => void start()} className="mt-1">
              Start camera
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="border-t border-line bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {live && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
          <Button
            variant="secondary"
            onClick={() => setPaused(status !== "paused")}
            disabled={status === "starting"}
            aria-pressed={status === "paused"}
          >
            {status === "paused" ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
            {status === "paused" ? "Resume" : "Pause"}
          </Button>
          {torchSupported && (
            <Button variant="secondary" onClick={() => void toggleTorch()} aria-pressed={torchOn}>
              {torchOn ? <FlashlightOff className="size-4" aria-hidden /> : <Flashlight className="size-4" aria-hidden />}
              {torchOn ? "Light off" : "Light on"}
            </Button>
          )}
          {devices.length > 1 && (
            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <span className="sr-only">Camera</span>
              <select
                value={deviceId ?? ""}
                onChange={(e) => void start(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-field bg-surface px-2.5 py-2 text-sm"
              >
                {devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button variant="ghost" onClick={stop} className="ml-auto">
            <CameraOff className="size-4" aria-hidden />
            Stop camera
          </Button>
        </div>
      )}
    </section>
  );
}
