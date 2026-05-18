import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import HeaderFilters from "../components/HeaderFilters";
import { currency, formatDate } from "../utils/formatters";
import { isOrgAdmin } from "../services/adminService";
import { openExport } from "../store/exportStore";
import { isDemo, getDemoExpiresAt } from "../services/authService";
import { useAppShell } from "../hooks/useAppShell";
import { TrendAreaChart } from "../components/DashboardCharts";
import DashboardSearchResults from "../components/DashboardSearchResults";
import DashboardKPIs from "../components/DashboardKPIs";
import DashboardCalendar from "../components/DashboardCalendar";
import { useDashboardData } from "../hooks/useDashboardData";
import { ROUTES } from "../constants/routes";
import "./Dashboard.css";
import "./formStyles.css";

function Dashboard() {
  const {
    summary,
    clients,
    cases,
    loading,
    error,
    tasks,
    members,
    hearings,
    calendarEvents,
    dashboardSearch,
    setDashboardSearch,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    calendarMonth,
    setCalendarMonth,
    agendaDate,
    setAgendaDate,
    calendarType,
    setCalendarType,
    clientChartRange,
    setClientChartRange,
    feeChartRange,
    setFeeChartRange,
    isDateInRange,
    finance,
    activeCaseCount,
    clientsPerMonth,
    paymentsPerMonth,
    calendarDays,
    agendaItems
  } = useDashboardData();

  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const filterPanelRef = useRef(null);
  const { pendingTaskCount } = useAppShell();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(event.target)) {
        setFilterPanelOpen(false);
      }
    };
    if (filterPanelOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [filterPanelOpen]);

  const QUICK_FILTERS = {
    THIS_MONTH: "this_month",
    LAST_MONTH: "last_month",
    THIS_YEAR: "this_year",
    CUSTOM: "custom"
  };

  const handleQuickFilter = (e) => {
    const val = e.target.value;
    if (val === QUICK_FILTERS.CUSTOM) {
      setFilterPanelOpen(true);
      return;
    }
    const start = new Date();
    const end = new Date();
    switch (val) {
      case "this_month":
        start.setDate(1);
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
        break;
      case "last_month":
        start.setMonth(start.getMonth() - 1);
        start.setDate(1);
        end.setDate(0);
        break;
      case "this_year":
        start.setMonth(0, 1);
        end.setMonth(11, 31);
        break;
      default:
        setFromDate("");
        setToDate("");
        return;
    }
    setFromDate(start.toISOString().split("T")[0]);
    setToDate(end.toISOString().split("T")[0]);
  };

  if (loading) {
    return (
      <AppShell title="Dashboard">
        <div className="premium-loader">Loading dashboard...</div>
      </AppShell>
    );
  }

  const demoExpiresAt = getDemoExpiresAt();
  const demoRemainingMs = demoExpiresAt ? new Date(demoExpiresAt) - new Date() : 0;
  const demoRemainingDays = Math.max(0, Math.ceil(demoRemainingMs / (1000 * 60 * 60 * 24)));
  const isDemoMode = isDemo();

  const dashboardActions = (
    <div className="dashboard-header-actions-wrapper" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
      <div className="task-btn-wrap" style={{ position: "relative" }}>
        <Link to={ROUTES.TASKS} className="btn-gold dashboard-task-link">
          📋 Tasks
        </Link>
        {pendingTaskCount > 0 && (
          <span className="badge-pending" title={`${pendingTaskCount} pending tasks`}>
            {pendingTaskCount > 99 ? "99+" : pendingTaskCount}
          </span>
        )}
      </div>
      
      <div className="dashboard-filter-dropdown-wrap" ref={filterPanelRef}>
        <select
           className="dashboard-quick-filter-select"
           value={fromDate || toDate ? "custom" : ""}
           onChange={handleQuickFilter}
        >
           <option value="">Select Range</option>
           <option value="this_month">This Month</option>
           <option value="last_month">Last Month</option>
           <option value="this_year">This Year</option>
           <option value="custom">Custom Range</option>
        </select>
        
        {filterPanelOpen && (
          <div className="dashboard-filter-panel">
            <div className="filter-panel-group">
              <label>Custom Range</label>
              <div className="date-range-inputs">
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                <span>to</span>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
            <button type="button" className="btn-primary panel-apply-btn" onClick={() => setFilterPanelOpen(false)}>
              Apply
            </button>
          </div>
        )}
      </div>

      {isOrgAdmin() && (
        <div className="dashboard-report-actions">
          <button
            type="button"
            className="btn-neutral"
            onClick={() => openExport({
              type: "dashboard",
              initialSendToEmail: true,
              currentFilters: { searchTerm: dashboardSearch },
              dateRange: { start: fromDate, end: toDate },
              availableData: [
                ...cases.filter(c => isDateInRange(c.createdAt)).map(c => ({
                  section: "Cases",
                  name: c.caseNumber,
                  title: c.title,
                  status: c.status,
                  caseNumber: c.caseNumber,
                  client: c.client,
                  createdAt: c.createdAt,
                })),
                ...clients.filter(c => isDateInRange(c.createdAt)).map(c => ({
                  section: "Clients",
                  name: c.name,
                  status: c.status || "Active",
                  createdAt: c.createdAt,
                })),
                ...tasks.filter(t => isDateInRange(t.createdAt || t.dueDate)).map(t => ({
                  section: "Tasks",
                  name: t.title || t.task,
                  status: t.status,
                  priority: t.priority,
                  dueDate: t.dueDate || t.due_date,
                  createdAt: t.createdAt,
                })),
                ...hearings.filter(f => isDateInRange(f.date)).map(f => ({
                  section: "Hearings",
                  name: f.title || f.caseNumber,
                  date: f.date,
                  status: f.status,
                  caseNumber: f.caseNumber,
                })),
                ...members.map(m => ({
                  section: "Team",
                  name: m.full_name || m.name || m.email,
                  role: m.role,
                  status: m.status,
                  email: m.email,
                  createdAt: m.created_at,
                })),
              ]
            })}
            title="Choose format and email this report to yourself"
          >
            📧 Email
          </button>
          <button
            type="button"
            className="btn-gold"
            onClick={() => openExport({
              type: "dashboard",
              currentFilters: { searchTerm: dashboardSearch },
              dateRange: { start: fromDate, end: toDate },
              availableData: [
                ...cases.filter(c => isDateInRange(c.createdAt)).map(c => ({
                  section: "Cases",
                  name: c.caseNumber,
                  title: c.title,
                  status: c.status,
                  caseNumber: c.caseNumber,
                  client: c.client,
                  createdAt: c.createdAt,
                })),
                ...clients.filter(c => isDateInRange(c.createdAt)).map(c => ({
                  section: "Clients",
                  name: c.name,
                  status: c.status || "Active",
                  createdAt: c.createdAt,
                })),
                ...tasks.filter(t => isDateInRange(t.createdAt || t.dueDate)).map(t => ({
                  section: "Tasks",
                  name: t.title || t.task,
                  status: t.status,
                  priority: t.priority,
                  dueDate: t.dueDate || t.due_date,
                  createdAt: t.createdAt,
                })),
                ...hearings.filter(f => isDateInRange(f.date)).map(f => ({
                  section: "Hearings",
                  name: f.title || f.caseNumber,
                  date: f.date,
                  status: f.status,
                  caseNumber: f.caseNumber,
                })),
                ...members.map(m => ({
                  section: "Team",
                  name: m.full_name || m.name || m.email,
                  role: m.role,
                  status: m.status,
                  email: m.email,
                  createdAt: m.created_at,
                })),
              ]
            })}
          >
            📥 Report
          </button>
        </div>
      )}
    </div>
  );

  return (
    <AppShell
      title="Dashboard"
      subtitle="Focused practice overview with controlled operational detail."
      actions={dashboardActions}
    >
      <div className="dashboard-premium-header">
        <div className="dashboard-header-row search-row">
          <HeaderFilters
            searchTerm={dashboardSearch}
            onSearchChange={setDashboardSearch}
            searchPlaceholder="Search your practice... (Cases, Clients, Hearings, etc.)"
          />
        </div>
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
          <Link to={ROUTES.SETTINGS} className="btn-gold" style={{ padding: "6px 12px", fontSize: "14px" }}>
            Upgrade Now
          </Link>
        </div>
      )}

      {dashboardSearch ? (
        <DashboardSearchResults
          query={dashboardSearch}
          cases={cases}
          tasks={tasks}
          timelineEvents={hearings}
          onResultClick={() => setDashboardSearch("")}
        />
      ) : (
        <>
          <DashboardKPIs 
            summary={summary}
            clients={clients}
            activeCaseCount={activeCaseCount}
            finance={finance}
          />

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

            <DashboardCalendar 
              calendarMonth={calendarMonth}
              setCalendarMonth={setCalendarMonth}
              calendarType={calendarType}
              setCalendarType={setCalendarType}
              calendarDays={calendarDays}
              calendarEvents={calendarEvents}
              handleDateClick={setAgendaDate}
              agendaDate={agendaDate}
              setAgendaDate={setAgendaDate}
              agendaItems={agendaItems}
            />
          </section>
        </>
      )}
    </AppShell>
  );
}

export default Dashboard;
