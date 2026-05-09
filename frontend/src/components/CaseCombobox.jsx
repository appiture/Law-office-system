import { useEffect, useRef, useState } from "react";

// ── Case Combobox Component ───────────────────────────────────
function CaseCombobox({ value, onChange, cases, placeholder = "Search and select case...", disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const filteredCases = cases.filter(c =>
    searchTerm.trim() === "" ||
    String(c.caseNumber || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(c.caseType || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(c.client?.name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedCase = cases.find(c => String(c.id) === String(value));
  const displayValue = selectedCase ? `${selectedCase.caseNumber} - ${selectedCase.client?.name || "Unknown Client"} (${selectedCase.caseType})` : "";

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setSearchTerm(newValue);
    setIsOpen(true);
    setHighlightedIndex(-1);
    // Clear selection if typing
    if (value && !filteredCases.some(c => String(c.id) === String(value))) {
      onChange("");
    }
  };

  const handleSelect = (caseItem) => {
    onChange(String(caseItem.id));
    setSearchTerm("");
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === "ArrowDown") {
        setIsOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < filteredCases.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredCases.length) {
          handleSelect(filteredCases[highlightedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        inputRef.current && !inputRef.current.contains(event.target) &&
        listRef.current && !listRef.current.contains(event.target)
      ) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="combobox-container" style={{ position: "relative" }}>
      <input
        ref={inputRef}
        type="text"
        value={isOpen ? searchTerm : displayValue}
        onChange={handleInputChange}
        onFocus={() => {
          if (!disabled) {
            setIsOpen(true);
            setSearchTerm("");
            setHighlightedIndex(-1);
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "8px 12px",
          border: "1px solid #d1d5db",
          borderRadius: "6px",
          fontSize: "14px",
          backgroundColor: disabled ? "#f9fafb" : "white",
          cursor: disabled ? "not-allowed" : "text"
        }}
      />
      {isOpen && filteredCases.length > 0 && (
        <div
          ref={listRef}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "white",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            maxHeight: "200px",
            overflowY: "auto",
            zIndex: 1000
          }}
        >
          {filteredCases.map((c, index) => (
            <div
              key={c.id}
              onClick={() => handleSelect(c)}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                backgroundColor: highlightedIndex === index ? "#f3f4f6" : "white",
                borderBottom: index < filteredCases.length - 1 ? "1px solid #e5e7eb" : "none"
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <div style={{ fontWeight: "600", color: "#111827" }}>
                {c.caseNumber} - {c.client?.name || "Unknown Client"}
              </div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>
                {c.caseType}
              </div>
            </div>
          ))}
        </div>
      )}
      {isOpen && filteredCases.length === 0 && searchTerm && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "white",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            padding: "8px 12px",
            color: "#6b7280",
            fontSize: "14px"
          }}
        >
          No cases match your search
        </div>
      )}
    </div>
  );
}

export default CaseCombobox;



