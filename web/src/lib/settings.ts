"use client";

import { useSyncExternalStore } from "react";

// Local, per-device preferences. Same server-null pattern as write-token.ts:
// values must never be server-rendered, so the server snapshot is a constant
// and the client re-renders with stored values after hydration.
export interface Settings {
  masteryRank: number | null;
  minVelocity: number | null;
}

const KEY = "d2p_settings";
const EVENT = "d2p-settings-changed";
const EMPTY: Settings = { masteryRank: null, minVelocity: null };

let cache: Settings = EMPTY;
let cacheRaw: string | null = null;

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

// getSnapshot must return a stable reference for unchanged data or React
// loops; cache keyed on the raw string.
function getSnapshot(): Settings {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      cache = raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
    } catch {
      cache = EMPTY;
    }
  }
  return cache;
}

function getServerSnapshot(): Settings {
  return EMPTY;
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function updateSettings(patch: Partial<Settings>): void {
  const next = { ...getSnapshot(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}
