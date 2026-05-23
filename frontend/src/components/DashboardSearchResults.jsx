import { useMemo } from "react";
import { Link } from "react-router-dom";
import { currency, formatDate } from "../utils/formatters";
import { usePermissions } from "../context/PermissionsContext";
import { ROUTES, getClientDetailsRoute, getCaseDetailsRoute } from "../constants/routes";
import "./DashboardSearchResults.css";

function normalizeStatus(status) {
  return String(status || "").trim().toUpperCase();
}

function getEventCase(item) {
  return item?.legalCase || item?.case || null;
}

function getEventCaseId(item) {
  return item?.caseId || getEventCase(item)?.id || item?.legalCaseId;
}

function getEventTitle(item) {
  return item?.title || item?.purpose || item?.type || "Timeline event";
}

function getEventDate(item) {
  return item?.scheduledAt || item?.postponedTo || item?.putUpDateTime || item?.date || item?.event_date;
}

function getEventLink(item) {
  const caseId = getEventCaseId(item);
  if (!caseId) return ROUTES.DASHBOARD;
  return `${getCaseDetailsRoute(caseId)}?focus=hearing&hearingId=${encodeURIComponent(item.id)}#hearing-${item.id}`;
}

function DashboardSearchResults({ query, cases, tasks, timelineEvents, onResultClick }) {
  const normalizedQuery = query.trim().toLowerCase();
  const { canAccess } = usePermissions();
  const canViewClients = canAccess("clients");
  const canViewCases = canAccess("cases");
  const canViewPayments = canAccess("payments");
  const canViewHearings = canAccess("hearings");
  const canViewTasks = canAccess("tasks");

  // 1. Extract and Filter Clients
  const matchedClients = useMemo(() => {
    const clientsMap = new Map();
    cases.forEach((c) => {
      if (c.client) {
        if (!clientsMap.has(c.client.id)) {
          clientsMap.set(c.client.id, { ...c.client, casesCount: 1, latestCaseId: c.id });
        } else {
          clientsMap.get(c.client.id).casesCount++;
        }
      }
    });

    const uniqueClients = Array.from(clientsMap.values());
    return uniqueClients.filter((client) => {
      return (
        String(client.name || "").toLowerCase().includes(normalizedQuery) ||
        String(client.email || "").toLowerCase().includes(normalizedQuery) ||
        String(client.phone || "").toLowerCase().includes(normalizedQuery)
      );
    });
  }, [cases, normalizedQuery]);

  // 2. Filter Cases
  const matchedCases = useMemo(() => {
    return cases.filter((c) => {
      return (
        String(c.caseNumber || "").toLowerCase().includes(normalizedQuery) ||
        String(c.caseType || "").toLowerCase().includes(normalizedQuery) ||
        String(c.caseDescription || "").toLowerCase().includes(normalizedQuery) ||
        String(c.courtName || "").toLowerCase().includes(normalizedQuery) ||
        String(c.assignedLawyer || "").toLowerCase().includes(normalizedQuery) ||
        String(c.status || "").toLowerCase().includes(normalizedQuery) ||
        String(c.client?.name || "").toLowerCase().includes(normalizedQuery)
      );
    });
  }, [cases, normalizedQuery]);

  // 3. Filter Team Tasks (Action Items)
  const matchedTeamTasks = useMemo(() => {
    return (tasks || []).filter((t) => {
      return (
        String(t.title || "").toLowerCase().includes(normalizedQuery) ||
        String(t.description || "").toLowerCase().includes(normalizedQuery) ||
        String(t.status || "").toLowerCase().includes(normalizedQuery) ||
        String(t.priority || "").toLowerCase().includes(normalizedQuery) ||
        String(t.legalCase?.caseNumber || "").toLowerCase().includes(normalizedQuery) ||
        String(t.legalCase?.client?.name || "").toLowerCase().includes(normalizedQuery)
      );
    });
  }, [tasks, normalizedQuery]);

  // 4. Filter Timeline Events (Hearings/Deadlines)
  const matchedTimelineEvents = useMemo(() => {
    return (timelineEvents || []).filter((e) => {
      return (
        String(getEventTitle(e)).toLowerCase().includes(normalizedQuery) ||
        String(e.notes || e.description || "").toLowerCase().includes(normalizedQuery) ||
        String(e.type || e.event_type || "").toLowerCase().includes(normalizedQuery) ||
        String(e.legalCase?.caseNumber || "").toLowerCase().includes(normalizedQuery) ||
        String(e.legalCase?.client?.name || "").toLowerCase().includes(normalizedQuery)
      );
    });
  }, [timelineEvents, normalizedQuery]);

  // 6. Filter Payment History
  const matchedPayments = useMemo(() => {
    return cases.flatMap((legalCase) =>
      (legalCase.paymentHistory || []).map((payment) => ({
        ...payment,
        caseId: legalCase.id,
        caseNumber: legalCase.caseNumber,
        clientName: legalCase.client?.name || "",
      }))
    ).filter((payment) => {
      return (
        String(payment.chargeLabel || "").toLowerCase().includes(normalizedQuery) ||
        String(payment.paymentMode || "").toLowerCase().includes(normalizedQuery) ||
        String(payment.paymentReference || "").toLowerCase().includes(normalizedQuery) ||
        String(payment.recordedBy || "").toLowerCase().includes(normalizedQuery) ||
        String(payment.caseNumber || "").toLowerCase().includes(normalizedQuery) ||
        String(payment.clientName || "").toLowerCase().includes(normalizedQuery)
      );
    });
  }, [cases, normalizedQuery]);

  // 7. Filter Charge Items
  const matchedCharges = useMemo(() => {
    return cases.flatMap((legalCase) =>
      (legalCase.chargeItems || []).map((charge) => ({
        ...charge,
        caseId: legalCase.id,
        caseNumber: legalCase.caseNumber,
        clientName: legalCase.client?.name || "",
      }))
    ).filter((charge) => {
      return (
        String(charge.label || "").toLowerCase().includes(normalizedQuery) ||
        String(charge.description || "").toLowerCase().includes(normalizedQuery) ||
        String(charge.status || "").toLowerCase().includes(normalizedQuery) ||
        String(charge.caseNumber || "").toLowerCase().includes(normalizedQuery) ||
        String(charge.clientName || "").toLowerCase().includes(normalizedQuery)
      );
    });
  }, [cases, normalizedQuery]);

  const totalResults =
    (canViewClients ? matchedClients.length : 0) +
    (canViewCases ? matchedCases.length : 0) +
    (canViewTasks ? matchedTeamTasks.length : 0) +
    (canViewHearings ? matchedTimelineEvents.length : 0) +
    (canViewPayments ? matchedPayments.length + matchedCharges.length : 0);

  if (totalResults === 0) {
    return (
      <div className="search-results-empty">
        <div className="empty-icon">🔍</div>
        <h3>No matching records found</h3>
        <p>We couldn't find any clients, cases, tasks, or court dates matching "{query}".</p>
      </div>
    );
  }

  return (
    <div className="global-search-results animate-fade-in">
      <div className="search-results-header">
        <h2>Search Results for "{query}"</h2>
        <span className="results-badge">{totalResults} found</span>
      </div>

      <div className="search-sections-grid">
        {/* Clients Section */}
        {canViewClients && matchedClients.length > 0 && (
          <div className="search-section">
            <h3 className="section-title">👥 Clients ({matchedClients.length})</h3>
            <div className="results-list">
              {matchedClients.map((client) => (
                <Link key={client.id} to={getClientDetailsRoute(client.id)} className="result-card premium-glass" onClick={onResultClick}>
                  <div className="result-main">
                    <strong>{client.name}</strong>
                    <div className="result-meta">
                      {client.email && <span>📧 {client.email}</span>}
                      {client.phone && <span>📞 {client.phone}</span>}
                    </div>
                  </div>
                  <div className="result-side">
                    <span className="count-pill">{client.casesCount} Cases</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Cases Section */}
        {canViewCases && matchedCases.length > 0 && (
          <div className="search-section">
            <h3 className="section-title">⚖️ Matters & Cases ({matchedCases.length})</h3>
            <div className="results-list">
              {matchedCases.map((c) => (
                <Link key={c.id} to={getCaseDetailsRoute(c.id)} className="result-card premium-glass" onClick={onResultClick}>
                  <div className="result-main">
                    <strong>{c.caseNumber || "Unnamed Case"}</strong>
                    <p className="result-sub">{c.client?.name || "Unknown Client"} • {c.caseType}</p>
                  </div>
                  <div className="result-side">
                    <span className={`status-badge ${normalizeStatus(c.status)}`}>{c.status || "RUNNING"}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Team Tasks Section */}
        {canViewTasks && matchedTeamTasks.length > 0 && (
          <div className="search-section">
            <h3 className="section-title">📋 Team Tasks ({matchedTeamTasks.length})</h3>
            <div className="results-list">
              {matchedTeamTasks.map((t) => (
                <Link key={t.id} to={ROUTES.TASKS} className="result-card premium-glass" onClick={onResultClick}>
                  <div className="result-main">
                    <strong>{t.title}</strong>
                    <p className="result-sub cutoff-text">{t.description || t.legalCase?.caseNumber || "Action Item"}</p>
                  </div>
                  <div className="result-side">
                    <span className={`status-badge ${String(t.status || "pending").toLowerCase()}`}>{t.status || "PENDING"}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Timeline Events Section */}
        {canViewHearings && matchedTimelineEvents.length > 0 && (
          <div className="search-section">
            <h3 className="section-title">📅 Court Dates & Hearings ({matchedTimelineEvents.length})</h3>
            <div className="results-list">
              {matchedTimelineEvents.map((e) => (
                <Link key={e.id} to={getEventLink(e)} className="result-card premium-glass" onClick={onResultClick}>
                  <div className="result-main">
                    <strong>{getEventTitle(e)}</strong>
                    <p className="result-sub cutoff-text">{e.notes || e.description || e.legalCase?.caseNumber || e.event_type || e.type || "Timeline Event"}</p>
                  </div>
                  <div className="result-side">
                    <span className={`status-badge hearing`}>{formatDate(getEventDate(e))}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}


        {/* Payments Section */}
        {canViewPayments && matchedPayments.length > 0 && (
          <div className="search-section">
            <h3 className="section-title">💰 Payment Records ({matchedPayments.length})</h3>
            <div className="results-list">
              {matchedPayments.map((payment) => (
                <Link key={payment.id} to={`${getCaseDetailsRoute(payment.caseId)}#payment-history`} className="result-card premium-glass" onClick={onResultClick}>
                  <div className="result-main">
                    <strong>{payment.chargeLabel}</strong>
                    <p className="result-sub">{payment.caseNumber} • {payment.clientName} • {payment.paymentMode}</p>
                  </div>
                  <div className="result-side">
                    <span className="amount-pill">{currency(payment.amount)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Charge Items Section */}
        {canViewPayments && matchedCharges.length > 0 && (
          <div className="search-section">
            <h3 className="section-title">⚖️ Fee Categories ({matchedCharges.length})</h3>
            <div className="results-list">
              {matchedCharges.map((charge) => (
                <Link key={charge.id} to={`${getCaseDetailsRoute(charge.caseId)}#charge-${charge.id}`} className="result-card premium-glass" onClick={onResultClick}>
                  <div className="result-main">
                    <strong>{charge.label}</strong>
                    <p className="result-sub">{charge.caseNumber} • {charge.clientName}</p>
                  </div>
                  <div className="result-side">
                    <span className={`status-badge ${String(charge.status).toLowerCase()}`}>{charge.status}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}


      </div>
    </div>
  );
}

export default DashboardSearchResults;




