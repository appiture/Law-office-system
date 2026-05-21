import React from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { formatDate } from "../utils/formatters";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function DashboardCalendar({
  calendarMonth,
  setCalendarMonth,
  calendarType,
  setCalendarType,
  calendarDays,
  calendarEvents,
  handleDateClick,
  agendaDate,
  setAgendaDate,
  agendaItems,
  onAddEvent,
  onDeleteEvent
}) {
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");
  const [newDescription, setNewDescription] = React.useState("");
  const [newColor, setNewColor] = React.useState("#3A5BA0");

  React.useEffect(() => {
    if (!agendaDate) {
      setShowAddForm(false);
      setNewTitle("");
      setNewDescription("");
      setNewColor("#3A5BA0");
    }
  }, [agendaDate]);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      await onAddEvent({
        title: newTitle.trim(),
        description: newDescription.trim(),
        event_date: agendaDate,
        color: newColor,
        event_type: "note"
      });
      setNewTitle("");
      setNewDescription("");
      setShowAddForm(false);
    } catch (err) {
      alert("Failed to add note: " + err.message);
    }
  };

  return (
    <>
      <div className="standard-card card-auto dashboard-calendar-card-full">
        <div className="dashboard-calendar-card">
          <div className="dashboard-calendar-header">
            <button type="button" className="dashboard-month-nav" aria-label="Previous month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>
              &lt;
            </button>
            <div className="dashboard-month-picker">
              <select
                value={calendarMonth.getMonth()}
                onChange={(event) => setCalendarMonth(new Date(calendarMonth.getFullYear(), Number(event.target.value), 1))}
              >
                {MONTH_NAMES.map((month, index) => (
                  <option key={month} value={index}>{month}</option>
                ))}
              </select>
              <select
                value={calendarMonth.getFullYear()}
                onChange={(event) => setCalendarMonth(new Date(Number(event.target.value), calendarMonth.getMonth(), 1))}
              >
                {Array.from({ length: 9 }, (_, index) => new Date().getFullYear() - 4 + index).map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <button type="button" className="dashboard-month-nav" aria-label="Next month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>
              &gt;
            </button>
          </div>
          <div className="dashboard-calendar-filters">
            {["all", "hearing", "deadline"].map((type) => (
              <button key={type} type="button" className={calendarType === type ? "active" : ""} onClick={() => setCalendarType(type)}>
                {type === "all" ? "All" : type}
              </button>
            ))}
          </div>
          <div className="dashboard-calendar-grid">
            {DAY_LABELS.map((label) => (
              <div key={label} className="dashboard-calendar-label">{label}</div>
            ))}
            {calendarDays.map((cell) => {
              if (cell.blank) {
                return <div key={cell.key} className="dashboard-calendar-cell is-blank" />;
              }

              const caseEventsCount = cell.events.filter(e => e.type === "Hearing").length;
              const feeEventsCount = cell.events.filter(e => e.type === "Deadline").length;
              const calendarEventCount = calendarEvents.filter(e => e.event_date === cell.key).length;

              return (
                <button
                  type="button"
                  key={cell.key}
                  className={`dashboard-calendar-cell ${cell.isToday ? "is-today" : ""}`}
                  onClick={() => handleDateClick(cell.key)}
                >
                  <span>{cell.day}</span>
                  <div className="dashboard-calendar-badges">
                    {caseEventsCount > 0 && <em className="badge-case" title="Case Events">{caseEventsCount}</em>}
                    {feeEventsCount > 0 && <em className="badge-fee" title="Fee Deadlines">{feeEventsCount}</em>}
                    {calendarEventCount > 0 && <em className="badge-note" title="Notes">{calendarEventCount}</em>}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="dashboard-calendar-legend">
            <div className="legend-item">
              <div className="legend-dot case-dot" /> Case Events
            </div>
            <div className="legend-item">
              <div className="legend-dot fee-dot" /> Fee Deadlines
            </div>
            <div className="legend-item">
              <div className="legend-dot note-dot" /> Notes
            </div>
          </div>
        </div>
      </div>

      {agendaDate &&
        createPortal(
          <div className="flow-modal-overlay" onClick={(event) => event.target === event.currentTarget && setAgendaDate(null)}>
            <div className="flow-modal flow-modal-sm">
              <div className="flow-modal-header">
                <div className="flow-modal-header-info">
                  <h3>Agenda: {formatDate(new Date(agendaDate))}</h3>
                  <p>{agendaItems.length} event{agendaItems.length !== 1 ? "s" : ""} scheduled</p>
                </div>
                <button type="button" className="flow-modal-close" onClick={() => setAgendaDate(null)}>x</button>
              </div>
              <div className="flow-modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <h4 style={{ margin: "0 0 10px 0", fontSize: "11px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6 }}>Scheduled Events</h4>
                  {agendaItems.length === 0 ? (
                    <div className="empty-box" style={{ padding: "12px", textAlign: "center", border: "1px dashed rgba(0,0,0,0.1)", borderRadius: "8px", fontSize: "13px" }}>No events scheduled for this date.</div>
                  ) : (
                    <div className="dashboard-agenda-list" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {agendaItems.map((item) => (
                        <div key={item.id} className="dashboard-agenda-item">
                          {item.isManualEvent ? (
                            <div className="dashboard-agenda-link" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textDecoration: "none" }}>
                              <div>
                                <span style={{ backgroundColor: item.color || "#A855F7", color: "white", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "800", textTransform: "uppercase", marginRight: "8px", display: "inline-block" }}>{item.type}</span>
                                <strong style={{ display: "block", marginTop: "4px" }}>{item.title}</strong>
                                {item.description && <p style={{ fontSize: "12px", opacity: 0.7, margin: "4px 0 0 0", fontWeight: "500" }}>{item.description}</p>}
                              </div>
                              <button
                                type="button"
                                className="btn-delete-event"
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", fontSize: "1.1rem", padding: "4px" }}
                                title="Delete note"
                                onClick={async () => {
                                  if (confirm("Are you sure you want to delete this calendar note?")) {
                                    try {
                                      await onDeleteEvent(item.id);
                                    } catch (err) {
                                      alert("Failed to delete note: " + err.message);
                                    }
                                  }
                                }}
                              >
                                🗑
                              </button>
                            </div>
                          ) : (
                            <Link to={item.to} className="dashboard-agenda-link" onClick={() => setAgendaDate(null)}>
                              <span className={item.type === "Hearing" ? "badge-case-type" : ""}>{item.type}</span>
                              <strong>{item.title}</strong>
                              <small>{formatDate(item.date)}</small>
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <hr style={{ border: "none", borderTop: "1px solid rgba(0,0,0,0.1)", margin: "8px 0" }} />

                <div>
                  {!showAddForm ? (
                    <button
                      type="button"
                      className="btn-gold"
                      style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}
                      onClick={() => setShowAddForm(true)}
                    >
                      ➕ Add Calendar Note
                    </button>
                  ) : (
                    <form onSubmit={handleAddNote} style={{ display: "flex", flexDirection: "column", gap: "12px", background: "rgba(0,0,0,0.02)", padding: "12px", borderRadius: "12px", border: "1px solid rgba(0,0,0,0.05)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h4 style={{ margin: 0, fontSize: "11px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-primary)" }}>New Calendar Note</h4>
                        <button type="button" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "700", color: "#EF4444" }} onClick={() => setShowAddForm(false)}>Cancel</button>
                      </div>

                      <div className="controlled-search-field">
                        <span style={{ fontSize: "11px", fontWeight: "700", opacity: 0.8 }}>Title</span>
                        <input
                          type="text"
                          required
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="e.g. File motion to dismiss"
                          className="standard-input"
                          style={{ padding: "8px 12px", borderRadius: "8px" }}
                        />
                      </div>

                      <div className="controlled-search-field">
                        <span style={{ fontSize: "11px", fontWeight: "700", opacity: 0.8 }}>Details (Optional)</span>
                        <textarea
                          value={newDescription}
                          onChange={(e) => setNewDescription(e.target.value)}
                          placeholder="Add any extra notes or instructions..."
                          className="standard-input"
                          style={{ padding: "8px 12px", borderRadius: "8px", fontFamily: "inherit", fontSize: "13px", resize: "vertical", minHeight: "60px", border: "1px solid rgba(0,0,0,0.1)", background: "var(--color-bg)", color: "var(--color-text)" }}
                        />
                      </div>

                      <div className="controlled-search-field">
                        <span style={{ fontSize: "11px", fontWeight: "700", opacity: 0.8 }}>Theme Color</span>
                        <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                          {[
                            { hex: "#3A5BA0", label: "Blue" },
                            { hex: "#C49A6C", label: "Gold" },
                            { hex: "#10B981", label: "Green" },
                            { hex: "#8B5CF6", label: "Purple" }
                          ].map((color) => (
                            <button
                              key={color.hex}
                              type="button"
                              onClick={() => setNewColor(color.hex)}
                              style={{
                                width: "24px",
                                height: "24px",
                                borderRadius: "50%",
                                backgroundColor: color.hex,
                                border: newColor === color.hex ? "3px solid var(--color-text)" : "1px solid rgba(0,0,0,0.2)",
                                cursor: "pointer",
                                transform: newColor === color.hex ? "scale(1.1)" : "none",
                                transition: "all 0.15s ease"
                              }}
                              title={color.label}
                            />
                          ))}
                        </div>
                      </div>

                      <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: "4px", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px" }}>
                        💾 Save Note
                      </button>
                    </form>
                  )}
                </div>
              </div>
              <div className="flow-modal-footer">
                <button type="button" className="btn-neutral" onClick={() => setAgendaDate(null)}>Close</button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export default DashboardCalendar;
