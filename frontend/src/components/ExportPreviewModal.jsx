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
            background: "var(--color-bg-secondary)",
            minHeight: "400px",
            boxShadow: "0 20px 50px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)",
            borderRadius: "4px",
            padding: "40px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            color: "var(--color-text)",
            position: "relative",
            overflow: "hidden"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid var(--color-primary)", paddingBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ 
                  width: "40px", 
                  height: "40px", 
                  background: "var(--color-primary)", 
                  borderRadius: "50%", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  color: "var(--color-bg-secondary)",
                  fontWeight: 900,
                  fontSize: "20px"
                }}>L</div>
                <div>
                  <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 900, color: "var(--color-primary)", letterSpacing: "-0.5px" }}>LAW OFFICE</h1>
                  <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--color-text-secondary)", fontWeight: 600 }}>PROFESSIONAL LEGAL MANAGEMENT SYSTEM</p>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "14px", fontWeight: 800 }}>{type.toUpperCase()} REPORT</div>
                <div style={{ fontSize: "10px", color: "var(--color-text-tertiary)", marginTop: "2px" }}>{formatDate(new Date())}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "24px", padding: "12px 16px", background: "var(--color-bg-tertiary)", borderRadius: "6px", border: "1px solid var(--color-border)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "9px", color: "var(--color-text-tertiary)", fontWeight: 800, textTransform: "uppercase" }}>Module</div>
                <div style={{ fontSize: "12px", fontWeight: 700 }}>{type.charAt(0).toUpperCase() + type.slice(1)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "9px", color: "var(--color-text-tertiary)", fontWeight: 800, textTransform: "uppercase" }}>Records</div>
                <div style={{ fontSize: "12px", fontWeight: 700 }}>{exportRowsCount}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "9px", color: "var(--color-text-tertiary)", fontWeight: 800, textTransform: "uppercase" }}>Format</div>
                <div style={{ fontSize: "12px", fontWeight: 700 }}>{formatLabel}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "9px", color: "var(--color-text-tertiary)", fontWeight: 800, textTransform: "uppercase" }}>Status</div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-success)" }}>Ready for Export</div>
              </div>
            </div>

            <div style={{ flex: 1 }}>
              {type === "dashboard" ? (
                // Dashboard: show section breakdown
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text)", marginBottom: 4 }}>
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
                        padding: "7px 12px", background: "var(--color-bg-tertiary)", borderRadius: 6,
                        border: "1px solid var(--color-border)"
                      }}>
                        <span style={{ fontWeight: 700, fontSize: 12 }}>
                          {sectionIcons[sec] || "📋"} {sec}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: "var(--color-primary)",
                          background: "var(--color-bg-secondary)", padding: "2px 8px", borderRadius: 99,
                          border: "1px solid var(--color-border)"
                        }}>
                          {items.length > 0 ? `${items.length} record${items.length !== 1 ? "s" : ""}` : "fetched from server"}
                        </span>
                      </div>
                    ));
                  })()}
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--color-bg-tertiary)", borderRadius: 6, border: "1px solid var(--color-success)", fontSize: 11, color: "var(--color-success)", fontWeight: 600 }}>
                    ✅ Export will pull full data for all sections directly from server
                  </div>
                </div>
              ) : previewRows.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", color: "var(--color-text-secondary)", border: "1.5px dashed var(--color-border)", borderRadius: 8 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>No preview data loaded</div>
                  <div style={{ fontSize: 11 }}>The export will still fetch matching records from the server.</div>
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px" }}>
                  <thead>
                    <tr style={{ background: "var(--color-bg-tertiary)" }}>
                      {columns.slice(0, 5).map((col) => (
                        <th key={col.header} style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1.5px solid var(--color-border)", fontWeight: 800, color: "var(--color-text)" }}>{col.header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        {columns.slice(0, 5).map((col) => (
                          <td key={col.header} style={{ padding: "8px 10px", color: "var(--color-text-secondary)" }}>{col.accessor(row)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "12px", marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "9px", color: "var(--color-text-tertiary)" }}>Law Office Management — Internal Document</div>
              <div style={{ fontSize: "9px", color: "var(--color-text-tertiary)" }}>Generated at {new Date().toLocaleTimeString()}</div>
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
