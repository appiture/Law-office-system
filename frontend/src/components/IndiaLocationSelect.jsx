import { useState, useRef, useEffect, useCallback } from "react";
import { INDIA_CITIES, ALL_STATES } from "../constants/indiaLocations";

// ─── Searchable Combobox ────────────────────────────────────────────────────
function SearchableDropdown({
  value,
  onChange,
  options,       // [{ label, value }]
  placeholder,
  disabled,
  id,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const wrapRef = useRef(null);
  const [highlighted, setHighlighted] = useState(-1);

  const selectedLabel = options.find((o) => o.value === value)?.label || "";

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
        setHighlighted(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlighted >= 0 && listRef.current) {
      const item = listRef.current.children[highlighted];
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlighted]);

  const handleSelect = useCallback((opt) => {
    onChange(opt.value);
    setOpen(false);
    setQuery("");
    setHighlighted(-1);
    inputRef.current?.blur();
  }, [onChange]);

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        setHighlighted(0);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted >= 0 && filtered[highlighted]) handleSelect(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      setHighlighted(-1);
    }
  };

  const displayValue = open ? query : selectedLabel;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "9px 11px",
          border: open
            ? "1.5px solid var(--color-primary, #3A5BA0)"
            : "1.5px solid rgba(0,0,0,0.1)",
          borderRadius: 10,
          background: disabled ? "var(--color-bg-tertiary)" : "var(--color-card)",
          boxShadow: open ? "0 0 0 3px rgba(58,91,160,0.1)" : "none",
          cursor: disabled ? "not-allowed" : "text",
          transition: "border-color 0.18s, box-shadow 0.18s",
        }}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlighted(0);
          }}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              setQuery("");
              setHighlighted(0);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 14,
            color: "var(--color-text)",
            fontFamily: "inherit",
            cursor: disabled ? "not-allowed" : "text",
            padding: 0,
          }}
        />
        {/* Clear button */}
        {value && !disabled && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(""); setQuery(""); }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0 2px",
              color: "var(--color-text-tertiary)",
              fontSize: 12,
              lineHeight: 1,
              flexShrink: 0,
            }}
            title="Clear"
          >
            ✕
          </button>
        )}
        {/* Chevron */}
        <span style={{
          fontSize: 10,
          color: "var(--color-text-tertiary)",
          transform: open ? "rotate(180deg)" : "none",
          transition: "transform 0.2s",
          flexShrink: 0,
          pointerEvents: "none",
        }}>
          ▾
        </span>
      </div>

      {/* Dropdown list */}
      {open && (
        <div
          ref={listRef}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            maxHeight: 220,
            overflowY: "auto",
            zIndex: 9999,
            scrollbarWidth: "thin",
          }}
        >
          {filtered.length === 0 ? (
            <div style={{
              padding: "12px 14px",
              fontSize: 13,
              color: "var(--color-text-tertiary)",
              textAlign: "center",
            }}>
              No results — type to add custom
            </div>
          ) : (
            filtered.map((opt, i) => (
              <div
                key={opt.value}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
                onMouseEnter={() => setHighlighted(i)}
                style={{
                  padding: "9px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                  background: highlighted === i
                    ? "var(--color-bg-secondary, rgba(58,91,160,0.08))"
                    : opt.value === value
                      ? "var(--color-bg-tertiary)"
                      : "transparent",
                  color: opt.value === value
                    ? "var(--color-primary)"
                    : "var(--color-text)",
                  fontWeight: opt.value === value ? 700 : 400,
                  borderBottom: i < filtered.length - 1 ? "1px solid var(--color-border)" : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span>{opt.label}</span>
                {opt.value === value && (
                  <span style={{ fontSize: 11, color: "var(--color-primary)" }}>✓</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function IndiaLocationSelect({
  city = "",
  state = "",
  pinCode = "",
  onCityChange,
  onStateChange,
  onPinCodeChange,
  disabled = false,
  showPinCode = true,
  layout = "row",
}) {
  // ── Derived option lists ──────────────────────────────────────────────────
  // Cities filtered by selected state (or all cities)
  const cityOptions = (
    state
      ? INDIA_CITIES.filter((c) => c.state === state)
      : INDIA_CITIES
  )
    .map((c) => ({ label: c.city, value: c.city }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Add custom city if typed value not in list
  const cityInList = cityOptions.some((o) => o.value === city);
  const cityOptionsWithCustom =
    city && !cityInList
      ? [{ label: `"${city}" (custom)`, value: city }, ...cityOptions]
      : cityOptions;

  const stateOptions = ALL_STATES.map((s) => ({ label: s, value: s }));
  const stateInList = stateOptions.some((o) => o.value === state);
  const stateOptionsWithCustom =
    state && !stateInList
      ? [{ label: `"${state}" (custom)`, value: state }, ...stateOptions]
      : stateOptions;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCityChange = useCallback((selectedCity) => {
    onCityChange?.(selectedCity);
    // Auto-fill state from data
    if (selectedCity) {
      const match = INDIA_CITIES.find((c) => c.city === selectedCity);
      if (match && match.state !== state) {
        onStateChange?.(match.state);
      }
    }
  }, [onCityChange, onStateChange, state]);

  const handleStateChange = useCallback((selectedState) => {
    onStateChange?.(selectedState);
    // If current city doesn't belong to new state, clear city
    if (city && selectedState) {
      const match = INDIA_CITIES.find((c) => c.city === city && c.state === selectedState);
      if (!match) {
        onCityChange?.("");
      }
    }
  }, [onStateChange, onCityChange, city]);

  // ── Auto-fill hint text ───────────────────────────────────────────────────
  const autoFilledState = city && !state
    ? INDIA_CITIES.find((c) => c.city === city)?.state
    : null;

  return (
    <div className={`india-location-grid ${showPinCode ? "ilg-3" : "ilg-2"}`} style={layout === "column" ? { display: "flex", flexDirection: "column", gap: 12 } : {}}>
      {/* City */}
      <div className="field-group" style={{ margin: 0 }}>
        <label className="field-label" htmlFor="location-city">
          City
          {autoFilledState && (
            <span style={{
              marginLeft: 8,
              fontSize: 10,
              fontWeight: 700,
              color: "var(--color-success, #22c55e)",
              background: "rgba(34,197,94,0.1)",
              padding: "1px 7px",
              borderRadius: 999,
              letterSpacing: "0.04em",
            }}>
              ↑ state auto-filled
            </span>
          )}
        </label>
        <SearchableDropdown
          id="location-city"
          value={city}
          onChange={handleCityChange}
          options={cityOptionsWithCustom}
          placeholder={state ? `Cities in ${state}…` : "Search city…"}
          disabled={disabled}
        />
        {state && cityOptions.length > 0 && (
          <span style={{
            fontSize: 11,
            color: "var(--color-text-tertiary)",
            marginTop: 3,
            display: "block",
          }}>
            {cityOptions.length} cities in {state}
          </span>
        )}
      </div>

      {/* State */}
      <div className="field-group" style={{ margin: 0 }}>
        <label className="field-label" htmlFor="location-state">State</label>
        <SearchableDropdown
          id="location-state"
          value={state}
          onChange={handleStateChange}
          options={stateOptionsWithCustom}
          placeholder="Search state…"
          disabled={disabled}
        />
      </div>

      {/* PIN Code */}
      {showPinCode && (
        <div className="field-group" style={{ margin: 0 }}>
          <label className="field-label" htmlFor="location-pin">PIN Code</label>
          <input
            id="location-pin"
            type="text"
            value={pinCode}
            onChange={(e) => onPinCodeChange?.(String(e.target.value).replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit"
            maxLength={6}
            inputMode="numeric"
            disabled={disabled}
            style={{
              width: "100%",
              padding: "9px 11px",
              border: "1.5px solid rgba(0,0,0,0.1)",
              borderRadius: 10,
              fontSize: 14,
              color: "var(--color-text)",
              background: disabled ? "var(--color-bg-tertiary)" : "var(--color-card)",
              fontFamily: "inherit",
              outline: "none",
              transition: "border-color 0.18s",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--color-primary, #3A5BA0)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(0,0,0,0.1)")}
          />
        </div>
      )}
    </div>
  );
}

// ─── Named re-exports for direct use ────────────────────────────────────────
export { INDIA_CITIES, ALL_STATES };
