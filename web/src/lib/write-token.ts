"use client";

import { useSyncExternalStore } from "react";

const KEY = "d2p_write_token";
const EVENT = "d2p-write-token-changed";

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

function getSnapshot(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

// The token must never be server-rendered — a server-passed prop would ship
// it to every visitor in the page payload (and ISR would cache it). It lives
// only in this browser's localStorage, entered once by the user.
function getServerSnapshot(): null {
  return null;
}

export function useWriteToken(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setWriteToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}
