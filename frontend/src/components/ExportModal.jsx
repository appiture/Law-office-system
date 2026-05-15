import { useState } from "react";
import { createPortal } from "react-dom";
import { triggerExport } from "../services/exportService";

const FORMAT_OPTIONS = [
  {
    id: "pdf",
    emoji: "📕",
    label: "PDF",
    description: "Professional report with letterhead, tables & branding. Best for sharing with clients or courts.",
  },
  {
    id: "xlsx",
    emoji: "📗",
    label: "Excel",
    description: "Structured spreadsheet with formatted columns and colour-coded rows. Best for analysis & editing.",
  },
  {
    id: "csv",
    emoji: "📄",
    label: "CSV",
    description: "Universal plain-text format compatible with any tool. Best for data imports & integrations.",
  },
  {
    id: "docx",
    emoji: "📘",
    label: "Word",
    description: "Editable document with professional layout. Best for drafting and printing formal reports.",
  },
];

/**
 * ExportModal — format selection only.
 * Date range is inherited from the active page filters.
 */
export default function ExportModal({
  isOpen,
  onClose,
  type = "dashboard",
  currentFilters = {},
  defaultDateRange = { start: "", end: "" },
  availableData = [],
}) {
  const [format, setFormat] = useState("pdf");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  if (!isOpen) return null;

  const handleOpenPreview = () => {
    setError("");
    setShowPreview(true);
  };

  const handleFinalExport = async () => {
    setShowPreview(false);
    setExporting(true);
    setError("");
    setSuccess("");
    try {
      const res = await triggerExport({
        format,
        type,
        dateRange: defaultDateRange,
        filters: currentFilters,
        includeSections: [],
        selectedIds: [],
      });
      if (res.isBackground) {
        setSuccess(res.message);
      } else {
        setSuccess("Report generated! Your download will start automatically.");
        setTimeout(() => onClose(), 2500);
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
      {/* ── Main Export Modal ─────────────────────────── */}
      <div
        className="flow-modal-overlay"
        style={{ zIndex: 1000 }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="flow-modal" style={{ maxWidth: "480px" }}>
          <div className="flow-modal-header">
            <div className="flow-modal-header-info">
              <h3>📥 Export Report</h3>
              <p style={{ textTransform: "capitalize" }}>
                {type} — {availableData.length > 0 ? `${availableData.length} records` : "all matching records"}
              </p>
            </div>
            <button type="button" className="flow-modal-close" onClick={onClose}>✕</button>
          </div>

          <div className="flow-modal-body">
            {error   && <div className="form-error-banner"   style={{ marginBottom: 16 }}>⚠️ {error}</div>}
            {success && <div className="form-success-banner" style={{ marginBottom: 16 }}>✅ {success}</div>}

            {/* Format picker */}
            <div className="form-section">
              <div className="form-section-title"><span>📄</span> Choose Format</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {FORMAT_OPTIONS.map((fmt) => (
                  <label
                    key={fmt.id}
                    onClick={() => setFormat(fmt.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      padding: "12px 16px",
                      border: `1.5px solid ${format === fmt.id ? "var(--color-gold)" : "var(--color-border)"}`,
                      borderRadius: "10px",
                      cursor: "pointer",
                      background: format === fmt.id ? "var(--color-gold-bg)" : "transparent",
                      transition: "all 0.15s ease",
                      boxShadow: format === fmt.id ? "0 0 0 2px var(--color-gold-light)" : "none",
                    }}
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

            {/* Info strip */}
            <div style={{
              marginTop: "16px",
              padding: "11px 14px",
              background: "rgba(0,0,0,0.03)",
              borderRadius: "8px",
              fontSize: "12px",
              color: "var(--color-text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              <span>ℹ️</span>
              <span>
                {availableData.length > 0
                  ? <>Will export <strong>{availableData.length} records</strong> matching your active filters.</>
                  : <>Will export all records matching your active page filters.</>
                }
              </span>
            </div>
          </div>

          <div className="flow-modal-footer">
            <button type="button" className="btn-neutral" onClick={onClose} disabled={exporting}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-gold"
              onClick={handleOpenPreview}
              disabled={exporting}
              style={{ minWidth: "130px" }}
            >
              {exporting ? "Generating…" : `👁️ Preview & Export ${selectedFmt?.label}`}
            </button>
          </div>
        </div>
      </div>

      {/* ── Preview confirmation — rendered in portal so it's always on top ── */}
      {showPreview &&
        createPortal(
          <div
            className="flow-modal-overlay"
            style={{ zIndex: 1200 }}
            onClick={(e) => e.target === e.currentTarget && setShowPreview(false)}
          >
            <div className="flow-modal" style={{ maxWidth: "520px" }}>
              <div className="flow-modal-header">
                <div className="flow-modal-header-info">
                  <h3>📑 Confirm Export</h3>
                  <p>Review before downloading</p>
                </div>
                <button type="button" className="flow-modal-close" onClick={() => setShowPreview(false)}>✕</button>
              </div>

              <div className="flow-modal-body">
                {/* Summary grid */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "14px",
                  padding: "16px",
                  background: "var(--color-bg-alt)",
                  borderRadius: "12px",
                  border: "1px solid var(--color-border)",
                  marginBottom: "20px",
                }}>
                  {[
                    { label: "Format",  value: `${selectedFmt?.emoji} ${selectedFmt?.label}` },
                    { label: "Module",  value: type.charAt(0).toUpperCase() + type.slice(1) },
                    { label: "Records", value: availableData.length > 0 ? `${availableData.length} rows` : "All matching" },
                    { label: "Filters", value: Object.values(currentFilters).filter(Boolean).length > 0 ? "Active" : "None" },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", display: "block", marginBottom: "2px" }}>{label}</span>
                      <strong style={{ fontSize: "13px" }}>{value}</strong>
                    </div>
                  ))}
                </div>

                {/* Data preview table */}
                <div>
                  <h4 style={{ fontSize: "13px", fontWeight: 700, marginBottom: "8px", color: "var(--color-text-secondary)" }}>
                    Preview (top {Math.min(availableData.length, 5)} records)
                  </h4>
                  <div style={{ maxHeight: "180px", overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: "8px" }}>
                    <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                      <thead style={{ background: "var(--color-bg-alt)", position: "sticky", top: 0 }}>
                        <tr>
                          {["Title / Name", "Status", "Date"].map((h) => (
                            <th key={h} style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid var(--color-border)", fontWeight: 700 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {availableData.slice(0, 5).length > 0
                          ? availableData.slice(0, 5).map((row, i) => (
                              <tr key={i}>
                                <td style={{ padding: "8px", borderBottom: "1px solid var(--color-border)" }}>
                                  {row.caseNumber || row.name || row.title || row.case_number || "—"}
                                </td>
                                <td style={{ padding: "8px", borderBottom: "1px solid var(--color-border)" }}>
                                  {row.status || "Active"}
                                </td>
                                <td style={{ padding: "8px", borderBottom: "1px solid var(--color-border)" }}>
                                  {(row.createdAt || row.created_at || "")?.slice(0, 10) || "—"}
                                </td>
                              </tr>
                            ))
                          : (
                              <tr>
                                <td colSpan="3" style={{ padding: "20px", textAlign: "center", color: "var(--color-text-secondary)" }}>
                                  Server will fetch all matching records on download.
                                </td>
                              </tr>
                            )
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="flow-modal-footer">
                <button type="button" className="btn-neutral" onClick={() => setShowPreview(false)}>← Back</button>
                <button type="button" className="btn-gold" onClick={handleFinalExport} style={{ minWidth: "150px" }}>
                  📥 Download {selectedFmt?.label}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      }
    </>
  );
}
