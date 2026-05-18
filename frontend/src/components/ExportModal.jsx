import { useState, useEffect } from "react";
import { EXPORT_FORMATS } from "../constants/exportFormats";
import { triggerExport } from "../services/exportService";
import { supabase } from "../services/supabaseClient";
import { getExportState, setExportState, closeExport, subscribe } from "../store/exportStore";
import ExportPreviewModal from "./ExportPreviewModal";
import BorderGlow from "./ui/BorderGlow/BorderGlow";
import { 
  CLIENT_COLUMNS, 
  CASE_COLUMNS, 
  HEARING_COLUMNS, 
  PAYMENT_COLUMNS, 
  DOCUMENT_COLUMNS, 
  TASK_COLUMNS, 
  TEAM_COLUMNS 
} from "../constants/tableColumns";

const FORMAT_OPTIONS = [
  {
    id: EXPORT_FORMATS.PDF,
    emoji: "📕",
    label: "PDF",
    description: "Professional report with letterhead, tables & branding. Best for sharing with clients or courts.",
  },
  {
    id: EXPORT_FORMATS.XLSX,
    emoji: "📗",
    label: "Excel",
    description: "Structured spreadsheet with formatted columns and colour-coded rows. Best for analysis & editing.",
  },
  {
    id: EXPORT_FORMATS.CSV,
    emoji: "📄",
    label: "CSV",
    description: "Universal plain-text format compatible with any tool. Best for data imports & integrations.",
  },
  {
    id: EXPORT_FORMATS.DOCX,
    emoji: "📘",
    label: "Word",
    description: "Editable document with professional layout. Best for drafting and printing formal reports.",
  },
];

function getPreviewColumns(type) {
  switch (type) {
    case "cases":     return CASE_COLUMNS;
    case "clients":   return CLIENT_COLUMNS;
    case "payments":  return PAYMENT_COLUMNS;
    case "hearings":  return HEARING_COLUMNS;
    case "documents": return DOCUMENT_COLUMNS;
    case "tasks":     return TASK_COLUMNS;
    case "team":      return TEAM_COLUMNS;
    case "platform":
      return [
        { header: "Metric",         accessor: (r) => r.metric || "—" },
        { header: "Value",          accessor: (r) => r.value || "—" },
      ];
    case "dashboard":
      return [
        { header: "Section",        accessor: (r) => r.section || "—" },
        { header: "Record Info",    accessor: (r) => r.name || r.title || r.caseNumber || "—" },
        { header: "Status",         accessor: (r) => r.status || "—" },
        { header: "Date",           accessor: (r) => (r.createdAt || r.date || "").slice(0, 10) || "—" },
      ];
    default:
      return [
        { header: "Title / Name",   accessor: (r) => r.name || r.title || r.caseNumber || r.case_number || "—" },
        { header: "Status",         accessor: (r) => r.status || "—" },
        { header: "Date",           accessor: (r) => (r.createdAt || r.created_at || "").slice(0, 10) || "—" },
      ];
  }
}

