"use client";
import { useEffect } from "react";

/** Registers the service worker in production builds (offline page + static caching). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => { /* non-fatal */ });
  }, []);
  return null;
}
