import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import AppShell from "../components/AppShell";
import HeaderFilters from "../components/HeaderFilters";
import { platformApi } from "../api/platform";
import { getCache, setCache } from "../lib/cache";
import { currency, formatDate } from "../utils/formatters";
import { isLawyerFeeLabel } from "../lib/caseDomain";
import { getOrganizationId, getUserId } from "../utils/auth";
import { TrendAreaChart } from "../components/DashboardCharts";
import DashboardSearchResults from "../components/DashboardSearchResults";
import { useTheme } from "../context/ThemeContext";
import BorderGlow from "../components/ui/BorderGlow/BorderGlow";
import { isOrgAdmin } from "../utils/admin";
import { sendMonthlyReport } from "../utils/admin";
import "./Dashboard.css";
import "./formStyles.css";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DASHBOARD_CACHE_TTL_MS = 60 * 1000;

function toDateKey(value) {
  if (typeof value === "string" && DATE_ONLY_REGEX.test(value.trim())) {
    return value.trim();
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toMonthKey(value) {
  if (typeof value === "string" && DATE_ONLY_REGEX.test(value.trim())) {
    return value.trim().slice(0, 7);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function lastMonths(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, label: monthLabel(date) };
  });
}

function normalizeStatus(status) {
  return String(status || "").toUpperCase();
}

function buildMonthTrend(seedMonths, records, getDate, getValue = () => 1) {
  const buckets = new Map(seedMonths.map((item) => [item.key, { label: item.label, value: 0 }]));
  records.forEach((record) => {
    const key = toMonthKey(getDate(record));
    if (!buckets.has(key)) return;
    buckets.get(key).value += Number(getValue(record) || 0);
  });
  return Array.from(buckets.values());
}

function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [clients, setClients] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [agendaDate, setAgendaDate] = useState(null);
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [clientChartRange, setClientChartRange] = useState(6);
  const [feeChartRange, setFeeChartRange] = useState(6);
  const [calendarType, setCalendarType] = useState("all");
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [putUpDates, setPutUpDates] = useState([]);
  const { theme, toggleTheme } = useTheme();

  // Report sending state
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [reportMonth, setReportMonth] = useState(defaultMonth);
  const [reportState, setReportState] = useState({ loading: false, toast: null }); // toast: {type:'success'|'error', msg}

  const handleSendReport = useCallback(async () => {
    setReportState({ loading: true, toast: null });
    try {
      const result = await sendMonthlyReport(reportMonth);
      setReportState({
        loading: false,
        toast: { type: "success", msg: result?.message || `Report sent to your email for ${reportMonth}` },
      });
    } catch (err) {
      setReportState({
        loading: false,
        toast: { type: "error", msg: err?.message || "Failed to send report." },
      });
    }
    // Auto-dismiss toast after 5 seconds
    setTimeout(() => setReportState((s) => ({ ...s, toast: null })), 5000);
  }, [reportMonth]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const cacheKey = `dashboard:${getOrganizationId() || "no-org"}:${getUserId() || "no-user"}`;
      const cachedPayload = getCache(cacheKey);
      const payload = cachedPayload || await platformApi.getDashboardPayload();
      if (!cachedPayload) {
        setCache(cacheKey, payload, DASHBOARD_CACHE_TTL_MS);
      }
      setSummary(payload.dashboard);
      setClients(payload.clients);
      setCases(payload.cases);
      setTasks(payload.tasks);
      setPutUpDates(payload.putUpDates);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
      setError(err.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const finance = useMemo(() => {
    return cases.reduce(
      (totals, legalCase) => {
        (legalCase.chargeItems || []).forEach((item) => {
          const due = Number(item.balanceAmount || 0);
          const paid = Number(item.paidAmount || 0);
          totals.totalDue += due;
          totals.totalPaid += paid;
          if (item.isLawyerFee || isLawyerFeeLabel(item.label)) {
            totals.lawyerFeesDue += due;
            totals.lawyerFeesPaid += paid;
          }
        });
        return totals;
      },
      { totalDue: 0, lawyerFeesDue: 0, totalPaid: 0, lawyerFeesPaid: 0 }
    );
  }, [cases]);

  const activeCaseCount = useMemo(
    () => cases.filter((item) => !["CLOSED", "CLOSED_WON", "CLOSED_LOST"].includes(normalizeStatus(item.status))).length,
    [cases]
  );

  const clientTrendMonths = useMemo(() => lastMonths(clientChartRange), [clientChartRange]);
  const feeTrendMonths = useMemo(() => lastMonths(feeChartRange), [feeChartRange]);
  const clientsPerMonth = useMemo(
    () => buildMonthTrend(clientTrendMonths, clients, (client) => client.createdAt),
    [clients, clientTrendMonths]
  );
  const paymentsPerMonth = useMemo(
    () =>
      buildMonthTrend(
        feeTrendMonths,
        cases.flatMap((legalCase) => {
          const lawyerFeeChargeIds = new Set(
            (legalCase.chargeItems || [])
              .filter(charge => charge.isLawyerFee || isLawyerFeeLabel(charge.label))
              .map(charge => String(charge.id))
          );
          const history = (legalCase.paymentHistory || []).filter(entry =>
            entry.isLawyerFee ||
            isLawyerFeeLabel(entry.chargeLabel) ||
            lawyerFeeChargeIds.has(String(entry.chargeItemId))
          );
          
          // Synthesize history for legacy charges that have paidAmount > 0 but missing history records
          const historyAmountsByChargeId = new Map();
          (legalCase.paymentHistory || []).forEach(h => {
            const chargeKey = String(h.chargeItemId);
            if (!lawyerFeeChargeIds.has(chargeKey)) return;
            historyAmountsByChargeId.set(chargeKey, (historyAmountsByChargeId.get(chargeKey) || 0) + Number(h.amount || 0));
          });

          const syntheticHistory = (legalCase.chargeItems || [])
            .filter(charge => charge.isLawyerFee || isLawyerFeeLabel(charge.label))
            .map(charge => {
              const recordedAmount = historyAmountsByChargeId.get(String(charge.id)) || 0;
              const actualPaid = Number(charge.paidAmount || 0);
              const unrecordedAmount = Math.max(0, actualPaid - recordedAmount);
              
              if (unrecordedAmount > 0) {
                return {
                  createdAt: charge.createdAt || legalCase.createdAt,
                  amount: unrecordedAmount,
                };
              }
              return null;
            })
            .filter(Boolean);

          return [...history, ...syntheticHistory];
        }),
        (entry) => entry.createdAt || entry.paymentDate,
        (entry) => entry.amount
      ),
    [cases, feeTrendMonths]
  );

  const events = useMemo(() => {
    const collection = [];
    cases.forEach((legalCase) => {
      if (legalCase.nextHearingDate) {
        collection.push({
          id: `case-hearing-${legalCase.id}`,
          type: "Hearing",
          title: `Next hearing: ${legalCase.caseNumber}`,
          date: legalCase.nextHearingDate,
          key: toDateKey(legalCase.nextHearingDate),
          to: `/cases/${legalCase.id}#case-card`,
          client: legalCase.client?.name || "Client",
          caseNumber: legalCase.caseNumber,
        });
      }

      (legalCase.followUps || []).forEach((item) => {
        const type = String(item.type || "").toUpperCase() === "DEADLINE" ? "Deadline" : String(item.type || "").toUpperCase() === "HEARING" ? "Hearing" : "Follow-up";
        collection.push({
          id: `followup-${item.id}`,
          type,
          title: item.title || type,
          date: item.scheduledAt || item.postponedTo,
          key: toDateKey(item.scheduledAt || item.postponedTo),
          to: `/cases/${legalCase.id}#followups-card`,
          client: legalCase.client?.name || "Client",
          caseNumber: legalCase.caseNumber,
        });
      });

      (legalCase.chargeItems || []).forEach((item) => {
        if (!item.dueDate || Number(item.balanceAmount || 0) <= 0) return;
        collection.push({
          id: `fee-deadline-${item.id}`,
          type: "Deadline",
          title: `${item.label} due: ${legalCase.caseNumber}`,
          date: item.dueDate,
          key: toDateKey(item.dueDate),
          to: `/cases/${legalCase.id}#payment-card`,
          client: legalCase.client?.name || "Client",
          caseNumber: legalCase.caseNumber,
        });
      });
    });
    return collection.filter((event) => event.key).sort((left, right) => new Date(left.date) - new Date(right.date));
  }, [cases]);

  const searchMatches = useCallback(
    (...values) => {
      const query = dashboardSearch.trim().toLowerCase();
      if (!query) return true;
      return values.some((value) => String(value || "").toLowerCase().includes(query));
    },
    [dashboardSearch]
  );

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        const typeMatch = calendarType === "all" || event.type.toLowerCase() === calendarType;
        return typeMatch && searchMatches(event.title, event.type, formatDate(event.date), event.client, event.caseNumber);
      }),
    [calendarType, events, searchMatches]
  );

  const priorityQueue = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return events
      .filter((event) => !event.id.startsWith("fee-deadline-"))
      .map((event) => {
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        return {
          ...event,
          isOverdue: eventDate < today,
        };
      })
      .filter((event) => event.isOverdue || event.type === "Hearing" || event.type === "Follow-up")
      .filter((event) => searchMatches(event.title, event.type, formatDate(event.date), event.client, event.caseNumber))
      .slice(0, 12);
  }, [events, searchMatches]);

  const cashChecklist = useMemo(
    () =>
      cases
        .flatMap((legalCase) =>
          (legalCase.chargeItems || [])
            .filter((item) => Number(item.balanceAmount || 0) > 0)
            .map((item) => ({
              id: `${legalCase.id}-${item.id}`,
              title: item.label,
              client: legalCase.client?.name || "Client",
              caseNumber: legalCase.caseNumber,
              amount: Number(item.balanceAmount || 0),
              dueDate: item.dueDate,
              status: item.status,
              to: `/cases/${legalCase.id}#payment-card`,
            }))
        )
        .filter((item) => searchMatches(item.title, item.client, item.caseNumber, item.status, formatDate(item.dueDate)))
        .sort((left, right) => Number(new Date(left.dueDate || "2999-12-31")) - Number(new Date(right.dueDate || "2999-12-31")))
        .slice(0, 12),
    [cases, searchMatches]
  );

  const calendarDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const lastDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    const cells = [];
    for (let index = 0; index < first.getDay(); index += 1) cells.push({ key: `blank-${index}`, blank: true });
    for (let day = 1; day <= lastDay; day += 1) {
      const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
      const key = toDateKey(date);
      cells.push({
        key,
        day,
        date,
        isToday: key === toDateKey(new Date()),
        events: filteredEvents.filter((event) => event.key === key),
      });
    }
    return cells;
  }, [calendarMonth, filteredEvents]);

  const agendaItems = useMemo(() => filteredEvents.filter((event) => event.key === agendaDate), [agendaDate, filteredEvents]);

  if (loading) {
    return (
      <AppShell title="Dashboard">
        <div className="premium-loader">Loading dashboard...</div>
      </AppShell>
    );
  }

  const kpis = [
    { label: "Total Clients", value: summary?.totalClients ?? clients.length },
    { label: "Active Cases", value: activeCaseCount },
    { label: "Overall Pending", value: currency(finance.totalDue) },
    { label: "Lawyer Fees Due", value: currency(finance.lawyerFeesDue) },
  ];

  return (
    <AppShell
      title="Dashboard"
      subtitle="Focused practice overview with controlled operational detail."
      actions={
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      }
    >
      <div className="dashboard-premium-header">
        <div className="dashboard-search-container">
          <HeaderFilters
            searchTerm={dashboardSearch}
            onSearchChange={setDashboardSearch}
            searchPlaceholder="Search anything in your dashboard..."
          />
        </div>
        <div className="dashboard-action-row">
          <button type="button" className="btn-neutral notification-trigger" onClick={() => setNotificationOpen(true)}>
            <span className="notif-bell">🔔</span>
            Notifications ({priorityQueue.length + cashChecklist.length})
          </button>
          <Link to="/tasks" className="btn-gold dashboard-task-link">
            Tasks
          </Link>
          {isOrgAdmin() && (
            <div className="dashboard-report-group">
              <input
                type="month"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                className="dashboard-month-input"
                disabled={reportState.loading}
                aria-label="Report month"
              />
              <button
                type="button"
                className="btn-report"
                onClick={handleSendReport}
                disabled={reportState.loading}
                title="Send monthly Excel report to your email"
              >
                {reportState.loading ? "Sending…" : "📊 Send Report"}
              </button>
            </div>
          )}
        </div>
        {reportState.toast && (
          <div className={`dashboard-report-toast dashboard-report-toast--${reportState.toast.type}`}>
            {reportState.toast.type === "success" ? "✅" : "❌"} {reportState.toast.msg}
          </div>
        )}
      </div>
      {error && <div className="form-error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      {dashboardSearch ? (
        <DashboardSearchResults
          query={dashboardSearch}
          cases={cases}
          tasks={tasks}
          putUpDates={putUpDates}
          onResultClick={() => setDashboardSearch("")}
        />
      ) : (
        <>
          <section className="dashboard-kpi-row">
            {kpis.map((item) => (
              <div key={item.label} className="dashboard-kpi-card-wrapper">
                <BorderGlow 
                  borderRadius={20} 
                  glowIntensity={0.5} 
                  glowRadius={20} 
                  continuous={true}
                  backgroundColor="var(--color-card)"
                >
                  <div className="dashboard-kpi-card">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                </BorderGlow>
              </div>
            ))}
          </section>

          <section className="dashboard-focus-grid">
            <div className="dashboard-left-column">
              <BorderGlow 
                borderRadius={24} 
                glowIntensity={0.5} 
                glowRadius={30} 
                className="chart-glow-wrapper"
                backgroundColor="var(--color-card)"
                continuous={true}
              >
                <div className="dashboard-chart-card">
                  <div className="dashboard-panel-title">
                    <div>
                      <h3>Clients per month</h3>
                      <span>Last {clientChartRange} months</span>
                    </div>
                    <div className="dashboard-filter-pills">
                      {[3, 6, 12].map((range) => (
                        <button key={range} type="button" className={clientChartRange === range ? "active" : ""} onClick={() => setClientChartRange(range)}>
                          {range}M
                        </button>
                      ))}
                    </div>
                  </div>
                  <TrendAreaChart data={clientsPerMonth} valueFormatter={(value) => `${value}`} emptyMessage="No client trend data." />
                </div>
              </BorderGlow>
              
              <BorderGlow 
                borderRadius={24} 
                glowIntensity={0.5} 
                glowRadius={30} 
                className="chart-glow-wrapper"
                backgroundColor="var(--color-card)"
                continuous={true}
              >
                <div className="dashboard-chart-card">
                  <div className="dashboard-panel-title">
                    <div>
                      <h3>Fee Collections</h3>
                      <span>Last {feeChartRange} months</span>
                    </div>
                    <div className="dashboard-filter-pills">
                      {[3, 6, 12].map((range) => (
                        <button key={range} type="button" className={feeChartRange === range ? "active" : ""} onClick={() => setFeeChartRange(range)}>
                          {range}M
                        </button>
                      ))}
                    </div>
                  </div>
                  <TrendAreaChart data={paymentsPerMonth} valueFormatter={currency} emptyMessage="No fee collections recorded yet." />
                </div>
              </BorderGlow>
            </div>

            <aside className="dashboard-calendar-card-wrapper">
              <BorderGlow borderRadius={24} glowIntensity={0.5} glowRadius={30}>
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
                    {["all", "hearing", "deadline", "follow-up"].map((type) => (
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

                      const caseEventsCount = cell.events.filter(e => e.type === "Hearing" || e.type === "Follow-up").length;
                      const feeEventsCount = cell.events.filter(e => e.type === "Deadline").length;

                      return (
                        <button
                          type="button"
                          key={cell.key}
                          className={`dashboard-calendar-cell ${cell.isToday ? "is-today" : ""}`}
                          onClick={() => setAgendaDate(cell.key)}
                        >
                          <span>{cell.day}</span>
                          <div className="dashboard-calendar-badges">
                            {caseEventsCount > 0 && <em className="badge-case" title="Case Events">{caseEventsCount}</em>}
                            {feeEventsCount > 0 && <em className="badge-fee" title="Fee Deadlines">{feeEventsCount}</em>}
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
                  </div>
                </div>
              </BorderGlow>
            </aside>
          </section>
        </>
      )}

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
                {agendaItems.map((item) => (
                  <Link key={item.id} to={item.to} className="dashboard-agenda-link" onClick={() => setAgendaDate(null)}>
                    <span>{item.type}</span>
                    <strong>{item.title}</strong>
                    <small>{formatDate(item.date)}</small>
                  </Link>
                ))}
              </div>
              <div className="flow-modal-footer">
                <button type="button" className="btn-neutral" onClick={() => setAgendaDate(null)}>Close</button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {notificationOpen &&
        createPortal(
          <div className="flow-modal-overlay" onClick={(event) => event.target === event.currentTarget && setNotificationOpen(false)}>
            <div className="flow-modal dashboard-notification-modal">
              <div className="flow-modal-header">
                <div className="flow-modal-header-info">
                  <h3>Notifications</h3>
                  <p>Priority queue and cash checklist from the dashboard.</p>
                </div>
                <button type="button" className="flow-modal-close" onClick={() => setNotificationOpen(false)}>x</button>
              </div>
              <div className="flow-modal-body">
                <div className="dashboard-notification-grid">
                  <section className="dashboard-notification-panel">
                    <div className="dashboard-panel-title">
                      <h3>Priority Queue</h3>
                      <span>{priorityQueue.length} items</span>
                    </div>
                    <div className="dashboard-notification-list">
                      {priorityQueue.map((item) => (
                        <Link key={item.id} to={item.to} className={`dashboard-priority-item ${item.isOverdue ? "is-overdue" : ""}`} onClick={() => setNotificationOpen(false)}>
                          <span>{item.type}</span>
                          <strong>{item.title}</strong>
                          <small>{formatDate(item.date)}{item.isOverdue ? " · Overdue" : ""}</small>
                        </Link>
                      ))}
                      {priorityQueue.length === 0 && <div className="empty-box">No priority items match the current search.</div>}
                    </div>
                  </section>

                  <section className="dashboard-notification-panel">
                    <div className="dashboard-panel-title">
                      <h3>Cash Checklist</h3>
                      <span>{cashChecklist.length} items</span>
                    </div>
                    <div className="dashboard-notification-list">
                      {cashChecklist.map((item) => (
                        <Link key={item.id} to={item.to} className={`dashboard-cash-item ${String(item.status).toLowerCase() === "overdue" ? "is-overdue" : ""}`} onClick={() => setNotificationOpen(false)}>
                          <span>{item.status || "Pending"}</span>
                          <strong>{item.title}</strong>
                          <div>
                            <small>{item.client} · {item.caseNumber}</small>
                            <b>{currency(item.amount)}</b>
                          </div>
                        </Link>
                      ))}
                      {cashChecklist.length === 0 && <div className="empty-box">No cash checklist items match the current search.</div>}
                    </div>
                  </section>
                </div>
              </div>
              <div className="flow-modal-footer">
                <button type="button" className="btn-neutral" onClick={() => setNotificationOpen(false)}>Close</button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </AppShell>
  );
}

export default Dashboard;
