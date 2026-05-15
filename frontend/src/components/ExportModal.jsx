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
 * Returns an array of { header, accessor } column definitions for each module type.
 * accessor is a function(row) => string.
 */
function getPreviewColumns(type) {
  switch (type) {
    case "cases":
      return [
        { header: "Case No.",       accessor: (r) => r.caseNumber    || r.case_number    || "—" },
        { header: "Client",         accessor: (r) => r.client?.name  || r.clientName     || "—" },
        { header: "Type",           accessor: (r) => r.caseType      || "—" },
        { header: "Status",         accessor: (r) => r.status        || "—" },
        { header: "Court",          accessor: (r) => r.courtName     || "—" },
        { header: "Next Hearing",   accessor: (r) => r.nextHearingDate ? r.nextHearingDate.slice(0, 10) : "—" },
        { header: "Lawyer",         accessor: (r) => r.assignedLawyer|| "—" },
      ];
    case "clients":
      return [
        { header: "Name",           accessor: (r) => r.name          || "—" },
        { header: "Phone",          accessor: (r) => r.phone         || "—" },
        { header: "Email",          accessor: (r) => r.email         || "—" },
        { header: "City",           accessor: (r) => r.city          || "—" },
        { header: "Occupation",     accessor: (r) => r.occupation    || "—" },
        { header: "Registered",     accessor: (r) => (r.createdAt || r.created_at || "").slice(0, 10) || "—" },
      ];
    case "payments":
      return [
        { header: "Case No.",       accessor: (r) => r.caseNumber    || r.case_number    || "—" },
        { header: "Client",         accessor: (r) => r.client?.name  || r.clientName     || "—" },
        { header: "Total Billed",   accessor: (r) => r.totalAmount   != null ? `₹${Number(r.totalAmount).toLocaleString("en-IN")}` : "—" },
        { header: "Received",       accessor: (r) => r.paidAmount    != null ? `₹${Number(r.paidAmount).toLocaleString("en-IN")}` : "—" },
        { header: "Balance",        accessor: (r) => r.balanceAmount != null ? `₹${Number(r.balanceAmount).toLocaleString("en-IN")}` : "—" },
        { header: "Status",         accessor: (r) => r.paymentStatus || r.status || "—" },
      ];
    case "followups":
      return [
        { header: "Case No.",       accessor: (r) => r.caseNumber    || r.case?.caseNumber || "—" },
        { header: "Client",         accessor: (r) => r.clientName    || r.case?.client?.name || "—" },
        { header: "Type",           accessor: (r) => r.type          || r.followupType   || "—" },
        { header: "Due Date",       accessor: (r) => (r.dueDate      || r.due_date       || "").slice(0, 10) || "—" },
        { header: "Status",         accessor: (r) => r.status        || "—" },
        { header: "Notes",          accessor: (r) => (r.notes        || "").slice(0, 40) || "—" },
      ];
    case "documents":
      return [
        { header: "Document Name",  accessor: (r) => r.title         || r.name           || "—" },
        { header: "Case No.",       accessor: (r) => r.caseNumber    || r.case?.caseNumber || "—" },
        { header: "Category",       accessor: (r) => r.category      || "—" },
        { header: "Uploaded",       accessor: (r) => (r.createdAt    || r.created_at     || "").slice(0, 10) || "—" },
        { header: "Uploaded By",    accessor: (r) => r.uploadedBy    || "—" },
      ];
    case "tasks":
      return [
        { header: "Task",           accessor: (r) => r.title         || r.task           || "—" },
        { header: "Status",         accessor: (r) => r.status        || "—" },
        { header: "Priority",       accessor: (r) => r.priority      || "—" },
        { header: "Due Date",       accessor: (r) => (r.dueDate      || r.due_date       || "").slice(0, 10) || "—" },
        { header: "Assigned To",    accessor: (r) => r.assignedTo    || r.assigned_to    || "—" },
      ];
    default:
      // Generic fallback
      return [
        { header: "Title / Name",   accessor: (r) => r.name || r.title || r.caseNumber || r.case_number || "—" },
        { header: "Status",         accessor: (r) => r.status || "—" },
        { header: "Date",           accessor: (r) => (r.createdAt || r.created_at || "").slice(0, 10) || "—" },
      ];
  }
}

