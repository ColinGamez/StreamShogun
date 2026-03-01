// ── Built-in EPG source presets ───────────────────────────────────────
//
// These are curated, freely-available XMLTV feeds that users can
// one-click load from the Library page.

export interface EpgPreset {
  /** Unique key, e.g. "epg-jp" */
  id: string;
  /** Human-readable name */
  name: string;
  /** Region flag emoji */
  flag: string;
  /** Region / description shown below the name */
  region: string;
  /** XMLTV feed URL (may be .xml or .xml.gz — gzip handled by backend) */
  url: string;
}

export const EPG_PRESETS: EpgPreset[] = [
  {
    id: "epg-jp",
    name: "Japan EPG",
    flag: "🇯🇵",
    region: "Japan — IPTV-EPG.org",
    url: "https://iptv-epg.org/files/epg-jp.xml",
  },
];
