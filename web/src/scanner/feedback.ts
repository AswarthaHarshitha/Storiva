let audio: AudioContext | null = null;

/** A short tone and vibration after a scan, where the browser allows them. */
export function scanFeedback(kind: "success" | "error") {
  try {
    audio ??= new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = kind === "success" ? 1320 : 330;
    gain.gain.setValueAtTime(0.08, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + (kind === "success" ? 0.12 : 0.3));
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.3);
  } catch {
    // Audio is optional; some browsers block it until the page has been interacted with.
  }
  navigator.vibrate?.(kind === "success" ? 60 : [80, 60, 80]);
}
