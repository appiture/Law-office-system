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
  setExportState({
    ...config,
    isOpen: true,
  });
};

export const closeExport = () => {
  setExportState({ isOpen: false });
};
