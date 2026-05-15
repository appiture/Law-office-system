import { useState } from "react";
import { createPortal } from "react-dom";
import { triggerExport } from "../services/exportService";
import { supabase } from "../services/supabaseClient";

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
        { header: "Type",           accessor: (r) => r.caseType      || r.case_type      || "—" },
        { header: "Status",         accessor: (r) => r.status        || "—" },
        { header: "Court",          accessor: (r) => r.courtName     || r.court_name     || "—" },
        { header: "Next Hearing",   accessor: (r) => r.nextHearingDate ? r.nextHearingDate.slice(0, 10) : "—" },
        { header: "Lawyer",         accessor: (r) => r.assignedLawyer|| r.lawyer_name    || "—" },
      ];
    case "clients":
      return [
        { header: "Name",           accessor: (r) => r.name          || "—" },
        { header: "Phone",          accessor: (r) => r.phone         || "—" },
        { header: "Email",          accessor: (r) => r.email         || "—" },
        { header: "Address",        accessor: (r) => r.address       || "—" },
        { header: "City",           accessor: (r) => r.city          || "—" },
        { header: "Occupation",     accessor: (r) => r.occupation    || "—" },
        { header: "Registered",     accessor: (r) => (r.createdAt || r.created_at || "").slice(0, 10) || "—" },
      ];
    case "payments":
      return [
        { header: "Case No.",       accessor: (r) => r.caseNumber    || r.case?.caseNumber || r.case_number || "—" },
        { header: "Client",         accessor: (r) => r.client?.name  || r.clientName     || "—" },
        { header: "Charge",         accessor: (r) => r.chargeName    || r.charge_name    || "—" },
        { header: "Amount",         accessor: (r) => r.amountPaid    != null || r.amount_paid != null ? `₹${Number(r.amountPaid || r.amount_paid).toLocaleString("en-IN")}` : "—" },
        { header: "Mode",           accessor: (r) => r.paymentMode   || r.payment_mode   || "—" },
        { header: "Reference",      accessor: (r) => r.paymentReference || r.payment_reference || "—" },
        { header: "Date",           accessor: (r) => (r.paymentDate  || r.payment_date   || "").slice(0, 10) || "—" },
      ];
    case "followups":
      return [
        { header: "Case No.",       accessor: (r) => r.caseNumber    || r.case?.caseNumber || "—" },
        { header: "Client",         accessor: (r) => r.clientName    || r.case?.client?.name || "—" },
        { header: "Type",           accessor: (r) => r.type          || r.followupType   || "—" },
        { header: "Due Date",       accessor: (r) => (r.dueDate      || r.due_date || r.scheduled_at || "").slice(0, 10) || "—" },
        { header: "Status",         accessor: (r) => r.status        || "—" },
        { header: "Notes",          accessor: (r) => (r.notes        || "").slice(0, 40) || "—" },
      ];
    case "documents":
      return [
        { header: "Document Name",  accessor: (r) => r.title         || r.name || r.file_name || "—" },
        { header: "Case No.",       accessor: (r) => r.caseNumber    || r.case?.caseNumber || "—" },
        { header: "Category",       accessor: (r) => r.category      || "—" },
        { header: "Description",    accessor: (r) => r.description   || "—" },
        { header: "Uploaded",       accessor: (r) => (r.createdAt    || r.created_at || r.uploaded_at || "").slice(0, 10) || "—" },
        { header: "Uploaded By",    accessor: (r) => r.uploadedBy    || r.uploaded_by || "—" },
      ];
    case "tasks":
      return [
        { header: "Task",           accessor: (r) => r.title         || r.task           || "—" },
        { header: "Status",         accessor: (r) => r.status        || "—" },
        { header: "Priority",       accessor: (r) => r.priority      || "—" },
        { header: "Due Date",       accessor: (r) => (r.dueDate      || r.due_date || r.created_at || "").slice(0, 10) || "—" },
        { header: "Assigned To",    accessor: (r) => r.assignedTo    || r.assigned_to    || "—" },
      ];
    default:
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
  const [sendToEmail, setSendToEmail] = useState(false);
  const [emailValue, setEmailValue] = useState("");

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
      // Resolve recipient email — never pass literal "me" to the backend
      let recipientEmail = null;
      if (sendToEmail) {
        if (emailValue && emailValue.includes("@")) {
          recipientEmail = emailValue.trim();
        } else {
          // Fetch the logged-in user's own email
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
        selectedIds: [],
        emailTo: recipientEmail,
      });
      if (res.isBackground) {
        setSuccess(res.message);
      } else {
        setSuccess(recipientEmail ? `Report sent to ${recipientEmail}!` : "Report generated! Download starting.");
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

          {/* Email Delivery Options */}
          <div className="form-section" style={{ marginTop: 8 }}>
            <div className="form-section-title"><span>📧</span> Delivery</div>
            <label style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "10px", 
              cursor: "pointer",
              padding: "8px 0"
            }}>
              <input 
                type="checkbox" 
                checked={sendToEmail}
                onChange={(e) => setSendToEmail(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "var(--color-gold)" }}
              />
              <span style={{ fontSize: "13px", fontWeight: 600 }}>Send report to my email</span>
            </label>
            
            {sendToEmail && (
              <div style={{ marginTop: 4 }}>
                <input 
                  type="email"
                  placeholder="Enter email (leave blank for your own)"
                  value={emailValue}
                  onChange={(e) => setEmailValue(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1.5px solid var(--color-border)",
                    fontSize: "13px",
                    background: "var(--color-bg)",
                    color: "var(--color-text)"
                  }}
                />
              </div>
            )}
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
      <div className="flow-modal" style={{ 
        maxWidth: "800px", 
        width: "95vw",
        background: "var(--color-bg-alt)", // Slightly darker background for the portal area
      }}>
        <div className="flow-modal-header" style={{ background: "transparent", border: "none" }}>
          <div className="flow-modal-header-info">
            <h3>📑 Document Preview</h3>
            <p>Reviewing top {previewRows.length} records in {selectedFmt?.label} format</p>
          </div>
          <button type="button" className="flow-modal-close" onClick={() => setShowPreview(false)}>✕</button>
        </div>

        <div className="flow-modal-body" style={{ padding: "0 24px 24px", alignItems: "center" }}>
          {/* THE "REAL IMAGE" PREVIEW (Paper effect) */}
          <div style={{
            width: "100%",
            maxWidth: "700px",
            background: "white",
            minHeight: "400px",
            boxShadow: "0 20px 50px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)",
            borderRadius: "4px",
            padding: "40px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            color: "#333", // Force document colors
            position: "relative",
            overflow: "hidden"
          }}>
            {/* Header branding simulation */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #1a237e", paddingBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ 
                  width: "40px", 
                  height: "40px", 
                  background: "#1a237e", 
                  borderRadius: "50%", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  color: "white",
                  fontWeight: 900,
                  fontSize: "20px"
                }}>L</div>
                <div>
                  <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 900, color: "#1a237e", letterSpacing: "-0.5px" }}>LAW OFFICE</h1>
                  <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#666", fontWeight: 600 }}>PROFESSIONAL LEGAL MANAGEMENT SYSTEM</p>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "14px", fontWeight: 800 }}>{type.toUpperCase()} REPORT</div>
                <div style={{ fontSize: "10px", color: "#888", marginTop: "2px" }}>{new Date().toLocaleDateString("en-IN", { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              </div>
            </div>

            {/* Summary info strip */}
            <div style={{ display: "flex", gap: "24px", padding: "12px 16px", background: "#f8f9fa", borderRadius: "6px", border: "1px solid #eee" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "9px", color: "#888", fontWeight: 800, textTransform: "uppercase" }}>Module</div>
                <div style={{ fontSize: "12px", fontWeight: 700 }}>{type.charAt(0).toUpperCase() + type.slice(1)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "9px", color: "#888", fontWeight: 800, textTransform: "uppercase" }}>Records</div>
                <div style={{ fontSize: "12px", fontWeight: 700 }}>{availableData.length || "All"}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "9px", color: "#888", fontWeight: 800, textTransform: "uppercase" }}>Format</div>
                <div style={{ fontSize: "12px", fontWeight: 700 }}>{selectedFmt?.label}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "9px", color: "#888", fontWeight: 800, textTransform: "uppercase" }}>Status</div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#2e7d32" }}>Ready for Export</div>
              </div>
            </div>

            {/* Simulated Data Table */}
            <div style={{ flex: 1 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px" }}>
                <thead>
                  <tr style={{ background: "#f1f3f4" }}>
                    {columns.slice(0, 5).map((col) => (
                      <th key={col.header} style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1.5px solid #ddd", fontWeight: 800, color: "#444" }}>{col.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                      {columns.slice(0, 5).map((col) => (
                        <td key={col.header} style={{ padding: "8px 10px", color: "#555" }}>{col.accessor(row)}</td>
                      ))}
                    </tr>
                  ))}
                  {availableData.length > 8 && (
                    <tr>
                      <td colSpan={5} style={{ padding: "12px", textAlign: "center", color: "#999", fontSize: "10px", fontStyle: "italic", background: "#fafafa" }}>
                        ... and {availableData.length - 8} more records
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer simulation */}
            <div style={{ borderTop: "1px solid #eee", paddingTop: "12px", marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "9px", color: "#aaa" }}>Law Office Management — Internal Document</div>
              <div style={{ fontSize: "9px", color: "#aaa" }}>Generated at {new Date().toLocaleTimeString()}</div>
            </div>
            
            {/* Watermark for preview */}
            <div style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%) rotate(-30deg)",
              fontSize: "80px",
              fontWeight: 900,
              color: "rgba(0,0,0,0.03)",
              pointerEvents: "none",
              whiteSpace: "nowrap"
            }}>
              PREVIEW ONLY
            </div>
          </div>
        </div>

        <div className="flow-modal-footer">
          <button type="button" className="btn-neutral" onClick={() => setShowPreview(false)}>← Back</button>
          <button
            type="button"
            className="btn-gold"
            onClick={handleFinalExport}
            style={{ minWidth: "180px" }}
          >
            {sendToEmail ? `📧 Send via Email` : `📥 Download ${selectedFmt?.label}`}
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
