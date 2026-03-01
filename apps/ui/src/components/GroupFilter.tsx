interface GroupFilterProps {
  groups: string[];
  selected: string;
  onSelect: (g: string) => void;
}

export function GroupFilter({ groups, selected, onSelect }: GroupFilterProps) {
  return (
    <div className="group-filter" role="tablist" aria-label="Channel groups">
      <button
        className={`group-pill${selected === "" ? " active" : ""}`}
        role="tab"
        aria-selected={selected === ""}
        onClick={() => onSelect("")}
      >
        All
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
