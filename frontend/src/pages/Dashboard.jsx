import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import AppShell from "../components/AppShell";
import HeaderFilters from "../components/HeaderFilters";
import { supabasePlatformApi as platformApi } from "../repositories/supabaseRepository";
import { supabase } from "../services/supabaseClient";
import { getCache, setCache } from "../lib/cache";
import { currency, formatDate } from "../utils/formatters";
import { isLawyerFeeLabel } from "../utils/caseDomain";
import { getOrganizationId, getUserId, isDemo, getDemoExpiresAt } from "../services/authService";
import { TrendAreaChart } from "../components/DashboardCharts";
import DashboardSearchResults from "../components/DashboardSearchResults";
import { useTheme } from "../context/ThemeContext";
import { isOrgAdmin, sendMonthlyReport } from "../services/adminService";
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
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const { theme, toggleTheme } = useTheme();

  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const isDateInRange = useCallback((dateValue, fallbackDate = null) => {
    if (!fromDate && !toDate) return true;
    const dateStr = dateValue || fallbackDate;
    if (!dateStr) return false;
    
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return true;
    
    const start = fromDate ? new Date(fromDate) : null;
    const end = toDate ? new Date(toDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);

    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  }, [fromDate, toDate]);

  useEffect(() => {
    const refresh = async () => {
      try {
        const orgId = getOrganizationId();
        if (!orgId) {
          setPendingTaskCount(0);
          return;
        }

        const { count, error } = await supabase
          .from("tasks")
          .select("*", {
            count: "exact",
            head: true
          })
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .in("status", ["PENDING", "IN_PROGRESS"]);

        if (error) throw error;
        setPendingTaskCount(count || 0);
      } catch (err) {
        console.error("Dashboard failed to refresh task count", err);
        setPendingTaskCount(0);
      }
    };
    refresh();
    window.addEventListener("tasksUpdated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("tasksUpdated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Report sending state
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [reportMonth, setReportMonth] = useState(defaultMonth);
  const [reportState, setReportState] = useState({ loading: false, toast: null }); // toast: {type:'success'|'error', msg}

  const handleDateClick = (date) => {
    setAgendaDate(date);
  };

  const openAddEventModal = (date) => {
    setSelectedDate(date || agendaDate);
    setSelectedEvent(null);
    setEventModalOpen(true);
    setAgendaDate(null); // Close agenda when adding
  };

  const openEditEventModal = (event) => {
    setSelectedDate(event.event_date || event.date);
    setSelectedEvent(event);
    setEventModalOpen(true);
    setAgendaDate(null);
  };

  const handleSendReport = useCallback(async (isDownload = false) => {
    setReportState({ loading: true, toast: null });
    try {
      const result = await sendMonthlyReport(reportMonth, isDownload);
      
      if (isDownload && result?.blob) {
        // Direct download logic
        const url = window.URL.createObjectURL(result.blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", result.fileName || `Report_${reportMonth}.xlsx`);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        setReportState({
          loading: false,
          toast: { type: "success", msg: "Report download started." },
        });
      } else {
        setReportState({
          loading: false,
          toast: { type: "success", msg: result?.message || `Report sent to your email for ${reportMonth}` },
        });
      }
    } catch (err) {
      setReportState({
        loading: false,
        toast: { type: "error", msg: err?.message || "Failed to process report." },
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

      // Load calendar events
      const events = await platformApi.getCalendarEvents();
      setCalendarEvents(events || []);
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
          // For payments/fees, filter by due date as requested
          if (!isDateInRange(item.dueDate, item.createdAt)) return;

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
  }, [cases, isDateInRange]);

  const activeCaseCount = useMemo(
    () => cases.filter((item) => {
      if (!isDateInRange(item.createdAt)) return false;
      return !["CLOSED", "CLOSED_WON", "CLOSED_LOST"].includes(normalizeStatus(item.status));
    }).length,
    [cases, isDateInRange]
  );

  const clientTrendMonths = useMemo(() => lastMonths(clientChartRange), [clientChartRange]);
  const feeTrendMonths = useMemo(() => lastMonths(feeChartRange), [feeChartRange]);
  const clientsPerMonth = useMemo(
    () => buildMonthTrend(clientTrendMonths, clients.filter(c => isDateInRange(c.createdAt)), (client) => client.createdAt),
    [clients, clientTrendMonths, isDateInRange]
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
          
          const history = (legalCase.paymentHistory || []).filter(entry => {
            if (!isDateInRange(entry.createdAt || entry.paymentDate)) return false;
            return entry.isLawyerFee ||
                   isLawyerFeeLabel(entry.chargeLabel) ||
                   lawyerFeeChargeIds.has(String(entry.chargeItemId));
          });
          
          // Synthesize history logic omitted for brevity but applies to syntheticHistory as well
          const historyAmountsByChargeId = new Map();
          (legalCase.paymentHistory || []).forEach(h => {
            const chargeKey = String(h.chargeItemId);
            if (!lawyerFeeChargeIds.has(chargeKey)) return;
            historyAmountsByChargeId.set(chargeKey, (historyAmountsByChargeId.get(chargeKey) || 0) + Number(h.amount || 0));
          });

          const syntheticHistory = (legalCase.chargeItems || [])
            .filter(charge => charge.isLawyerFee || isLawyerFeeLabel(charge.label))
            .map(charge => {
              if (!isDateInRange(charge.createdAt || legalCase.createdAt)) return null;
              
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
    [cases, feeTrendMonths, isDateInRange]
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
    
    calendarEvents.forEach((evt) => {
      const isHearing = evt.event_type === "hearing";
      collection.push({
        ...evt,
        id: evt.id,
        type: evt.event_type === "note" ? "Note" : evt.event_type.charAt(0).toUpperCase() + evt.event_type.slice(1),
        title: evt.title,
        date: evt.event_date,
        key: toDateKey(evt.event_date),
        color: isHearing ? "#3b82f6" : evt.color, // Force blue for manual hearings too
        isManualEvent: true,
        client: "",
        caseNumber: "",
      });
    });

    return collection.filter((event) => event.key).sort((left, right) => new Date(left.date) - new Date(right.date));
  }, [cases, calendarEvents]);

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
    { label: "Total Clients", value: Number(summary?.totalClients ?? clients.length) },
    { label: "Active Cases", value: Number(activeCaseCount) },
    { label: "Overall Pending", value: currency(Number(finance.totalDue || 0)) },
    { label: "Lawyer Fees Due", value: currency(Number(finance.lawyerFeesDue || 0)) },
  ];

  const demoExpiresAt = getDemoExpiresAt();
  const demoRemainingMs = demoExpiresAt ? new Date(demoExpiresAt) - new Date() : 0;
  const demoRemainingDays = Math.max(0, Math.ceil(demoRemainingMs / (1000 * 60 * 60 * 24)));
  const isDemoMode = isDemo();

  return (
    <AppShell
      title="Dashboard"
      subtitle="Focused practice overview with controlled operational detail."
    >
      <div className="dashboard-premium-header">
        <div className="dashboard-action-row">
          <div className="dashboard-search-container">
            <HeaderFilters
              searchTerm={dashboardSearch}
              onSearchChange={setDashboardSearch}
              searchPlaceholder="Search dashboard..."
              onShowAll={() => {
                setDashboardSearch("");
              }}
            />
          </div>

          <div className="dashboard-top-actions">
            <button type="button" className="notification-trigger" onClick={() => setNotificationOpen(true)}>
              <span className="notif-bell">🔔</span>
              <span className="notif-text">Notifications ({priorityQueue.length + cashChecklist.length})</span>
            </button>
            <div className="task-btn-wrap">
              <Link to="/tasks" className="btn-gold dashboard-task-link">
                📋 Tasks
              </Link>
              {pendingTaskCount > 0 && (
                <span className="task-pending-badge" title={`${pendingTaskCount} pending tasks`}>
                  {pendingTaskCount > 99 ? "99+" : pendingTaskCount}
                </span>
              )}
            </div>
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
                <div className="dashboard-report-actions">
                  <button
                    type="button"
                    className="btn-report btn-report--email"
                    onClick={() => handleSendReport(false)}
                    disabled={reportState.loading}
                    title="Send monthly Excel report to your email"
                  >
                    {reportState.loading ? "..." : "📧 Email"}
                  </button>
                  <button
                    type="button"
                    className="btn-report btn-report--download"
                    onClick={() => handleSendReport(true)}
                    disabled={reportState.loading}
                    title="Download monthly Excel report directly"
                  >
                    {reportState.loading ? "..." : "📥 Download"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {reportState.toast && (
          <div className={`dashboard-report-toast dashboard-report-toast--${reportState.toast.type}`}>
            {reportState.toast.type === "success" ? "✅" : "❌"} {reportState.toast.msg}
          </div>
        )}
      </div>
      {error && <div className="form-error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      {isDemoMode && demoExpiresAt && (
        <div className="demo-countdown-banner" style={{
          backgroundColor: "rgba(255, 107, 53, 0.1)",
          border: "1px solid rgba(255, 107, 53, 0.3)",
          color: "#FF6B35",
          padding: "12px 16px",
          borderRadius: "8px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <div>
            <strong>Trial Mode Active:</strong> You have {demoRemainingDays} days remaining in your trial.
          </div>
          <Link to="/settings" className="btn-gold" style={{ padding: "6px 12px", fontSize: "14px" }}>
            Upgrade Now
          </Link>
        </div>
      )}

      {dashboardSearch ? (
        <DashboardSearchResults
          query={dashboardSearch}
          cases={cases}
          tasks={tasks}
          timelineEvents={putUpDates}
          onResultClick={() => setDashboardSearch("")}
        />
      ) : (
        <>
          <section className="dashboard-kpi-row">
            {kpis.map((item) => (
              <div key={item.label} className="dashboard-kpi-card-wrapper">
                <div className="dashboard-kpi-card">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              </div>
            ))}
          </section>

          <section className="dashboard-focus-grid">
            <div className="dashboard-left-column">
              <div className="standard-card card-tall">
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
                <div className="card-scroll chart-glow-wrapper">
                  <TrendAreaChart data={clientsPerMonth} valueFormatter={(value) => `${value}`} emptyMessage="No client trend data." />
                </div>
              </div>
              
              <div className="standard-card card-tall">
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
                <div className="card-scroll chart-glow-wrapper">
                  <TrendAreaChart data={paymentsPerMonth} valueFormatter={currency} emptyMessage="No fee collections recorded yet." />
                </div>
              </div>
            </div>

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
                <div className="dashboard-agenda-list">
                  {agendaItems.map((item) => (
                    <div key={item.id} className="dashboard-agenda-item">
                      {item.isManualEvent ? (
                        <button 
                          type="button" 
                          className="dashboard-agenda-link dashboard-agenda-editable" 
                          onClick={() => openEditEventModal(item)}
                        >
                          <span style={{ backgroundColor: item.color || "#A855F7" }}>{item.type}</span>
                          <strong>{item.title}</strong>
                          <small>View Details</small>
                        </button>
                      ) : (
                        <Link to={item.to} className="dashboard-agenda-link" onClick={() => setAgendaDate(null)}>
                          <span className={item.type === "Hearing" || item.type === "Follow-up" ? "badge-case-type" : ""}>{item.type}</span>
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
                <button type="button" className="btn-gold" onClick={() => openAddEventModal(agendaDate)}>+ Add Note</button>
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

      {eventModalOpen && createPortal(
        <EventModal
          selectedDate={selectedDate}
          selectedEvent={selectedEvent}
          onClose={() => {
            setEventModalOpen(false);
            setSelectedEvent(null);
            setSelectedDate(null);
          }}
          onSave={async (eventData) => {
            try {
              await platformApi.saveCalendarEvent(eventData, selectedEvent?.id);
              await loadDashboard(); // Reload to get updated events
              setEventModalOpen(false);
              setSelectedEvent(null);
              setSelectedDate(null);
            } catch (err) {
              alert("Failed to save event: " + err.message);
            }
          }}
          onDelete={async () => {
            if (!selectedEvent) return;
            if (!confirm("Delete this event?")) return;
            try {
              await platformApi.deleteCalendarEvent(selectedEvent.id);
              await loadDashboard();
              setEventModalOpen(false);
              setSelectedEvent(null);
              setSelectedDate(null);
            } catch (err) {
              alert("Failed to delete event: " + err.message);
            }
          }}
        />,
        document.body
      )}
    </AppShell>
  );
}

function EventModal({ selectedDate, selectedEvent, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    title: selectedEvent?.title || "",
    description: selectedEvent?.description || "",
    eventDate: selectedDate || selectedEvent?.event_date || "",
    eventType: selectedEvent?.event_type || "note",
    color: selectedEvent?.color || "#A855F7",
  });
  const [isEditing, setIsEditing] = useState(!selectedEvent);
  const [saving, setSaving] = useState(false);

  const eventTypes = [
    { value: "note", label: "Note", color: "#A855F7" },
    { value: "hearing", label: "Hearing", color: "#3b82f6" },
    { value: "deadline", label: "Deadline", color: "#DC2626" },
    { value: "meeting", label: "Meeting", color: "#16A34A" },
  ];

  const handleSave = async () => {
    if (!form.title.trim()) {
      alert("Title is required");
      return;
    }
    setSaving(true);
    try {
      const eventTypeData = eventTypes.find(t => t.value === form.eventType);
      await onSave({
        ...form,
        color: eventTypeData ? eventTypeData.color : form.color,
      });
    } catch (err) {
      // Error handled in onSave
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flow-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flow-modal flow-modal-sm">
        <div className="flow-modal-header">
          <div className="flow-modal-header-info">
            <h3>{selectedEvent ? (isEditing ? "Edit Event" : "View Event") : "Add Event"}</h3>
            <p>{selectedDate ? formatDate(new Date(selectedDate)) : ""}</p>
          </div>
          <button className="flow-modal-close" onClick={onClose}>x</button>
        </div>
        <div className="flow-modal-body">
          {isEditing ? (
            <div className="form-section">
              <div className="form-section-grid">
                <div className="field-group fcol-full">
                  <span className="field-label">Title *</span>
                  <input
                    value={form.title}
                    onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Event title"
                  />
                </div>
                <div className="field-group fcol-full">
                  <span className="field-label">Description</span>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={3}
                    placeholder="Optional description"
                  />
                </div>
                <div className="field-group">
                  <span className="field-label">Type</span>
                  <select
                    value={form.eventType}
                    onChange={(e) => setForm(f => ({ ...f, eventType: e.target.value }))}
                  >
                    {eventTypes.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="event-view-content">
              <div className="event-view-header">
                <span className="event-type-tag" style={{ backgroundColor: form.color }}>{form.eventType}</span>
                <h4>{form.title}</h4>
              </div>
              {form.description ? (
                <div className="event-view-description">
                  <h5>Description</h5>
                  <p>{form.description}</p>
                </div>
              ) : (
                <p className="empty-description">No description provided.</p>
              )}
            </div>
          )}
        </div>
        <div className="flow-modal-footer">
          <button className="btn-neutral" onClick={onClose}>Close</button>
          {selectedEvent && !isEditing && (
            <button className="btn-neutral" onClick={() => setIsEditing(true)}>Edit</button>
          )}
          {selectedEvent && isEditing && (
            <button className="btn-danger-soft" onClick={onDelete}>Delete</button>
          )}
          {isEditing && (
            <button className="btn-gold" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;




