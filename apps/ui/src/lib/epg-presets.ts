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
    id: "epg-us",
    name: "United States EPG",
    flag: "🇺🇸",
    region: "USA — IPTV-EPG.org",
    url: "https://iptv-epg.org/files/epg-us.xml",
  },
  {
    id: "epg-gb",
    name: "United Kingdom EPG",
    flag: "🇬🇧",
    region: "UK — IPTV-EPG.org",
    url: "https://iptv-epg.org/files/epg-gb.xml",
  },
  {
    id: "epg-de",
    name: "Germany EPG",
    flag: "🇩🇪",
    region: "Germany — IPTV-EPG.org",
    url: "https://iptv-epg.org/files/epg-de.xml",
  },
  {
    id: "epg-fr",
    name: "France EPG",
    flag: "🇫🇷",
    region: "France — IPTV-EPG.org",
    url: "https://iptv-epg.org/files/epg-fr.xml",
  },
  {
    id: "epg-jp",
    name: "Japan EPG",
    flag: "🇯🇵",
    region: "Japan — IPTV-EPG.org",
    url: "https://iptv-epg.org/files/epg-jp.xml",
  },
  {
    id: "epg-ca",
    name: "Canada EPG",
    flag: "🇨🇦",
    region: "Canada — IPTV-EPG.org",
    url: "https://iptv-epg.org/files/epg-ca.xml",
  },
  {
    id: "epg-br",
    name: "Brazil EPG",
    flag: "🇧🇷",
    region: "Brazil — IPTV-EPG.org",
    url: "https://iptv-epg.org/files/epg-br.xml",
  },
  {
    id: "epg-es",
    name: "Spain EPG",
    flag: "🇪🇸",
    region: "Spain — IPTV-EPG.org",
    url: "https://iptv-epg.org/files/epg-es.xml",
  },
  {
    id: "epg-it",
    name: "Italy EPG",
    flag: "🇮🇹",
    region: "Italy — IPTV-EPG.org",
    url: "https://iptv-epg.org/files/epg-it.xml",
  },
  {
    id: "epg-au",
    name: "Australia EPG",
    flag: "🇦🇺",
    region: "Australia — IPTV-EPG.org",
    url: "https://iptv-epg.org/files/epg-au.xml",
  },
];
