import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, SlidersHorizontal, X } from "lucide-react";
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
  onShowAll = null,
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const containerRef = useRef(null);

  const activeFilterCount = Object.values(filterValues).filter(
    (value) => value && value !== "all" && value !== "ALL"
  ).length;
  const hasActiveFilters = activeFilterCount > 0;
  const hasDateRange = Boolean(dateRangeConfig && (dateRangeConfig.fromDate || dateRangeConfig.toDate));

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleFilterSelect = (filterId, value) => {
    onFilterChange?.(filterId, value);
  };

  const handleClearAll = () => {
    onClearFilters?.();
    dateRangeConfig?.onFromDateChange?.("");
    dateRangeConfig?.onToDateChange?.("");
  };

  return (
    <div className={`header-filters-container${panelOpen ? " is-open" : ""}`} ref={containerRef}>
      <div className="header-filters-top">
        <div className="premium-search-box">
          <Search className="search-icon" aria-hidden="true" size={16} />
          <input
            type="text"
            className="search-input"
            value={searchTerm}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder={searchPlaceholder}
          />
          {searchTerm && (
            <button type="button" className="search-clear-btn" onClick={() => onSearchChange?.("")} aria-label="Clear search">
              <X size={12} />
            </button>
          )}
        </div>

        {dateRangeConfig && (
          <div className="compact-date-range-bar">
            <span className="compact-date-label">{dateRangeConfig.label || "Dates"}</span>
            <input
              type="date"
              className="mini-date-input"
              value={dateRangeConfig.fromDate || ""}
              onChange={(event) => dateRangeConfig.onFromDateChange?.(event.target.value)}
              aria-label={`${dateRangeConfig.label || "Date"} from`}
            />
            <span className="mini-date-sep">to</span>
            <input
              type="date"
              className="mini-date-input"
              value={dateRangeConfig.toDate || ""}
              onChange={(event) => dateRangeConfig.onToDateChange?.(event.target.value)}
              aria-label={`${dateRangeConfig.label || "Date"} to`}
            />
          </div>
        )}

        {(filters.length > 0 || dateRangeConfig) && (
          <button
            type="button"
            className={`filter-toggle-btn${panelOpen ? " active" : ""}${hasActiveFilters || hasDateRange ? " has-active" : ""}`}
            onClick={() => setPanelOpen((open) => !open)}
          >
            <SlidersHorizontal className="filter-icon" aria-hidden="true" size={16} />
            <span className="filter-label">Filters</span>
            {(hasActiveFilters || hasDateRange) && (
              <span className="filter-badge">{activeFilterCount + (hasDateRange ? 1 : 0)}</span>
            )}
            {panelOpen ? <ChevronUp className="chevron-icon" size={14} /> : <ChevronDown className="chevron-icon" size={14} />}
          </button>
        )}

        {onShowAll && (
          <button
            type="button"
            className="filter-toggle-btn panel-show-all-btn"
            onClick={() => {
              onShowAll();
              setPanelOpen(false);
            }}
          >
            Show All
          </button>
        )}
      </div>

      <div className={`filter-expand-panel${panelOpen ? " visible" : ""}`}>
        <div className="filter-panel-content">
          <div className="filter-grid">
            {filters.map((filter) => {
              const isTextFilter = filter.type === "text" || !Array.isArray(filter.options) || filter.options.length === 0;
              return (
                <div key={filter.id} className="filter-item">
                  <label className="filter-item-label">{filter.label}</label>
                  {isTextFilter ? (
                    <input
                      type={filter.inputType || "text"}
                      className="filter-item-input"
                      value={filterValues[filter.id] || ""}
                      onChange={(event) => handleFilterSelect(filter.id, event.target.value)}
                      placeholder={filter.placeholder || `Enter ${filter.label.toLowerCase()}`}
                    />
                  ) : (
                    <select
                      className="filter-item-select"
                      value={filterValues[filter.id] || ""}
                      onChange={(event) => handleFilterSelect(filter.id, event.target.value)}
                    >
                      <option value="">{filter.allLabel || `All ${filter.label}`}</option>
                      {filter.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}

            {dateRangeConfig && (
              <>
                <div className="filter-item">
                  <label className="filter-item-label">{dateRangeConfig.label || "From Date"}</label>
                  <input
                    type="date"
                    className="filter-item-input"
                    value={dateRangeConfig.fromDate || ""}
                    onChange={(event) => dateRangeConfig.onFromDateChange?.(event.target.value)}
                  />
                </div>
                <div className="filter-item">
                  <label className="filter-item-label">{dateRangeConfig.label ? "To" : "To Date"}</label>
                  <input
                    type="date"
                    className="filter-item-input"
                    value={dateRangeConfig.toDate || ""}
                    onChange={(event) => dateRangeConfig.onToDateChange?.(event.target.value)}
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