/**
 * ExportModal — format selection + rich module-aware preview.
 * Rendered entirely via portal so it always sits above HeaderFilters (z-index 9999).
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

  const columns = getPreviewColumns(type);
  const previewRows = availableData.slice(0, 8);

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

  // ─── Main Export Modal ─────────────────────────────────────────
  const mainModal = (
    <div
      className="flow-modal-overlay"
      style={{ zIndex: 10000 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flow-modal" style={{ maxWidth: "480px" }}>
        <div className="flow-modal-header">
          <div className="flow-modal-header-info">
            <h3>📥 Export Report</h3>
            <p style={{ textTransform: "capitalize" }}>
              {type} —{" "}
              {availableData.length > 0
                ? `${availableData.length} records loaded`
                : "all matching records"}
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
                ? <><strong>{availableData.length} records</strong> will be exported (matching your active filters).</>
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
            style={{ minWidth: "150px" }}
          >
            {exporting ? "Generating…" : `👁️ Preview & Export`}
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Preview Confirmation Modal ────────────────────────────────
  const previewModal = showPreview && (
    <div
      className="flow-modal-overlay"
      style={{ zIndex: 10100 }}
      onClick={(e) => e.target === e.currentTarget && setShowPreview(false)}
    >
      <div className="flow-modal" style={{ maxWidth: "720px", width: "95vw" }}>
        <div className="flow-modal-header">
          <div className="flow-modal-header-info">
            <h3>📑 Confirm Export</h3>
            <p>Review data before downloading — top {previewRows.length} of {availableData.length || "all"} records</p>
          </div>
          <button type="button" className="flow-modal-close" onClick={() => setShowPreview(false)}>✕</button>
        </div>

        <div className="flow-modal-body">
          {/* Summary grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "12px",
            padding: "14px 16px",
            background: "var(--color-bg-alt)",
            borderRadius: "12px",
            border: "1px solid var(--color-border)",
            marginBottom: "20px",
          }}>
            {[
              { label: "Format",  value: `${selectedFmt?.emoji} ${selectedFmt?.label}` },
              { label: "Module",  value: type.charAt(0).toUpperCase() + type.slice(1) },
              { label: "Records", value: availableData.length > 0 ? `${availableData.length}` : "All matching" },
              { label: "Filters", value: Object.values(currentFilters).filter(Boolean).length > 0 ? "Active" : "None" },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
                <strong style={{ fontSize: "13px" }}>{value}</strong>
              </div>
            ))}
          </div>

          {/* Rich data preview table */}
          <div>
            <h4 style={{ fontSize: "13px", fontWeight: 700, marginBottom: "10px", color: "var(--color-text-secondary)" }}>
              Data Preview
            </h4>
            <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: "10px", maxHeight: "280px", overflowY: "auto" }}>
              <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse", tableLayout: "auto" }}>
                <thead>
                  <tr style={{ background: "var(--color-bg-alt)", position: "sticky", top: 0, zIndex: 1 }}>
                    {columns.map((col) => (
                      <th
                        key={col.header}
                        style={{
                          padding: "9px 12px",
                          textAlign: "left",
                          borderBottom: "1px solid var(--color-border)",
                          fontWeight: 800,
                          fontSize: "11px",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--color-text-secondary)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.length > 0
                    ? previewRows.map((row, i) => (
                        <tr
                          key={i}
                          style={{
                            background: i % 2 === 0 ? "transparent" : "var(--color-bg-alt)",
                            transition: "background 0.1s",
                          }}
                        >
                          {columns.map((col) => (
                            <td
                              key={col.header}
                              style={{
                                padding: "8px 12px",
                                borderBottom: "1px solid var(--color-border)",
                                color: "var(--color-text)",
                                maxWidth: "160px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={col.accessor(row)}
                            >
                              {col.accessor(row)}
                            </td>
                          ))}
                        </tr>
                      ))
                    : (
                        <tr>
                          <td
                            colSpan={columns.length}
                            style={{
                              padding: "24px",
                              textAlign: "center",
                              color: "var(--color-text-secondary)",
                              fontStyle: "italic",
                            }}
                          >
                            No records loaded yet — the server will fetch all matching records on download.
                          </td>
                        </tr>
                      )
                  }
                </tbody>
              </table>
            </div>
            {availableData.length > 8 && (
              <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "8px", textAlign: "right" }}>
                Showing first 8 of {availableData.length} records. All records will be exported.
              </p>
            )}
          </div>
        </div>

        <div className="flow-modal-footer">
          <button type="button" className="btn-neutral" onClick={() => setShowPreview(false)}>← Back</button>
          <button
            type="button"
            className="btn-gold"
            onClick={handleFinalExport}
            style={{ minWidth: "160px" }}
          >
            📥 Download {selectedFmt?.label}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <>
      {mainModal}
      {previewModal}
    </>,
    document.body
  );
}
