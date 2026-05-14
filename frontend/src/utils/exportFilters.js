/**
 * exportFilters.js
 * 
 * Centralized logic for building the export filter object.
 * Ensures the UI filters exactly match the export filters.
 */

export const buildExportFilters = ({
  dateRange,
  status,
  caseType,
  category,
  priority,
  searchTerm,
  sections,
  advocate
}) => {
  return {
    dateRange,
    filters: {
      status,
      caseType,
      category,
      priority,
      searchTerm,
      advocate
    },
    includeSections: sections
  };
};

/**
 * Determine the data priority for export:
 * 1. Selected Rows (Manual)
 * 2. Filtered Data (Current View)
 * 3. All Data (Fallback)
 */
export const getExportDataPriority = (selectedRows, filteredData, allData) => {
  if (selectedRows && selectedRows.length > 0) {
    return {
      data: selectedRows,
      scope: "selected",
      ids: selectedRows.map(r => r.id)
    };
  }
  
  if (filteredData && filteredData.length > 0) {
    return {
      data: filteredData,
      scope: "filtered",
      ids: [] // Let backend apply same filters
    };
  }

  return {
    data: allData || [],
    scope: "all",
    ids: []
  };
};
