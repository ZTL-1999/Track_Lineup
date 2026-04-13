import { useState, useRef, useEffect } from "react";

interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

interface Props {
  options: Option[];
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SearchableSelect({ options, value, placeholder, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const selectedLabel = value
    ? options.find((o) => o.value === value)?.label ?? ""
    : "";

  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div className={`searchable-select ${className ?? ""}`} ref={ref}>
      <button
        type="button"
        className="searchable-select-trigger"
        onClick={() => { setOpen(!open); setSearch(""); }}
      >
        <span className={`searchable-select-text ${!value ? "placeholder" : ""}`}>
          {value ? selectedLabel : placeholder}
        </span>
        <span className="searchable-select-caret">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="searchable-select-dropdown">
          <input
            ref={inputRef}
            type="text"
            className="searchable-select-search"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="searchable-select-options">
            <div
              className="searchable-select-option"
              onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
            >
              {placeholder}
            </div>
            {filtered.map((o) => (
              <div
                key={o.value}
                className={`searchable-select-option ${o.disabled ? "disabled" : ""} ${o.value === value ? "selected" : ""}`}
                onClick={() => {
                  if (!o.disabled) {
                    onChange(o.value);
                    setOpen(false);
                    setSearch("");
                  }
                }}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
