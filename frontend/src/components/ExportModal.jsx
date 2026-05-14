import { useState } from "react";
import { triggerExport } from "../services/exportService";

/**
 * ExportModal
 * 
 * A reusable modal for triggering data exports.
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onClose
 * @param {'dashboard'|'clients'|'cases'|'payments'|'followups'|'documents'|'tasks'} props.type
 * @param {Object} [props.currentFilters]
 * @param {Object} [props.defaultDateRange]
 */
export default function ExportModal({ 
  isOpen, 
  onClose, 
  type = "dashboard", 
  currentFilters = {}, 
  defaultDateRange = { start: "", end: "" } 
}) {
  const [format, setFormat] = useState("pdf");
  const [dateRange, setDateRange] = useState(defaultDateRange);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [includeSections, setIncludeSections] = useState({
    cases: true,
    clients: true,
    payments: true,
    hearings: true,
    documents: true,
    tasks: true,
  });

  if (!isOpen) return null;

  const handleExport = async () => {
    setExporting(true);
    setError("");
    setSuccess("");
    try {
      const activeSections = Object.keys(includeSections).filter(k => includeSections[k]);
      const res = await triggerExport({
        format,
        type,
        dateRange,
        filters: currentFilters,
        includeSections: activeSections
      });

      if (res.isBackground) {
        setSuccess(res.message);
      } else {
        setSuccess("Report generated successfully! Your download should start automatically.");
        setTimeout(() => onClose(), 2000);
      }
    } catch (err) {
      setError(err.message || "Failed to generate report.");
    } finally {
      setExporting(false);
    }
  };

  const toggleSection = (section) => {
    setIncludeSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="flow-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flow-modal" style={{ maxWidth: "500px" }}>
        <div className="flow-modal-header">
          <div className="flow-modal-header-info">
            <h3>📥 Export Data</h3>
            <p>Generate professional reports for {type}</p>
          </div>
          <button type="button" className="flow-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="flow-modal-body">
          {error && <div className="form-error-banner" style={{ marginBottom: "16px" }}>⚠️ {error}</div>}
          {success && <div className="form-success-banner" style={{ marginBottom: "16px", background: "var(--color-gold-bg)", color: "var(--color-gold-dark)", padding: "12px", borderRadius: "8px", border: "1px solid var(--color-gold)" }}>✅ {success}</div>}

          <div className="form-section">
            <div className="form-section-title"><span>📄</span> Export Format</div>
            <div className="export-format-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              {["pdf", "xlsx", "csv", "docx"].map((fmt) => (
                <label key={fmt} className={`export-format-card ${format === fmt ? "active" : ""}`} style={{
                  padding: "12px",
                  border: `1px solid ${format === fmt ? "var(--color-gold)" : "var(--color-border)"}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: format === fmt ? "var(--color-gold-bg)" : "transparent",
                  transition: "all 0.2s"
                }}>
                  <input 
                    type="radio" 
                    name="format" 
                    value={fmt} 
                    checked={format === fmt} 
                    onChange={(e) => setFormat(e.target.value)}
                    style={{ display: "none" }}
                  />
                  <span style={{ fontSize: "18px" }}>
                    {fmt === "pdf" && "📕"}
                    {fmt === "xlsx" && "📗"}
                    {fmt === "csv" && "📄"}
                    {fmt === "docx" && "📘"}
                  </span>
                  <span style={{ fontWeight: "700", textTransform: "uppercase" }}>{fmt}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title"><span>📅</span> Date Range</div>
            <div className="form-section-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="field-group">
                <span className="field-label">From</span>
                <input 
                  type="date" 
                  value={dateRange.start} 
                  onChange={(e) => setDateRange(p => ({ ...p, start: e.target.value }))} 
                />
              </div>
              <div className="field-group">
                <span className="field-label">To</span>
                <input 
                  type="date" 
                  value={dateRange.end} 
                  onChange={(e) => setDateRange(p => ({ ...p, end: e.target.value }))} 
                />
              </div>
            </div>
          </div>

          {type === "dashboard" && (
            <div className="form-section">
              <div className="form-section-title"><span>🔘</span> Include Sections</div>
              <div className="sections-checklist" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {Object.keys(includeSections).map(section => (
                  <label key={section} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                    <input 
                      type="checkbox" 
                      checked={includeSections[section]} 
                      onChange={() => toggleSection(section)} 
                    />
                    <span style={{ textTransform: "capitalize" }}>{section}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          
          <div style={{ marginTop: "16px", padding: "12px", background: "rgba(0,0,0,0.03)", borderRadius: "8px", fontSize: "12px", color: "var(--color-text-secondary)" }}>
            ℹ️ This will export data based on your <strong>current filters</strong> and selected date range.
          </div>
        </div>

        <div className="flow-modal-footer">
          <button type="button" className="btn-neutral" onClick={onClose} disabled={exporting}>Cancel</button>
          <button 
            type="button" 
            className="btn-gold" 
            onClick={handleExport} 
            disabled={exporting}
            style={{ minWidth: "120px" }}
          >
            {exporting ? "⏳ Exporting..." : "📥 Download Report"}
          </button>
        </div>
      </div>

      <style>{`
        .export-format-card:hover {
          border-color: var(--color-gold) !important;
          background: var(--color-gold-bg) !important;
        }
        .export-format-card.active {
          box-shadow: 0 0 0 2px var(--color-gold-light);
        }
      `}</style>
    </div>
  );
}
