import { useRef, useEffect, useState } from "react";

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Debounce delay in ms. 0 = no debounce. @default 200 */
  debounce?: number;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  autoFocus,
  debounce = 200,
}: SearchInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const [local, setLocal] = useState(value);

  // Sync external value changes (e.g. "Clear filters" resets search)
  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const handleChange = (v: string) => {
    setLocal(v);
    clearTimeout(timerRef.current);
    if (debounce > 0) {
      timerRef.current = setTimeout(() => onChange(v), debounce);
    } else {
      onChange(v);
    }
  };

  const handleClear = () => {
    setLocal("");
    clearTimeout(timerRef.current);
    onChange("");
  };

  return (
    <div className="search-input-wrap">
      <span className="search-icon" aria-hidden>
        🔍
      </span>
      <input
        ref={ref}
        className="search-input"
        type="text"
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {local && (
        <button className="search-clear" onClick={handleClear} aria-label="Clear search">
          ✕
        </button>
      )}
    </div>
  );
}
