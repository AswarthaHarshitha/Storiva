import { useCallback, useSyncExternalStore } from "react";

// Whether advanced tools are shown is a per-device display preference, so it lives in
// localStorage. Every reader re-renders when it changes.
const KEY = "storiva:advanced-tools";
const EVENT = "storiva:advanced-tools";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useAdvancedMode(): [boolean, (on: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((on: boolean) => {
    try {
      localStorage.setItem(KEY, on ? "on" : "off");
    } catch {
      // Without storage the preference lasts for this page only.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [enabled, set];
}
