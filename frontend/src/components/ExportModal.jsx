import { useState } from "react";
import { triggerExport } from "../services/exportService";
import ExportPreviewModal from "./ExportPreviewModal";

/**
 * ExportModal
 * 
 * Updated with professional preview flow and validation.
 */
export default function ExportModal({ 
  isOpen, 
  onClose, 
  type = "dashboard", 
  currentFilters = {}, 
  defaultDateRange = { start: "", end: "" },
  availableData = [] 
}) {
  const [format, setFormat] = useState("pdf");
  const [dateRange, setDateRange] = useState(defaultDateRange);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [includeSections, setIncludeSections] = useState({
    cases: true,
    clients: true,
    payments: true,
    hearings: true,
    documents: true,
    tasks: true,
  });

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
      const activeSections = Object.keys(includeSections).filter(k => includeSections[k]);
      
      const res = await triggerExport({
        format,
        type,
        dateRange,
        filters: currentFilters,
        includeSections: activeSections,
        selectedIds: [] // Handled by currentFilters for now or can be extended
      });

      if (res.isBackground) {
        setSuccess(res.message);
      } else {
        setSuccess("Report generated successfully! Your download should start automatically.");
        setTimeout(() => onClose(), 3000);
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
    <>
      <div className="flow-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="flow-modal" style={{ maxWidth: "500px" }}>
          <div className="flow-modal-header">
            <div className="flow-modal-header-info">
              <h3>📥 Export Configuration</h3>
              <p>Customize your professional {type} report</p>
            </div>
            <button type="button" className="flow-modal-close" onClick={onClose}>✕</button>
          </div>

          <div className="flow-modal-body">
            {error && <div className="form-error-banner" style={{ marginBottom: "16px" }}>⚠️ {error}</div>}
            {success && <div className="form-success-banner" style={{ marginBottom: "16px" }}>✅ {success}</div>}

            <div className="form-section">
              <div className="form-section-title"><span>📄</span> Export Format</div>
              <div className="export-format-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                {["pdf", "xlsx", "csv", "docx"].map((fmt) => (
                  <label key={fmt} className={`export-format-card ${format === fmt ? "active" : ""}`} style={{
                    padding: "12px", border: `1px solid ${format === fmt ? "var(--color-gold)" : "var(--color-border)"}`,
                    borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
                    background: format === fmt ? "var(--color-gold-bg)" : "transparent"
                  }}>
                    <input type="radio" name="format" value={fmt} checked={format === fmt} onChange={(e) => setFormat(e.target.value)} style={{ display: "none" }} />
                    <span style={{ fontSize: "18px" }}>{fmt === "pdf" ? "📕" : fmt === "xlsx" ? "📗" : fmt === "csv" ? "📄" : "📘"}</span>
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
                  <input type="date" value={dateRange.start} onChange={(e) => setDateRange(p => ({ ...p, start: e.target.value }))} />
                </div>
                <div className="field-group">
                  <span className="field-label">To</span>
                  <input type="date" value={dateRange.end} onChange={(e) => setDateRange(p => ({ ...p, end: e.target.value }))} />
                </div>
              </div>
            </div>

            {type === "dashboard" && (
              <div className="form-section">
                <div className="form-section-title"><span>🔘</span> Include Sections</div>
                <div className="sections-checklist" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {Object.keys(includeSections).map(section => (
                    <label key={section} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                      <input type="checkbox" checked={includeSections[section]} onChange={() => toggleSection(section)} />
                      <span style={{ textTransform: "capitalize" }}>{section}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            
            <div style={{ marginTop: "16px", padding: "12px", background: "rgba(0,0,0,0.03)", borderRadius: "8px", fontSize: "12px", color: "var(--color-text-secondary)" }}>
              {availableData.length > 0
                ? <>ℹ️ Export will include <strong>{availableData.length} records</strong> matching your current UI filters.</>
                : <>⚠️ No local preview available — the server will export all records matching your filters.</>
              }
            </div>
          </div>

          <div className="flow-modal-footer">
            <button type="button" className="btn-neutral" onClick={onClose} disabled={exporting}>Cancel</button>
            <button 
              type="button" 
              className="btn-gold" 
              onClick={handleOpenPreview} 
              disabled={exporting}
              style={{ minWidth: "120px" }}
            >
              👁️ Preview & Export
            </button>
          </div>
        </div>
      </div>

      <ExportPreviewModal 
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        onConfirm={handleFinalExport}
        exportConfig={{ format, type, dateRange }}
        rowCount={availableData.length}
        previewData={availableData.slice(0, 5)}
      />

      <style>{`
        .export-format-card:hover { border-color: var(--color-gold) !important; background: var(--color-gold-bg) !important; }
        .export-format-card.active { box-shadow: 0 0 0 2px var(--color-gold-light); }
      `}</style>
    </>
  );
}
