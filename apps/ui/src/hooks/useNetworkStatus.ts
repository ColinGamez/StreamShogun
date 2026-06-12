import { useState, useEffect } from "react";

/**
 * Returns `true` when the browser reports an active network connection,
 * `false` when `navigator.onLine` is false.  Updates reactively via
 * the `online` / `offline` window events.
 */
export function useNetworkStatus(): boolean {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
