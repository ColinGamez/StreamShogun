import { useState, useMemo } from "react";
import type { Channel, Programme } from "@stream-shogun/core";
import { useAppStore } from "../stores/app-store";
import { t } from "../lib/i18n";
import { EpgGrid } from "../components/EpgGrid";
import { ProgrammeDetail } from "../components/ProgrammeDetail";

interface GuidePageProps {
  onPlay: (ch: Channel) => void;
}

export function GuidePage({ onPlay }: GuidePageProps) {
  const locale = useAppStore((s) => s.locale);
  const channels = useAppStore((s) => s.channels);
  const epgIndex = useAppStore((s) => s.epgIndex);

  const [selectedProg, setSelectedProg] = useState<{
    prog: Programme;
    channel: Channel;
  } | null>(null);

  const [epgSearch, setEpgSearch] = useState("");

  // Only show channels that have EPG entries
  const guideChannels = useMemo(() => {
    return channels.filter((ch) => {
      const progs = epgIndex[ch.tvgId];
      return progs && progs.length > 0;
    });
  }, [channels, epgIndex]);

  const hasData = guideChannels.length > 0;

  return (
    <div className="page page-guide">
      <div className="page-guide-top">
        <h1 className="page-title">{t("nav.guide", locale)}</h1>
        {hasData && (
          <>
            <input
              className="guide-search"
              type="text"
              placeholder={t("guide.searchPlaceholder", locale) || "Search channels or programmes…"}
              value={epgSearch}
              onChange={(e) => setEpgSearch(e.target.value)}
              aria-label="Search EPG"
            />
            <span className="guide-channel-count">
              {guideChannels.length} {t("guide.channelsWithEpg", locale)}
            </span>
          </>
        )}
      </div>

      {!hasData ? (
        <div className="empty-state">
          <span className="empty-icon">📅</span>
          <p>{t("guide.empty", locale)}</p>
        </div>
      ) : (
        <div className="guide-layout">
          <div className={`guide-grid-pane${selectedProg ? " has-detail" : ""}`}>
            <EpgGrid
              channels={guideChannels}
              epgIndex={epgIndex}
              search={epgSearch}
              onSelectProgramme={(prog, ch) => setSelectedProg({ prog, channel: ch })}
              onPlayChannel={onPlay}
            />
          </div>

          {selectedProg && (
            <ProgrammeDetail
              programme={selectedProg.prog}
              channel={selectedProg.channel}
              onClose={() => setSelectedProg(null)}
              onPlay={onPlay}
            />
          )}
        </div>
      )}
    </div>
  );
}
