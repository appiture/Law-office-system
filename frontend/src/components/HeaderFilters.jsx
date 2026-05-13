import { useState, useRef, useEffect } from "react";
import "./HeaderFilters.css";

function HeaderFilters({
  searchTerm = "",
  onSearchChange,
  searchPlaceholder = "Search...",
  filters = [],
  filterValues = {},
  onFilterChange,
  onClearFilters,
  showClearButton = true,
  dateRangeConfig = null,
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const containerRef = useRef(null);

  const activeFilterCount = Object.values(filterValues).filter(v => v && v !== "all" && v !== "").length;
  const hasActiveFilters = activeFilterCount > 0;
  const hasDateRange = dateRangeConfig && (dateRangeConfig.fromDate || dateRangeConfig.toDate);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setPanelOpen(false);
        if (!searchTerm) setIsSearchExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchTerm]);

  const handleFilterSelect = (filterId, value) => {
    if (onFilterChange) onFilterChange(filterId, value);
  };

  const handleClearAll = () => {
    if (onClearFilters) onClearFilters();
    if (dateRangeConfig) {
      if (dateRangeConfig.onFromDateChange) dateRangeConfig.onFromDateChange("");
      if (dateRangeConfig.onToDateChange) dateRangeConfig.onToDateChange("");
    }
  };

  return (
    <div className={`header-filters-container${panelOpen ? " is-open" : ""}${isSearchExpanded ? " search-expanded" : ""}`} ref={containerRef}>
      <div className="header-filters-top">
        {/* Search Field - Collapsible */}
        <div className={`premium-search-box ${isSearchExpanded ? "expanded" : "collapsed"}`}>
          <span className="search-icon" onClick={() => setIsSearchExpanded(!isSearchExpanded)}>🔍</span>
          <input
            type="text"
            className="search-input"
            value={searchTerm}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            onFocus={() => setIsSearchExpanded(true)}
            placeholder={isSearchExpanded ? searchPlaceholder : ""}
          />
          {searchTerm && isSearchExpanded && (
            <button className="search-clear-btn" onClick={() => onSearchChange("")}>✕</button>
          )}
        </div>

        {/* Compact Date Range - New! */}
        {dateRangeConfig && !isSearchExpanded && (
          <div className="compact-date-range-bar">
            <span className="compact-date-label">{dateRangeConfig.label || "Dates"}:</span>
            <input 
              type="date" 
              className="mini-date-input" 
              value={dateRangeConfig.fromDate || ""} 
              onChange={(e) => dateRangeConfig.onFromDateChange?.(e.target.value)}
            />
            <span className="mini-date-sep">to</span>
            <input 
              type="date" 
              className="mini-date-input" 
              value={dateRangeConfig.toDate || ""} 
              onChange={(e) => dateRangeConfig.onToDateChange?.(e.target.value)}
            />
          </div>
        )}

        {/* Filter Toggle Button */}
        {(filters.length > 0 || dateRangeConfig) && (
          <button
            type="button"
            className={`filter-toggle-btn${panelOpen ? " active" : ""}${hasActiveFilters || hasDateRange ? " has-active" : ""}`}
            onClick={() => setPanelOpen(!panelOpen)}
          >
            <span className="filter-icon">⚙️</span>
            <span className="filter-label">Filters</span>
            {(activeFilterCount > 0 || hasDateRange) && (
              <span className="filter-badge">
                {activeFilterCount + (hasDateRange ? 1 : 0)}
              </span>
            )}
            <span className="chevron-icon">{panelOpen ? "▴" : "▾"}</span>
          </button>
        )}
      </div>

      {/* Expandable Filter Panel (The "Drag Down" part) */}
      <div className={`filter-expand-panel${panelOpen ? " visible" : ""}`}>
        <div className="filter-panel-content">
          <div className="filter-grid">
            {filters.map((filter) => (
              <div key={filter.id} className="filter-item">
                <label className="filter-item-label">{filter.label}</label>
                <select
                  className="filter-item-select"
                  value={filterValues[filter.id] || ""}
                  onChange={(e) => handleFilterSelect(filter.id, e.target.value)}
                >
                  <option value="">All {filter.label}</option>
                  {filter.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            {dateRangeConfig && (
              <>
                <div className="filter-item">
                  <label className="filter-item-label">{dateRangeConfig.label || "From Date"}</label>
                  <input
                    type="date"
                    className="filter-item-input"
                    value={dateRangeConfig.fromDate || ""}
                    onChange={(e) => dateRangeConfig.onFromDateChange && dateRangeConfig.onFromDateChange(e.target.value)}
                  />
                </div>
                <div className="filter-item">
                  <label className="filter-item-label">{dateRangeConfig.label ? "To" : "To Date"}</label>
                  <input
                    type="date"
                    className="filter-item-input"
                    value={dateRangeConfig.toDate || ""}
                    onChange={(e) => dateRangeConfig.onToDateChange && dateRangeConfig.onToDateChange(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="filter-panel-actions">
            <div className="filter-status-info">
              {hasActiveFilters || hasDateRange ? "Active filters applied" : "No filters active"}
            </div>
            <div className="filter-action-buttons">
              {showClearButton && (hasActiveFilters || hasDateRange) && (
                <button type="button" className="panel-clear-btn" onClick={handleClearAll}>
                  Clear All Filters
                </button>
              )}
              <button type="button" className="panel-close-btn" onClick={() => setPanelOpen(false)}>
                Apply & Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

  );
}


export default HeaderFilters;



