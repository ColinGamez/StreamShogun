import type { Channel, Programme } from "@stream-shogun/core";
import { useAppStore } from "../stores/app-store";

interface ChannelCardProps {
  channel: Channel;
  nowPlaying?: Programme | null;
  onPlay: (ch: Channel) => void;
  focused?: boolean;
}

export function ChannelCard({ channel, nowPlaying, onPlay, focused }: ChannelCardProps) {
  const favorites = useAppStore((s) => s.favorites);
  const toggleFav = useAppStore((s) => s.toggleFavorite);
  const isFav = favorites.has(channel.url);

  return (
    <div
      className={`channel-card${focused ? " focused" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onPlay(channel)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPlay(channel);
        }
      }}
    >
      <div className="channel-logo-wrap">
        {channel.tvgLogo ? (
          <img
            className="channel-logo"
            src={channel.tvgLogo}
            alt={channel.name}
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="channel-logo-placeholder">{channel.name.slice(0, 2).toUpperCase()}</div>
        )}
      </div>

      <div className="channel-info">
        <span className="channel-name">{channel.name}</span>
        {channel.groupTitle && <span className="channel-group">{channel.groupTitle}</span>}
        {nowPlaying && <span className="channel-now">{nowPlaying.titles[0] ?? ""}</span>}
      </div>

      <button
        className={`fav-btn${isFav ? " active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          toggleFav(channel.url);
        }}
        aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
        title={isFav ? "★ Favorite" : "☆ Favorite"}
      >
        {isFav ? "★" : "☆"}
      </button>
    </div>
  );
}
