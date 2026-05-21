import { useState, useEffect, useCallback, useMemo } from "react";
import { supabasePlatformApi as platformApi } from "../repositories/supabaseRepository";
import { getCache, setCache } from "../lib/cache";
import { getOrganizationId, getUserId } from "../services/authService";
import { isLawyerFeeLabel } from "../utils/caseDomain";
import { formatDate } from "../utils/formatters";
import logger from "../services/loggerService";

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

export function useDashboardData() {
  const [summary, setSummary] = useState(null);
  const [clients, setClients] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [hearings, setHearings] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [dashboardSearch, setDashboardSearch] = useState("");

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [agendaDate, setAgendaDate] = useState(null);
  const [calendarType, setCalendarType] = useState("all");
  const [clientChartRange, setClientChartRange] = useState(6);
  const [feeChartRange, setFeeChartRange] = useState(6);

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
      setMembers(payload.members || []);
      setHearings(payload.hearings);

      try {
        const events = await platformApi.getCalendarEvents();
        setCalendarEvents(events || []);
      } catch (calendarErr) {
        logger.warn("Failed to load dashboard calendar events", calendarErr);
        setCalendarEvents([]);
      }
    } catch (err) {
      logger.error("Failed to load dashboard", err);
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
          entityType: "hearing",
          entityId: legalCase.id,
          title: `Next hearing: ${legalCase.caseNumber}`,
          date: legalCase.nextHearingDate,
          key: toDateKey(legalCase.nextHearingDate),
          to: `/hearings?highlightCase=${legalCase.id}&searchCase=${encodeURIComponent(legalCase.caseNumber)}`,
          client: legalCase.client?.name || "Client",
          caseNumber: legalCase.caseNumber,
        });
      }

      (legalCase.hearings || []).forEach((item) => {
        const type = String(item.type || "").toUpperCase() === "DEADLINE" ? "Deadline" : "Hearing";
        const entityType = type === "Deadline" ? "deadline" : "hearing";
        collection.push({
          id: `hearing-${item.id}`,
          type,
          entityType,
          entityId: item.id,
          title: item.title || type,
          date: item.scheduledAt || item.postponedTo,
          key: toDateKey(item.scheduledAt || item.postponedTo),
          to: `/hearings?highlightCase=${legalCase.id}&searchCase=${encodeURIComponent(legalCase.caseNumber)}`,
          client: legalCase.client?.name || "Client",
          caseNumber: legalCase.caseNumber,
          caseId: legalCase.id,
          hearingId: item.id,
        });
      });

      (legalCase.chargeItems || []).forEach((item) => {
        if (!item.dueDate || Number(item.balanceAmount || 0) <= 0) return;
        collection.push({
          id: `fee-deadline-${item.id}`,
          type: "Deadline",
          entityType: "payment",
          entityId: item.id,
          title: `${item.label} due: ${legalCase.caseNumber}`,
          date: item.dueDate,
          key: toDateKey(item.dueDate),
          to: `/payments?highlightCase=${legalCase.id}&searchCase=${encodeURIComponent(legalCase.caseNumber)}`,
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
        entityType: "hearing",
        entityId: evt.id,
        title: evt.title,
        date: evt.event_date,
        key: toDateKey(evt.event_date),
        color: isHearing ? "#3b82f6" : evt.color,
        isManualEvent: true,
        client: "",
        caseNumber: "",
        to: ""
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

  const addCalendarEvent = useCallback(async (payload) => {
    try {
      const data = await platformApi.addCalendarEvent(payload);
      const events = await platformApi.getCalendarEvents();
      setCalendarEvents(events || []);
      return data;
    } catch (err) {
      logger.error("Failed to add calendar event", err);
      throw err;
    }
  }, []);

  const deleteCalendarEvent = useCallback(async (eventId) => {
    try {
      await platformApi.deleteCalendarEvent(eventId);
      const events = await platformApi.getCalendarEvents();
      setCalendarEvents(events || []);
    } catch (err) {
      logger.error("Failed to delete calendar event", err);
      throw err;
    }
  }, []);

  return {
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
    events,
    filteredEvents,
    calendarDays,
    agendaItems,
    addCalendarEvent,
    deleteCalendarEvent
  };
}
