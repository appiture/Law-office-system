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
  agendaItems
}) {
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
              <div className="flow-modal-body">
                {agendaItems.length === 0 && <div className="empty-box">No events scheduled for this date.</div>}
                <div className="dashboard-agenda-list">
                  {agendaItems.map((item) => (
                    <div key={item.id} className="dashboard-agenda-item">
                      {item.isManualEvent ? (
                        <div className="dashboard-agenda-link dashboard-agenda-editable">
                          <span style={{ backgroundColor: item.color || "#A855F7" }}>{item.type}</span>
                          <strong>{item.title}</strong>
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
