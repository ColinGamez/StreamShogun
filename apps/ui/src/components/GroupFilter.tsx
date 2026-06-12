interface GroupFilterProps {
  groups: string[];
  selected: string;
  onSelect: (g: string) => void;
}

import { useAppStore } from "../stores/app-store";
import { t } from "../lib/i18n";

export function GroupFilter({ groups, selected, onSelect }: GroupFilterProps) {
  const locale = useAppStore((s) => s.locale);
  return (
    <div className="group-filter" role="tablist" aria-label="Channel groups">
      <button
        className={`group-pill${selected === "" ? " active" : ""}`}
        role="tab"
        aria-selected={selected === ""}
        onClick={() => onSelect("")}
      >
        {t("channels.allGroups", locale)}
      </button>
      {groups.map((g) => (
        <button
          key={g}
          className={`group-pill${selected === g ? " active" : ""}`}
          role="tab"
          aria-selected={selected === g}
          onClick={() => onSelect(g)}
        >
          {g}
        </button>
      ))}
    </div>
  );
}
