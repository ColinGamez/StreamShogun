import { useRef, useEffect } from "react";

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  autoFocus,
}: SearchInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <div className="search-input-wrap">
      <span className="search-icon" aria-hidden>
        🔍
      </span>
      <input
        ref={ref}
        className="search-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value && (
        <button className="search-clear" onClick={() => onChange("")} aria-label="Clear search">
          ✕
        </button>
      )}
    </div>
  );
}
