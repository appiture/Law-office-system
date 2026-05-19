import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Bell, RefreshCw, CheckCircle2 } from "lucide-react";
import { ROUTES } from "../../constants/routes";
import { useNotifications } from "../../hooks/useNotifications";

const GROUP_META = {
  missed:   { label: "⚠️ Missed Hearings",    color: "var(--color-error)" },
  today:    { label: "📅 Today's Hearings",    color: "var(--color-primary)" },
  upcoming: { label: "🔔 Upcoming Hearings",   color: "var(--color-warning)" },
  overdue:  { label: "💸 Overdue Payments",    color: "var(--color-error)" },
};

function NotificationBell({ pendingTaskCount = 0 }) {
  const navigate = useNavigate();
  const { items, loading, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("active"); // "active" | "upcoming" | "read"
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("notif_dismissed") || "[]")); }
    catch { return new Set(); }
  });
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const dismiss = (e, id) => {
    e.stopPropagation();
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    localStorage.setItem("notif_dismissed", JSON.stringify([...next]));
  };

  const visible = items.filter(n => !dismissed.has(n.id));
  
  // Notification number count: ONLY shows overdue / missed alerts
  const overdueCount = visible.filter(n => n.level === "overdue" || n.level === "missed").length;

  const hearingItems = visible.filter(n => n.type === "hearing");
  const paymentItems = visible.filter(n => n.type === "payment");

  // Active Tab Lists:
  const activeHearings = hearingItems.filter(n => n.level === "missed" || n.level === "today");
  const activePayments = paymentItems.filter(n => n.level === "overdue");

  // Group urgent hearings
  const activeHearingGroups = ["missed", "today"].reduce((acc, key) => {
    const g = activeHearings.filter(n => n.level === key);
    if (g.length) acc.push({ key, ...GROUP_META[key], items: g });
    return acc;
  }, []);

  // Upcoming Tab List:
  const upcomingItems = visible.filter(n => n.level === "upcoming");

  // Read Tab List:
  const readItems = items.filter(n => dismissed.has(n.id));

  const renderNotifItem = (notif, isReadPage = false) => {
    return (
      <div
        key={notif.id}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          padding: "16px 20px",
          margin: "12px 24px",
          borderRadius: "12px",
          border: "1px solid var(--color-border-soft, var(--color-border))",
          background: "var(--color-surface, var(--color-card))",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        className="notif-item-card"
        onMouseEnter={e => {
          e.currentTarget.style.background = "var(--color-bg-hover, var(--color-bg))";
          e.currentTarget.style.borderColor = "var(--color-primary)";
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.08)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = "var(--color-surface, var(--color-card))";
          e.currentTarget.style.borderColor = "var(--color-border-soft, var(--color-border))";
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 16 }}>{notif.emoji}</span>
            <span style={{
              fontWeight: 700, fontSize: 13.5, color: "var(--color-text)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
            }}>
              {notif.title}
            </span>
          </div>
          <span style={{
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: notif.color,
            background: `${notif.color}15`,
            padding: "3px 8px",
            borderRadius: 6,
            whiteSpace: "nowrap"
          }}>
            {notif.label}
          </span>
        </div>

        {/* Rich Metadata Section */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "1fr 1fr", 
          gap: "8px 16px", 
          fontSize: 11.5, 
          color: "var(--color-text-secondary)",
          background: "rgba(0,0,0,0.015)",
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid rgba(0,0,0,0.02)"
        }}>
          <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <span style={{ opacity: 0.65 }}>🧑‍💼 Client: </span>
            <strong style={{ color: "var(--color-text)", fontWeight: 600 }}>{notif.clientName}</strong>
          </div>
          <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <span style={{ opacity: 0.65 }}>📁 Case: </span>
            <strong style={{ color: "var(--color-text)", fontWeight: 600 }}>{notif.caseNumber}</strong>
          </div>
          
          {notif.type === "hearing" ? (
            <div style={{ gridColumn: "span 2" }}>
              <span style={{ opacity: 0.65 }}>📅 Schedule: </span>
              <strong style={{ color: "var(--color-text)", fontWeight: 600 }}>{notif.hearingDate}</strong>
            </div>
          ) : (
            <>
              <div>
                <span style={{ opacity: 0.65 }}>💰 Balance: </span>
                <strong style={{ color: "var(--color-text)", fontWeight: 600 }}>₹{notif.balanceAmount?.toLocaleString("en-IN")}</strong>
                <span style={{ opacity: 0.45, fontSize: 10 }}> (of ₹{notif.totalAmount?.toLocaleString("en-IN")})</span>
              </div>
              <div>
                <span style={{ opacity: 0.65 }}>⌛ Due: </span>
                <strong style={{ color: "var(--color-text)", fontWeight: 600 }}>{notif.dueDate}</strong>
              </div>
            </>
          )}
        </div>

        {/* Action Button Row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <button
            onClick={() => { setOpen(false); navigate(notif.link); }}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-primary)",
              fontSize: 11.5,
              fontWeight: 700,
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              gap: 4,
              transition: "opacity 0.2s"
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = 0.8}
            onMouseLeave={e => e.currentTarget.style.opacity = 1}
          >
            View Details →
          </button>
          
          {!isReadPage && (
            <button
              onClick={e => dismiss(e, notif.id)}
              style={{
                background: "var(--color-bg-secondary, rgba(0,0,0,0.03))",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                color: "var(--color-text-secondary)",
                fontSize: "11px",
                fontWeight: 700,
                padding: "4px 12px",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "var(--color-success-bg, rgba(46, 125, 50, 0.1))";
                e.currentTarget.style.color = "var(--color-success, #2e7d32)";
                e.currentTarget.style.borderColor = "var(--color-success, #2e7d32)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "var(--color-bg-secondary, rgba(0,0,0,0.03))";
                e.currentTarget.style.color = "var(--color-text-secondary)";
                e.currentTarget.style.borderColor = "var(--color-border)";
              }}
            >
              ✓ Mark as Read
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        className="notification-trigger"
        onClick={() => setOpen(v => !v)}
        title="Notifications"
        style={{ position: "relative" }}
        aria-label={`${overdueCount} overdue notifications`}
      >
        <Bell size={20} className={`notif-bell${open ? " notif-bell-active" : ""}`} />
        {overdueCount > 0 && (
          <span className="nav-badge" style={{ position: "absolute", top: -5, right: -5 }}>
            {overdueCount > 99 ? "99+" : overdueCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <div 
          className="notif-backdrop"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(15, 23, 42, 0.5)",
            backdropFilter: "blur(8px)",
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "fadeIn 0.25s ease"
          }}
          onClick={() => setOpen(false)}
        >
          <div 
            className="notif-panel" 
            style={{
              width: "calc(100% - 48px)",
              maxWidth: "1100px",
              height: "calc(100vh - 48px)",
              background: "var(--color-bg, #0f172a)",
              borderRadius: "16px",
              border: "1px solid var(--color-border)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 24px 64px rgba(0,0,0,0.36)",
              animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header (FROZEN) */}
            <div style={{
              display: "flex", 
              alignItems: "center", 
              justifyContent: "space-between",
              padding: "20px 32px",
              borderBottom: "1px solid var(--color-border)",
              background: "var(--color-surface, var(--color-card))",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontWeight: 800, fontSize: 18, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 8 }}>
                  🔔 Notification Center
                </span>
                {overdueCount > 0 && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 800,
                    background: "var(--color-error-bg, rgba(211, 47, 47, 0.1))",
                    color: "var(--color-error, #d32f2f)",
                    padding: "3px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(211,47,47,0.2)"
                  }}>
                    {overdueCount} Alerts Overdue
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <button
                  onClick={() => {
                    setDismissed(new Set());
                    localStorage.removeItem("notif_dismissed");
                    refresh(true);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: 6,
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--color-primary)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--color-text-secondary)"}
                  title="Refresh notifications"
                >
                  <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
                  <span>Refresh</span>
                </button>
                {visible.length > 0 && (
                  <button
                    onClick={() => {
                      const next = new Set([...dismissed, ...visible.map(n => n.id)]);
                      setDismissed(next);
                      localStorage.setItem("notif_dismissed", JSON.stringify([...next]));
                    }}
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--color-error)",
                      padding: "4px 8px",
                      borderRadius: 6,
                      transition: "opacity 0.2s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 0.8}
                    onMouseLeave={e => e.currentTarget.style.opacity = 1}
                  >
                    Mark all as read
                  </button>
                )}
                {/* Close Button */}
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    background: "var(--color-bg-secondary, rgba(0,0,0,0.03))",
                    border: "1px solid var(--color-border)",
                    borderRadius: "50%",
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: "var(--color-text-secondary)",
                    fontSize: 14,
                    fontWeight: 700,
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = "var(--color-error-bg, rgba(211, 47, 47, 0.15))";
                    e.currentTarget.style.color = "var(--color-error, #d32f2f)";
                    e.currentTarget.style.borderColor = "var(--color-error, #d32f2f)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "var(--color-bg-secondary, rgba(0,0,0,0.03))";
                    e.currentTarget.style.color = "var(--color-text-secondary)";
                    e.currentTarget.style.borderColor = "var(--color-border)";
                  }}
                  title="Close and return to dashboard"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Switcher tabs (FROZEN) */}
            <div style={{
              display: "flex",
              gap: 12,
              padding: "12px 32px",
              borderBottom: "1px solid var(--color-border)",
              background: "var(--color-bg-tertiary, var(--color-bg))",
            }}>
              <button
                onClick={() => setActiveTab("active")}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  fontSize: 12,
                  fontWeight: 800,
                  borderRadius: 24,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: activeTab === "active" ? "var(--color-primary)" : "var(--color-border)",
                  background: activeTab === "active" ? "var(--color-primary)" : "var(--color-surface)",
                  color: activeTab === "active" ? "#ffffff" : "var(--color-text-secondary)",
                  boxShadow: activeTab === "active" ? "0 4px 12px rgba(var(--color-primary-rgb, 0,0,0), 0.2)" : "none",
                  transition: "all 0.2s ease",
                }}
              >
                Active Alerts ({activeHearings.length + activePayments.length})
              </button>
              <button
                onClick={() => setActiveTab("upcoming")}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  fontSize: 12,
                  fontWeight: 800,
                  borderRadius: 24,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: activeTab === "upcoming" ? "var(--color-warning)" : "var(--color-border)",
                  background: activeTab === "upcoming" ? "var(--color-warning)" : "var(--color-surface)",
                  color: activeTab === "upcoming" ? "#ffffff" : "var(--color-text-secondary)",
                  boxShadow: activeTab === "upcoming" ? "0 4px 12px rgba(var(--color-warning-rgb, 0,0,0), 0.2)" : "none",
                  transition: "all 0.2s ease",
                }}
              >
                Upcoming ({upcomingItems.length})
              </button>
              <button
                onClick={() => setActiveTab("read")}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  fontSize: 12,
                  fontWeight: 800,
                  borderRadius: 24,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: activeTab === "read" ? "var(--color-success)" : "var(--color-border)",
                  background: activeTab === "read" ? "var(--color-success)" : "var(--color-surface)",
                  color: activeTab === "read" ? "#ffffff" : "var(--color-text-secondary)",
                  boxShadow: activeTab === "read" ? "0 4px 12px rgba(var(--color-success-rgb, 0,0,0), 0.2)" : "none",
                  transition: "all 0.2s ease",
                }}
              >
                Read Page ({readItems.length})
              </button>
            </div>

            {/* Scrollable Content Wrapper */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {activeTab === "active" && (
                <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                  {activeHearings.length === 0 && activePayments.length === 0 ? (
                    <div style={{
                      display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
                      padding: "48px 24px", color: "var(--color-text-secondary)",
                    }}>
                      <CheckCircle2 size={48} style={{ opacity: 0.4, color: "var(--color-success)" }} />
                      <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text)" }}>All Clear — No Active Alerts</span>
                      <span style={{ fontSize: 13, opacity: 0.6 }}>No missed hearings or overdue payments on record.</span>
                    </div>
                  ) : (
                    <div className="notif-panel-body" style={{ display: "flex", flex: 1, overflow: "hidden", width: "100%" }}>
                      {/* Left Column: Case Hearings (INDEPENDENTLY SCROLLABLE, FREEZING HEADER) */}
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, borderRight: "1px solid var(--color-border)" }}>
                        <div style={{
                          fontSize: 11.5,
                          fontWeight: 800,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: "var(--color-primary)",
                          padding: "14px 24px",
                          borderBottom: "1px solid var(--color-border)",
                          background: "var(--color-bg-tertiary)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}>
                          <span>📅 Case Hearings</span>
                          <span style={{ 
                            fontSize: 10.5, 
                            fontWeight: 800, 
                            background: "rgba(102, 137, 255, 0.15)", 
                            color: "var(--color-primary)", 
                            padding: "2px 8px", 
                            borderRadius: 12 
                          }}>
                            {activeHearings.length} Alerts
                          </span>
                        </div>
                        <div className="col-scroll" style={{ flex: 1, overflowY: "auto", paddingBottom: 32 }}>
                          {activeHearings.length === 0 ? (
                            <div style={{ padding: "64px 24px", textAlign: "center", color: "var(--color-text-tertiary)" }}>
                              <span style={{ fontSize: 13, opacity: 0.6 }}>No missed or today hearings</span>
                            </div>
                          ) : (
                            activeHearingGroups.map(group => (
                              <div key={group.key}>
                                <div style={{
                                  fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
                                  textTransform: "uppercase", color: group.color,
                                  padding: "14px 24px 4px",
                                  background: `${group.color}05`,
                                }}>
                                  {group.label}
                                </div>
                                {group.items.map(notif => renderNotifItem(notif, false))}
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Right Column: Fees Notifications (INDEPENDENTLY SCROLLABLE, FREEZING HEADER) */}
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <div style={{
                          fontSize: 11.5,
                          fontWeight: 800,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: "var(--color-secondary)",
                          padding: "14px 24px",
                          borderBottom: "1px solid var(--color-border)",
                          background: "var(--color-bg-tertiary)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}>
                          <span>💸 Fees Notifications</span>
                          <span style={{ 
                            fontSize: 10.5, 
                            fontWeight: 800, 
                            background: "rgba(212, 175, 55, 0.15)", 
                            color: "var(--color-secondary)", 
                            padding: "2px 8px", 
                            borderRadius: 12 
                          }}>
                            {activePayments.length} Alerts
                          </span>
                        </div>
                        <div className="col-scroll" style={{ flex: 1, overflowY: "auto", paddingBottom: 32 }}>
                          {activePayments.length === 0 ? (
                            <div style={{ padding: "64px 24px", textAlign: "center", color: "var(--color-text-tertiary)" }}>
                              <span style={{ fontSize: 13, opacity: 0.6 }}>No overdue fees</span>
                            </div>
                          ) : (
                            activePayments.map(notif => renderNotifItem(notif, false))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "upcoming" && (
                <div style={{ flex: 1, overflowY: "auto", padding: "16px 0 32px" }}>
                  {upcomingItems.length === 0 ? (
                    <div style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
                      padding: "64px 24px", color: "var(--color-text-secondary)", minHeight: "300px"
                    }}>
                      <CheckCircle2 size={48} style={{ opacity: 0.4, color: "var(--color-success)" }} />
                      <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text)" }}>No Upcoming Events</span>
                      <span style={{ fontSize: 13, opacity: 0.6 }}>All future hearings and payments are fully on track.</span>
                    </div>
                  ) : (
                    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
                      {upcomingItems.map(notif => renderNotifItem(notif, false))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "read" && (
                <div style={{ flex: 1, overflowY: "auto", padding: "16px 0 32px" }}>
                  {readItems.length === 0 ? (
                    <div style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
                      padding: "64px 24px", color: "var(--color-text-secondary)", minHeight: "300px"
                    }}>
                      <CheckCircle2 size={48} style={{ opacity: 0.4 }} />
                      <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text)" }}>Read Page is Empty</span>
                      <span style={{ fontSize: 13, opacity: 0.6 }}>Marked-as-read alerts will show up here.</span>
                    </div>
                  ) : (
                    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
                      {readItems.map(notif => renderNotifItem(notif, true))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer shortcuts (FROZEN) */}
            <div style={{
              display: "flex", gap: 16, padding: "16px 32px",
              borderTop: "1px solid var(--color-border)",
              background: "var(--color-surface, var(--color-card))",
            }}>
              <button
                className="primary-button" style={{ flex: 1, fontSize: 13, padding: "10px 0", fontWeight: 700, borderRadius: 8 }}
                onClick={() => { setOpen(false); navigate(ROUTES.HEARINGS); }}
              >
                📅 Manage Hearings
              </button>
              <button
                className="btn-gold" style={{ flex: 1, fontSize: 13, padding: "10px 0", fontWeight: 700, borderRadius: 8 }}
                onClick={() => { setOpen(false); navigate(ROUTES.PAYMENTS); }}
              >
                💸 Manage Payments
              </button>
              <button
                className="btn-neutral" style={{ flex: 1, fontSize: 13, padding: "10px 0", fontWeight: 700, borderRadius: 8 }}
                onClick={() => { setOpen(false); navigate(ROUTES.TASKS); }}
              >
                📋 View Tasks
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        
        .notif-bell-active { color: var(--color-primary) !important; }
        
        .notif-panel *::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .notif-panel *::-webkit-scrollbar-track {
          background: transparent;
        }
        .notif-panel *::-webkit-scrollbar-thumb {
          background: var(--color-border-soft, rgba(255,255,255,0.08));
          border-radius: 4px;
        }
        .notif-panel *::-webkit-scrollbar-thumb:hover {
          background: var(--color-border, rgba(255,255,255,0.18));
        }

        @media (max-width: 992px) {
          .notif-panel-body {
            flex-direction: column !important;
            overflow-y: auto !important;
          }
          .notif-panel-body > div {
            border-right: none !important;
            border-bottom: 1px solid var(--color-border) !important;
            flex: none !important;
            height: auto !important;
          }
          .col-scroll {
            overflow-y: visible !important;
          }
        }
      `}</style>
    </div>
  );
}

export default NotificationBell;
