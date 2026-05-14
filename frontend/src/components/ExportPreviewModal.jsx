import React from "react";

/**
 * ExportPreviewModal
 * 
 * Shows a professional summary and preview of the data to be exported.
 */
export default function ExportPreviewModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  exportConfig,
  rowCount,
  previewData = []
}) {
  if (!isOpen) return null;

  const { format, type, dateRange, scope } = exportConfig;

  return (
    <div className="flow-modal-overlay" style={{ zIndex: 1100 }}>
      <div className="flow-modal" style={{ maxWidth: "600px" }}>
        <div className="flow-modal-header">
          <div className="flow-modal-header-info">
            <h3>📑 Report Preview</h3>
            <p>Review the export summary before downloading</p>
          </div>
          <button type="button" className="flow-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="flow-modal-body">
          <div className="export-summary-box" style={{ 
            display: "grid", 
            gridTemplateColumns: "1fr 1fr", 
            gap: "16px", 
            padding: "16px", 
            background: "var(--color-bg-alt)", 
            borderRadius: "12px",
            marginBottom: "20px",
            border: "1px solid var(--color-border)"
          }}>
            <div className="summary-item">
              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "block" }}>Format</span>
              <strong style={{ textTransform: "uppercase" }}>{format}</strong>
            </div>
            <div className="summary-item">
              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "block" }}>Total Records</span>
              <strong>{rowCount} rows</strong>
            </div>
            <div className="summary-item">
              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "block" }}>Module</span>
              <strong style={{ textTransform: "capitalize" }}>{type}</strong>
            </div>
            <div className="summary-item">
              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "block" }}>Date Range</span>
              <strong>{dateRange?.start ? `${dateRange.start} to ${dateRange.end || 'Present'}` : "Full History"}</strong>
            </div>
          </div>

          <div className="preview-table-container">
            <h4 style={{ fontSize: "14px", marginBottom: "8px", color: "var(--color-text-secondary)" }}>Preview (Top {previewData.length} records)</h4>
            <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: "8px" }}>
              <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                <thead style={{ background: "var(--color-bg-alt)", position: "sticky", top: 0 }}>
                  <tr>
                    <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>Title/Name</th>
                    <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>Status</th>
                    <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.length > 0 ? previewData.map((row, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: "8px", borderBottom: "1px solid var(--color-border)" }}>{row.name || row.title || row.case_number || "N/A"}</td>
                      <td style={{ padding: "8px", borderBottom: "1px solid var(--color-border)" }}>
                        <span className={`status-pill ${row.status?.toLowerCase()}`}>{row.status || "Active"}</span>
                      </td>
                      <td style={{ padding: "8px", borderBottom: "1px solid var(--color-border)" }}>{row.created_at?.slice(0, 10) || row.payment_date || "N/A"}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="3" style={{ padding: "20px", textAlign: "center", color: "var(--color-text-secondary)" }}>No data available for the selected filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flow-modal-footer">
          <button type="button" className="btn-neutral" onClick={onClose}>Edit Configuration</button>
          <button 
            type="button" 
            className="btn-gold" 
            onClick={onConfirm}
            disabled={rowCount === 0}
          >
            📥 Confirm & Download
          </button>
        </div>
      </div>
    </div>
  );
}
