import { useState, useRef, useEffect, useCallback } from "react";

// ─── India Location Data ────────────────────────────────────────────────────
// Major cities with their states — covers 95%+ of real usage
const INDIA_CITIES = [
  // Andhra Pradesh
  { city: "Visakhapatnam", state: "Andhra Pradesh" },
  { city: "Vijayawada", state: "Andhra Pradesh" },
  { city: "Guntur", state: "Andhra Pradesh" },
  { city: "Nellore", state: "Andhra Pradesh" },
  { city: "Kurnool", state: "Andhra Pradesh" },
  { city: "Rajahmundry", state: "Andhra Pradesh" },
  { city: "Tirupati", state: "Andhra Pradesh" },
  { city: "Kakinada", state: "Andhra Pradesh" },
  { city: "Kadapa", state: "Andhra Pradesh" },
  { city: "Anantapur", state: "Andhra Pradesh" },
  // Arunachal Pradesh
  { city: "Itanagar", state: "Arunachal Pradesh" },
  // Assam
  { city: "Guwahati", state: "Assam" },
  { city: "Silchar", state: "Assam" },
  { city: "Dibrugarh", state: "Assam" },
  { city: "Jorhat", state: "Assam" },
  // Bihar
  { city: "Patna", state: "Bihar" },
  { city: "Gaya", state: "Bihar" },
  { city: "Bhagalpur", state: "Bihar" },
  { city: "Muzaffarpur", state: "Bihar" },
  { city: "Darbhanga", state: "Bihar" },
  { city: "Purnia", state: "Bihar" },
  // Chhattisgarh
  { city: "Raipur", state: "Chhattisgarh" },
  { city: "Bhilai", state: "Chhattisgarh" },
  { city: "Durg", state: "Chhattisgarh" },
  { city: "Bilaspur", state: "Chhattisgarh" },
  // Goa
  { city: "Panaji", state: "Goa" },
  { city: "Margao", state: "Goa" },
  { city: "Vasco da Gama", state: "Goa" },
  // Gujarat
  { city: "Ahmedabad", state: "Gujarat" },
  { city: "Surat", state: "Gujarat" },
  { city: "Vadodara", state: "Gujarat" },
  { city: "Rajkot", state: "Gujarat" },
  { city: "Bhavnagar", state: "Gujarat" },
  { city: "Jamnagar", state: "Gujarat" },
  { city: "Gandhinagar", state: "Gujarat" },
  { city: "Junagadh", state: "Gujarat" },
  { city: "Anand", state: "Gujarat" },
  { city: "Nadiad", state: "Gujarat" },
  // Haryana
  { city: "Faridabad", state: "Haryana" },
  { city: "Gurgaon", state: "Haryana" },
  { city: "Panipat", state: "Haryana" },
  { city: "Ambala", state: "Haryana" },
  { city: "Yamunanagar", state: "Haryana" },
  { city: "Rohtak", state: "Haryana" },
  { city: "Hisar", state: "Haryana" },
  { city: "Karnal", state: "Haryana" },
  { city: "Sonipat", state: "Haryana" },
  // Himachal Pradesh
  { city: "Shimla", state: "Himachal Pradesh" },
  { city: "Dharamshala", state: "Himachal Pradesh" },
  { city: "Manali", state: "Himachal Pradesh" },
  { city: "Solan", state: "Himachal Pradesh" },
  // Jharkhand
  { city: "Ranchi", state: "Jharkhand" },
  { city: "Jamshedpur", state: "Jharkhand" },
  { city: "Dhanbad", state: "Jharkhand" },
  { city: "Bokaro", state: "Jharkhand" },
  // Karnataka
  { city: "Bengaluru", state: "Karnataka" },
  { city: "Mysuru", state: "Karnataka" },
  { city: "Hubballi", state: "Karnataka" },
  { city: "Mangaluru", state: "Karnataka" },
  { city: "Belagavi", state: "Karnataka" },
  { city: "Kalaburagi", state: "Karnataka" },
  { city: "Davangere", state: "Karnataka" },
  { city: "Ballari", state: "Karnataka" },
  { city: "Vijayapura", state: "Karnataka" },
  { city: "Shivamogga", state: "Karnataka" },
  { city: "Tumakuru", state: "Karnataka" },
  { city: "Udupi", state: "Karnataka" },
  // Kerala
  { city: "Thiruvananthapuram", state: "Kerala" },
  { city: "Kochi", state: "Kerala" },
  { city: "Kozhikode", state: "Kerala" },
  { city: "Thrissur", state: "Kerala" },
  { city: "Kollam", state: "Kerala" },
  { city: "Palakkad", state: "Kerala" },
  { city: "Alappuzha", state: "Kerala" },
  { city: "Malappuram", state: "Kerala" },
  { city: "Kannur", state: "Kerala" },
  { city: "Kottayam", state: "Kerala" },
  // Madhya Pradesh
  { city: "Bhopal", state: "Madhya Pradesh" },
  { city: "Indore", state: "Madhya Pradesh" },
  { city: "Jabalpur", state: "Madhya Pradesh" },
  { city: "Gwalior", state: "Madhya Pradesh" },
  { city: "Ujjain", state: "Madhya Pradesh" },
  { city: "Sagar", state: "Madhya Pradesh" },
  { city: "Rewa", state: "Madhya Pradesh" },
  { city: "Satna", state: "Madhya Pradesh" },
  { city: "Dewas", state: "Madhya Pradesh" },
  // Maharashtra
  { city: "Mumbai", state: "Maharashtra" },
  { city: "Pune", state: "Maharashtra" },
  { city: "Nagpur", state: "Maharashtra" },
  { city: "Nashik", state: "Maharashtra" },
  { city: "Aurangabad", state: "Maharashtra" },
  { city: "Solapur", state: "Maharashtra" },
  { city: "Kolhapur", state: "Maharashtra" },
  { city: "Amravati", state: "Maharashtra" },
  { city: "Nanded", state: "Maharashtra" },
  { city: "Sangli", state: "Maharashtra" },
  { city: "Akola", state: "Maharashtra" },
  { city: "Latur", state: "Maharashtra" },
  { city: "Dhule", state: "Maharashtra" },
  { city: "Jalgaon", state: "Maharashtra" },
  { city: "Thane", state: "Maharashtra" },
  { city: "Navi Mumbai", state: "Maharashtra" },
  // Manipur
  { city: "Imphal", state: "Manipur" },
  // Meghalaya
  { city: "Shillong", state: "Meghalaya" },
  // Mizoram
  { city: "Aizawl", state: "Mizoram" },
  // Nagaland
  { city: "Kohima", state: "Nagaland" },
  { city: "Dimapur", state: "Nagaland" },
  // Odisha
  { city: "Bhubaneswar", state: "Odisha" },
  { city: "Cuttack", state: "Odisha" },
  { city: "Rourkela", state: "Odisha" },
  { city: "Brahmapur", state: "Odisha" },
  { city: "Sambalpur", state: "Odisha" },
  // Punjab
  { city: "Ludhiana", state: "Punjab" },
  { city: "Amritsar", state: "Punjab" },
  { city: "Jalandhar", state: "Punjab" },
  { city: "Patiala", state: "Punjab" },
  { city: "Bathinda", state: "Punjab" },
  { city: "Pathankot", state: "Punjab" },
  { city: "Mohali", state: "Punjab" },
  { city: "Hoshiarpur", state: "Punjab" },
  // Rajasthan
  { city: "Jaipur", state: "Rajasthan" },
  { city: "Jodhpur", state: "Rajasthan" },
  { city: "Kota", state: "Rajasthan" },
  { city: "Bikaner", state: "Rajasthan" },
  { city: "Ajmer", state: "Rajasthan" },
  { city: "Udaipur", state: "Rajasthan" },
  { city: "Bhilwara", state: "Rajasthan" },
  { city: "Alwar", state: "Rajasthan" },
  { city: "Sikar", state: "Rajasthan" },
  { city: "Sri Ganganagar", state: "Rajasthan" },
  // Sikkim
  { city: "Gangtok", state: "Sikkim" },
  // Tamil Nadu
  { city: "Chennai", state: "Tamil Nadu" },
  { city: "Coimbatore", state: "Tamil Nadu" },
  { city: "Madurai", state: "Tamil Nadu" },
  { city: "Tiruchirappalli", state: "Tamil Nadu" },
  { city: "Salem", state: "Tamil Nadu" },
  { city: "Tirunelveli", state: "Tamil Nadu" },
  { city: "Tiruppur", state: "Tamil Nadu" },
  { city: "Vellore", state: "Tamil Nadu" },
  { city: "Erode", state: "Tamil Nadu" },
  { city: "Thanjavur", state: "Tamil Nadu" },
  { city: "Dindigul", state: "Tamil Nadu" },
  { city: "Thoothukudi", state: "Tamil Nadu" },
  { city: "Kanchipuram", state: "Tamil Nadu" },
  { city: "Kumbakonam", state: "Tamil Nadu" },
  { city: "Hosur", state: "Tamil Nadu" },
  // Telangana
  { city: "Hyderabad", state: "Telangana" },
  { city: "Warangal", state: "Telangana" },
  { city: "Nizamabad", state: "Telangana" },
  { city: "Karimnagar", state: "Telangana" },
  { city: "Khammam", state: "Telangana" },
  { city: "Ramagundam", state: "Telangana" },
  { city: "Secunderabad", state: "Telangana" },
  // Tripura
  { city: "Agartala", state: "Tripura" },
  // Uttar Pradesh
  { city: "Lucknow", state: "Uttar Pradesh" },
  { city: "Kanpur", state: "Uttar Pradesh" },
  { city: "Agra", state: "Uttar Pradesh" },
  { city: "Varanasi", state: "Uttar Pradesh" },
  { city: "Meerut", state: "Uttar Pradesh" },
  { city: "Allahabad", state: "Uttar Pradesh" },
  { city: "Bareilly", state: "Uttar Pradesh" },
  { city: "Aligarh", state: "Uttar Pradesh" },
  { city: "Moradabad", state: "Uttar Pradesh" },
  { city: "Saharanpur", state: "Uttar Pradesh" },
  { city: "Gorakhpur", state: "Uttar Pradesh" },
  { city: "Noida", state: "Uttar Pradesh" },
  { city: "Firozabad", state: "Uttar Pradesh" },
  { city: "Jhansi", state: "Uttar Pradesh" },
  { city: "Mathura", state: "Uttar Pradesh" },
  { city: "Ghaziabad", state: "Uttar Pradesh" },
  { city: "Muzaffarnagar", state: "Uttar Pradesh" },
  { city: "Rampur", state: "Uttar Pradesh" },
  // Uttarakhand
  { city: "Dehradun", state: "Uttarakhand" },
  { city: "Haridwar", state: "Uttarakhand" },
  { city: "Roorkee", state: "Uttarakhand" },
  { city: "Haldwani", state: "Uttarakhand" },
  { city: "Nainital", state: "Uttarakhand" },
  // West Bengal
  { city: "Kolkata", state: "West Bengal" },
  { city: "Asansol", state: "West Bengal" },
  { city: "Siliguri", state: "West Bengal" },
  { city: "Durgapur", state: "West Bengal" },
  { city: "Bardhaman", state: "West Bengal" },
  { city: "Malda", state: "West Bengal" },
  { city: "Baharampur", state: "West Bengal" },
  { city: "Kharagpur", state: "West Bengal" },
  // Union Territories
  { city: "New Delhi", state: "Delhi" },
  { city: "Delhi", state: "Delhi" },
  { city: "Dwarka", state: "Delhi" },
  { city: "Rohini", state: "Delhi" },
  { city: "Chandigarh", state: "Chandigarh" },
  { city: "Puducherry", state: "Puducherry" },
  { city: "Silvassa", state: "Dadra and Nagar Haveli" },
  { city: "Daman", state: "Daman and Diu" },
  { city: "Diu", state: "Daman and Diu" },
  { city: "Kavaratti", state: "Lakshadweep" },
  { city: "Port Blair", state: "Andaman and Nicobar Islands" },
  { city: "Leh", state: "Ladakh" },
  { city: "Kargil", state: "Ladakh" },
  { city: "Srinagar", state: "Jammu and Kashmir" },
  { city: "Jammu", state: "Jammu and Kashmir" },
];

// Unique sorted states
const ALL_STATES = [...new Set(INDIA_CITIES.map((c) => c.state))].sort();

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
