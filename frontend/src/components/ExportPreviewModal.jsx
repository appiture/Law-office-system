import { createPortal } from "react-dom";
import { formatDate } from "../utils/formatters";
import BorderGlow from "./ui/BorderGlow/BorderGlow";

// Group dashboard rows by section for preview
function groupBySection(rows) {
  const groups = {};
  for (const row of rows) {
    const sec = row.section || "Other";
    if (!groups[sec]) groups[sec] = [];
    groups[sec].push(row);
  }
  return groups;
}

export default function ExportPreviewModal({ 
  show, 
  onClose, 
  onExport, 
  type, 
  columns, 
  rows, 
  exportRowsCount,
  formatLabel,
  isSendingEmail
}) {
  if (!show) return null;

  // Limit preview to 10 rows as per enterprise optimization standards
  const previewRows = rows.slice(0, 10);

  return createPortal(
    <div
      className="flow-modal-overlay"
      style={{ zIndex: 10100 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <BorderGlow className="flow-modal" glowIntensity={0.5} borderRadius={24} style={{ 
        maxWidth: "800px", 
        width: "95vw",
        background: "var(--color-bg-alt)",
      }}>
        <div className="flow-modal-header" style={{ background: "transparent", border: "none" }}>
          <div className="flow-modal-header-info">
            <h3>📑 Document Preview</h3>
            <p>
              {type === "dashboard"
                ? `Full practice report — all modules will be fetched from server and exported.`
                : previewRows.length > 0
                  ? `Reviewing top ${previewRows.length} records — export will include ALL ${exportRowsCount} records.`
                  : "No records are currently loaded. The export will fetch all matching records from the server."}
            </p>
          </div>
          <button type="button" className="flow-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="flow-modal-body" style={{ padding: "0 24px 24px", alignItems: "center" }}>
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
            color: "#333",
            position: "relative",
            overflow: "hidden"
          }}>
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
                <div style={{ fontSize: "10px", color: "#888", marginTop: "2px" }}>{formatDate(new Date())}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "24px", padding: "12px 16px", background: "#f8f9fa", borderRadius: "6px", border: "1px solid #eee" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "9px", color: "#888", fontWeight: 800, textTransform: "uppercase" }}>Module</div>
                <div style={{ fontSize: "12px", fontWeight: 700 }}>{type.charAt(0).toUpperCase() + type.slice(1)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "9px", color: "#888", fontWeight: 800, textTransform: "uppercase" }}>Records</div>
                <div style={{ fontSize: "12px", fontWeight: 700 }}>{exportRowsCount}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "9px", color: "#888", fontWeight: 800, textTransform: "uppercase" }}>Format</div>
                <div style={{ fontSize: "12px", fontWeight: 700 }}>{formatLabel}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "9px", color: "#888", fontWeight: 800, textTransform: "uppercase" }}>Status</div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#2e7d32" }}>Ready for Export</div>
              </div>
            </div>

            <div style={{ flex: 1 }}>
              {type === "dashboard" ? (
                // Dashboard: show section breakdown
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#444", marginBottom: 4 }}>
                    📊 Report includes all practice modules:
                  </div>
                  {(() => {
                    const groups = groupBySection(rows);
                    const sectionIcons = {
                      Cases: "⚖️", Clients: "👥", Payments: "💰",
                      Hearings: "📅", Tasks: "✅", Team: "👤", Documents: "📄"
                    };
                    const sections = Object.keys(groups).length > 0
                      ? Object.entries(groups)
                      : [["Cases", []], ["Clients", []], ["Payments", []], ["Hearings", []],
                         ["Documents", []], ["Tasks", []], ["Team", []]];
                    return sections.map(([sec, items]) => (
                      <div key={sec} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "7px 12px", background: "#f8f9fa", borderRadius: 6,
                        border: "1px solid #e8ecf0"
                      }}>
                        <span style={{ fontWeight: 700, fontSize: 12 }}>
                          {sectionIcons[sec] || "📋"} {sec}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: "#1a237e",
                          background: "rgba(26,35,126,0.08)", padding: "2px 8px", borderRadius: 99
                        }}>
                          {items.length > 0 ? `${items.length} record${items.length !== 1 ? "s" : ""}` : "fetched from server"}
                        </span>
                      </div>
                    ));
                  })()}
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "#e8f5e9", borderRadius: 6, border: "1px solid #c8e6c9", fontSize: 11, color: "#2e7d32", fontWeight: 600 }}>
                    ✅ Export will pull full data for all sections directly from server
                  </div>
                </div>
              ) : previewRows.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", color: "#888", border: "1.5px dashed #ddd", borderRadius: 8 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>No preview data loaded</div>
                  <div style={{ fontSize: 11 }}>The export will still fetch matching records from the server.</div>
                </div>
              ) : (
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
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ borderTop: "1px solid #eee", paddingTop: "12px", marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "9px", color: "#aaa" }}>Law Office Management — Internal Document</div>
              <div style={{ fontSize: "9px", color: "#aaa" }}>Generated at {new Date().toLocaleTimeString()}</div>
            </div>
          </div>
        </div>

        <div className="flow-modal-footer">
          <button type="button" className="btn-neutral" onClick={onClose}>← Back</button>
          <button
            type="button"
            className="btn-gold"
            onClick={onExport}
            style={{ minWidth: "180px" }}
          >
            {isSendingEmail ? `📧 Send via Email` : `📥 Download ${formatLabel}`}
          </button>
        </div>
      </BorderGlow>
    </div>,
    document.body
  );
}
