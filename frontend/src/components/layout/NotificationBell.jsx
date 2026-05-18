import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, RefreshCw, CheckCircle2 } from "lucide-react";
import { ROUTES } from "../../constants/routes";
import { useNotifications } from "../../hooks/useNotifications";

const GROUP_ORDER = ["missed", "today", "upcoming", "overdue"];

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
  const totalCount = visible.length + pendingTaskCount;

  // Group visible notifications
  const groups = GROUP_ORDER.reduce((acc, key) => {
    const g = visible.filter(n => n.level === key);
    if (g.length) acc.push({ key, ...GROUP_META[key], items: g });
    return acc;
  }, []);

  return (
    <div ref={panelRef} style={{ position: "relative" }}>
      <button
        className="notification-trigger"
        onClick={() => setOpen(v => !v)}
        title="Notifications"
        style={{ position: "relative" }}
        aria-label={`${totalCount} notifications`}
      >
        <Bell size={20} className={`notif-bell${open ? " notif-bell-active" : ""}`} />
        {totalCount > 0 && (
          <span className="nav-badge" style={{ position: "absolute", top: -5, right: -5 }}>
            {totalCount > 99 ? "99+" : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel" style={{
          position: "absolute",
          top: "calc(100% + 10px)",
          right: 0,
          width: 360,
          maxHeight: 520,
          overflowY: "auto",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 16,
          boxShadow: "0 12px 48px rgba(0,0,0,0.18)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px 10px",
            borderBottom: "1px solid var(--color-border)",
            position: "sticky", top: 0,
            background: "var(--color-surface)",
            zIndex: 1,
          }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: "var(--color-text)" }}>
              🔔 Notifications
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => refresh(true)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", padding: 2 }}
                title="Refresh"
              >
                <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
              </button>
              {visible.length > 0 && (
                <button
                  onClick={() => {
                    const next = new Set([...dismissed, ...visible.map(n => n.id)]);
                    setDismissed(next);
                    localStorage.setItem("notif_dismissed", JSON.stringify([...next]));
                  }}
                  style={{ fontSize: 11, fontWeight: 700, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1 }}>
            {/* Pending tasks shortcut */}
            {pendingTaskCount > 0 && (
              <div
                onClick={() => { setOpen(false); navigate(ROUTES.TASKS); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 16px", cursor: "pointer",
                  borderBottom: "1px solid var(--color-border-soft, var(--color-border))",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-bg-hover, var(--color-bg))"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <span style={{ fontSize: 18 }}>📋</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--color-text)" }}>
                    {pendingTaskCount} Pending Task{pendingTaskCount !== 1 ? "s" : ""}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                    View your action items
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 800, background: "var(--color-primary)",
                  color: "#fff", borderRadius: 99, padding: "2px 8px",
                }}>
                  {pendingTaskCount}
                </span>
              </div>
            )}

            {/* Hearing & payment groups */}
            {groups.length === 0 && pendingTaskCount === 0 && (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                padding: "32px 16px", color: "var(--color-text-secondary)",
              }}>
                <CheckCircle2 size={32} style={{ opacity: 0.4 }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>All clear — no alerts</span>
                <span style={{ fontSize: 11, opacity: 0.6 }}>Hearings and payments are on track</span>
              </div>
            )}

            {groups.map(group => (
              <div key={group.key}>
                <div style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
                  textTransform: "uppercase", color: group.color,
                  padding: "8px 16px 4px",
                  background: `${group.color}0d`,
                }}>
                  {group.label}
                </div>
                {group.items.map(notif => (
                  <div
                    key={notif.id}
                    onClick={() => { setOpen(false); navigate(notif.link); }}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "10px 16px",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--color-border-soft, var(--color-border))",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--color-bg-hover, var(--color-bg))"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: notif.color,
                      marginTop: 6, flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 700, fontSize: 13, color: "var(--color-text)",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {notif.title}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 1 }}>
                        {notif.body}
                      </div>
                    </div>
                    <button
                      onClick={e => dismiss(e, notif.id)}
                      title="Dismiss"
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--color-text-tertiary, var(--color-text-secondary))",
                        fontSize: 16, lineHeight: 1, padding: "0 2px", flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            display: "flex", gap: 8, padding: "10px 14px",
            borderTop: "1px solid var(--color-border)",
            position: "sticky", bottom: 0,
            background: "var(--color-surface)",
          }}>
            <button
              className="btn-primary" style={{ flex: 1, fontSize: 12, padding: "7px 0" }}
              onClick={() => { setOpen(false); navigate(ROUTES.HEARINGS); }}
            >
              📅 Hearings
            </button>
            <button
              className="btn-gold" style={{ flex: 1, fontSize: 12, padding: "7px 0" }}
              onClick={() => { setOpen(false); navigate(ROUTES.PAYMENTS); }}
            >
              💸 Payments
            </button>
            <button
              className="btn-neutral" style={{ flex: 1, fontSize: 12, padding: "7px 0" }}
              onClick={() => { setOpen(false); navigate(ROUTES.TASKS); }}
            >
              📋 Tasks
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .notif-bell-active { color: var(--color-primary) !important; }
      `}</style>
    </div>
  );
}

export default NotificationBell;
