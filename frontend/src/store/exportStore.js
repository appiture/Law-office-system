import { EXPORT_FORMATS } from "../constants/exportFormats";

let exportState = {
  isOpen: false,
  type: "dashboard",
  format: EXPORT_FORMATS.PDF,
  allData: [],
  filteredRows: [],
  selectedRows: [],
  currentFilters: {},
  defaultDateRange: { start: "", end: "" },
  sendToEmail: false,
  emailValue: "",
  loading: false,
};

const listeners = new Set();

const notify = () => {
  listeners.forEach((listener) => listener(exportState));
};

export const setExportState = (newState) => {
  exportState = { ...exportState, ...newState };
  notify();
};

export const getExportState = () => exportState;

export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const resetExportState = () => {
  exportState = {
    isOpen: false,
    type: "dashboard",
    format: EXPORT_FORMATS.PDF,
    allData: [],
    filteredRows: [],
    selectedRows: [],
    currentFilters: {},
    defaultDateRange: { start: "", end: "" },
    sendToEmail: false,
    emailValue: "",
    loading: false,
  };
  notify();
};

export const openExport = (config) => {
  // Normalize aliased keys so every page works regardless of which key it passes
  const normalized = { ...config };

  // availableData → allData (pages pass availableData, store uses allData)
  if (normalized.availableData !== undefined && normalized.allData === undefined) {
    normalized.allData = normalized.availableData;
  }
  delete normalized.availableData;

  // dateRange → defaultDateRange
  if (normalized.dateRange !== undefined && normalized.defaultDateRange === undefined) {
    normalized.defaultDateRange = normalized.dateRange;
  }
  delete normalized.dateRange;

  // initialSendToEmail → sendToEmail
  if (normalized.initialSendToEmail !== undefined && normalized.sendToEmail === undefined) {
    normalized.sendToEmail = normalized.initialSendToEmail;
  }
  delete normalized.initialSendToEmail;

  setExportState({
    ...normalized,
    isOpen: true,
  });
};

export const closeExport = () => {
  setExportState({ isOpen: false });
};
