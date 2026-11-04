/**
 * Decides whether a code read from the camera should be processed. A code is reported once and
 * then ignored for as long as it stays in view; it is reported again only after it has been
 * absent for `absenceMs`. This stops one barcode held under the camera from producing a stream
 * of duplicate stock updates, while still allowing a deliberate re-scan.
 */
export class ScanDeduplicator {
  private lastCode: string | null = null;
  private lastSeen = 0;

  constructor(private readonly absenceMs = 1200) {}

  accept(code: string, now: number): boolean {
    const isRepeat = code === this.lastCode && now - this.lastSeen < this.absenceMs;
    this.lastCode = code;
    this.lastSeen = now;
    return !isRepeat;
  }

  reset() {
    this.lastCode = null;
    this.lastSeen = 0;
  }
}

/**
 * Keyboard-wedge scanners type a whole code in a few milliseconds per key, far faster than a
 * person. Used to label a submission's source as "scanner" rather than "manual".
 */
export function looksLikeHardwareScanner(keyTimes: number[], length: number): boolean {
  const first = keyTimes[0];
  const last = keyTimes.at(-1);
  if (length < 4 || keyTimes.length < 4 || first === undefined || last === undefined) return false;
  return (last - first) / (keyTimes.length - 1) < 35;
}