export default function ExportModal({ onClose }) {
  const [state, setState] = useState(getExportState());
  
  useEffect(() => {
    return subscribe(setState);
  }, []);

  const { 
    isOpen, 
    type = "dashboard", 
    allData = [],
    filteredRows = [],
    selectedRows = [],
    currentFilters = {}, 
    defaultDateRange = { start: "", end: "" },
    format = EXPORT_FORMATS.PDF,
    sendToEmail = false,
    emailValue = "",
  } = state;

  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  if (!isOpen) return null;

  const setFormat = (f) => setExportState({ format: f });
  const setSendToEmail = (v) => setExportState({ sendToEmail: v });
  const setEmailValue = (v) => setExportState({ emailValue: v });
  const onCloseModal = () => {
    setShowPreview(false);
    setError("");
    setSuccess("");
    closeExport();
    if (onClose) onClose();
  };

  const columns = getPreviewColumns(type);
  
  // Priority selection for preview and final export
  let exportRows = [];
  if (selectedRows?.length > 0) {
    exportRows = selectedRows;
  } else if (filteredRows?.length > 0) {
    exportRows = filteredRows;
  } else {
    exportRows = allData;
  }

  const handleOpenPreview = () => {
    const hasSelectedRows = selectedRows?.length > 0;
    const hasFilteredRows = filteredRows?.length > 0;
    const hasDateRange = currentFilters?.startDate && currentFilters?.endDate;
    const hasData = allData?.length > 0;

    if (!hasSelectedRows && !hasFilteredRows && !hasDateRange && !hasData) {
      setError("No data available for export");
      return;
    }

    setError("");
    setShowPreview(true);
  };

  const handleFinalExport = async () => {
    setShowPreview(false);
    setExporting(true);
    setError("");
    setSuccess("");
    try {
      let recipientEmail = null;
      if (sendToEmail) {
        if (emailValue && emailValue.includes("@")) {
          recipientEmail = emailValue.trim();
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.email) throw new Error("Could not determine your email. Please enter an email address.");
          recipientEmail = user.email;
        }
      }

      const res = await triggerExport({
        format,
        type,
        dateRange: defaultDateRange,
        filters: currentFilters,
        includeSections: [],
        selectedIds: selectedRows?.length > 0 ? selectedRows.map(r => r.id) : [],
        emailTo: recipientEmail,
      });

      if (res.isBackground) {
        setSuccess(res.message);
      } else {
        setSuccess(recipientEmail ? `Report sent to ${recipientEmail}!` : "Report generated! Download starting.");
        setTimeout(() => onCloseModal(), 2500);
      }
    } catch (err) {
      setError(err.message || "Failed to generate report.");
    } finally {
      setExporting(false);
    }
  };

  const selectedFmt = FORMAT_OPTIONS.find((f) => f.id === format);

  return (
    <>
      <div
        className="flow-modal-overlay"
        style={{ zIndex: 10000 }}
        onClick={(e) => e.target === e.currentTarget && onCloseModal()}
      >
        <BorderGlow className="flow-modal" glowIntensity={0.6} borderRadius={24} style={{ maxWidth: "480px" }}>
          <div className="flow-modal-header">
            <div className="flow-modal-header-info">
              <h3>📥 Export Report</h3>
              <p style={{ textTransform: "capitalize" }}>
                {type} — {exportRows.length} records selected
              </p>
            </div>
            <button type="button" className="flow-modal-close" onClick={onCloseModal}>✕</button>
          </div>

          <div className="flow-modal-body">
            {error   && <div className="form-error-banner"   style={{ marginBottom: 16 }}>⚠️ {error}</div>}
            {success && <div className="form-success-banner" style={{ marginBottom: 16 }}>✅ {success}</div>}

            <div className="form-section">
              <div className="form-section-title"><span>📄</span> Choose Format</div>
              <div className="export-format-grid">
                {FORMAT_OPTIONS.map((fmt) => (
                  <label
                    key={fmt.id}
                    onClick={() => setFormat(fmt.id)}
                    className={`export-format-card ${format === fmt.id ? "active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="export-format"
                      value={fmt.id}
                      checked={format === fmt.id}
                      onChange={() => setFormat(fmt.id)}
                      style={{ display: "none" }}
                    />
                    <span style={{ fontSize: "24px", flexShrink: 0 }}>{fmt.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: "13px", color: "var(--color-text)" }}>
                        {fmt.label}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px", lineHeight: 1.4 }}>
                        {fmt.description}
                      </div>
                    </div>
                    {format === fmt.id && (
                      <span style={{ color: "var(--color-gold)", fontSize: "18px", flexShrink: 0 }}>✓</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-section" style={{ marginTop: 8 }}>
              <div className="form-section-title"><span>📧</span> Delivery</div>
              <label className="checkbox-field">
                <input 
                  type="checkbox" 
                  checked={sendToEmail}
                  onChange={(e) => setSendToEmail(e.target.checked)}
                />
                <span>Send report to my email</span>
              </label>
              
              {sendToEmail && (
                <div className="mt-2">
                  <input 
                    type="email"
                    placeholder="Enter email (leave blank for your own)"
                    value={emailValue}
                    onChange={(e) => setEmailValue(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flow-modal-footer">
            <button type="button" className="btn-neutral" onClick={onCloseModal} disabled={exporting}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-gold"
              onClick={handleOpenPreview}
              disabled={exporting}
              style={{ minWidth: "150px" }}
            >
              {exporting ? "Generating…" : `👁️ Preview & Export`}
            </button>
          </div>
        </BorderGlow>
      </div>

      <ExportPreviewModal
        show={showPreview}
        onClose={() => setShowPreview(false)}
        onExport={handleFinalExport}
        type={type}
        columns={columns}
        rows={exportRows}
        exportRowsCount={exportRows.length}
        formatLabel={selectedFmt?.label}
        isSendingEmail={sendToEmail}
      />
    </>
  );
}
