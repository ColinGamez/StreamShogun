// ── Sample data loader – provides demo channels for first-run UX ─────

import type { Channel } from "@stream-shogun/core";
import { useAppStore } from "../stores/app-store";

/** Sample channels using freely available public test streams. */
const SAMPLE_CHANNELS: Channel[] = [
  {
    tvgId: "BigBuckBunny",
    tvgName: "Big Buck Bunny",
    name: "Big Buck Bunny",
    tvgLogo:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/220px-Big_buck_bunny_poster_big.jpg",
    groupTitle: "Demo",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    duration: -1,
    extras: {},
  },
  {
    tvgId: "SintelTrailer",
    tvgName: "Sintel (Trailer)",
    name: "Sintel (Trailer)",
    tvgLogo:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Sintel_poster.jpg/220px-Sintel_poster.jpg",
    groupTitle: "Demo",
    url: "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8",
    duration: -1,
    extras: {},
  },
  {
    tvgId: "TearsOfSteel",
    tvgName: "Tears of Steel",
    name: "Tears of Steel",
    tvgLogo: "",
    groupTitle: "Demo",
    url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    duration: -1,
    extras: {},
  },
  {
    tvgId: "ElephantsDream",
    tvgName: "Elephant's Dream",
    name: "Elephant's Dream",
    tvgLogo: "",
    groupTitle: "Demo",
    url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    duration: -1,
    extras: {},
  },
  {
    tvgId: "TestPattern",
    tvgName: "Test Pattern (HLS)",
    name: "Test Pattern (HLS)",
    tvgLogo: "",
    groupTitle: "Test Streams",
    url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_ts_aes/master.m3u8",
    duration: -1,
    extras: {},
  },
];

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Loads sample channels into the app store for first-run demonstration.
 * Works without the Electron bridge (pure store operation).
 */
export async function loadSampleData(): Promise<void> {
  const store = useAppStore.getState();
  const entry = {
    id: uid(),
    name: "Sample Playlist (Demo)",
    location: "built-in://sample",
    type: "file" as const,
    channelCount: SAMPLE_CHANNELS.length,
    addedAt: Date.now(),
  };

  store.addPlaylist(entry, SAMPLE_CHANNELS);

  // Also save to DB if bridge is available
  if (typeof window !== "undefined" && window.shogun) {
    try {
      await store.dbSavePlaylist(entry.name, "file", entry.location, SAMPLE_CHANNELS);
    } catch {
      // DB save is optional – sample data still works in-memory
    }
  }
}
