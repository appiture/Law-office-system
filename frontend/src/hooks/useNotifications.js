import { useEffect, useState, useCallback } from "react";
import { supabase } from "../services/supabaseClient";
import { getOrganizationId } from "../services/authService";
import { ROUTES } from "../constants/routes";
import { getCache, setCache } from "../lib/cache";

const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * Derive an alert level and link for a hearing row.
 */
function classifyHearing(h) {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const dateStr = h.scheduled_at || h.date;
  const d = dateStr ? new Date(dateStr) : null;
  if (!d || isNaN(d)) return null;

  const status = h.status || "PENDING";
  const isPending = status !== "COMPLETED" && status !== "CANCELLED";
  if (!isPending) return null;

  if (d < todayStart) {
    return { level: "missed", emoji: "⚠️", label: "Missed", color: "var(--color-error)" };
  }
  if (d >= todayStart && d <= todayEnd) {
    return { level: "today", emoji: "📅", label: "Today", color: "var(--color-primary)" };
  }
  // Upcoming = within 7 days
  const sevenDays = new Date(todayEnd);
  sevenDays.setDate(sevenDays.getDate() + 6);
  if (d <= sevenDays) {
    return { level: "upcoming", emoji: "🔔", label: "Upcoming", color: "var(--color-warning)" };
  }
  return null; // beyond 7 days — not urgent
}

/**
 * Returns all actionable notifications:
 *   - Missed / today / upcoming hearings
 *   - Overdue payment charges (balance > 0 && due_date < today)
 */
export function useNotifications() {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [lastFetched, setLastFetched] = useState(null);

  const refresh = useCallback(async (force = false) => {
    const orgId = getOrganizationId();
    if (!orgId) { setItems([]); return; }

    const cacheKey = `notifications:${orgId}`;
    if (!force) {
      const cached = getCache(cacheKey);
      if (cached) { setItems(cached); return; }
    }

    setLoading(true);
    try {
      const now    = new Date();
      const today  = now.toISOString().split("T")[0];
      // Fetch hearings: not completed/cancelled, within next 7 days OR already past
      const sevenAhead = new Date(now);
      sevenAhead.setDate(sevenAhead.getDate() + 7);

      const [hearingRes, chargeRes, eventsRes, casesRes] = await Promise.all([
        supabase
          .from("hearings")
          .select("id, case_id, type, title, date, scheduled_at, status, cases(case_number, case_type, clients(name))")
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .lte("date", sevenAhead.toISOString())
          .order("date", { ascending: true })
          .limit(150),

        supabase
          .from("payment_charges")
          .select("id, case_id, name, total, paid, balance, due_date, status, cases(case_number, case_type, clients(name))")
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .gt("balance", 0)
          .order("due_date", { ascending: true })
          .limit(50),

        supabase
          .from("calendar_events")
          .select("*")
          .eq("organization_id", orgId)
          .eq("event_type", "hearing")
          .lte("event_date", sevenAhead.toISOString())
          .order("event_date", { ascending: true })
          .limit(50),

        supabase
          .from("cases")
          .select("id, case_number, case_type, status, details, clients(name)")
          .eq("organization_id", orgId)
          .is("deleted_at", null)
      ]);

      const notifications = [];

      const allHearings = [...(hearingRes.data || [])];
      
      // Map manual calendar events
      for (const evt of (eventsRes.data || [])) {
        allHearings.push({
          id: evt.id,
          case_id: null,
          type: "HEARING",
          title: evt.title || "Hearing",
          date: evt.event_date,
          scheduled_at: evt.event_date,
          status: "PENDING",
        });
      }

      // Map synthetic hearings from cases
      for (const c of (casesRes.data || [])) {
        const nextHearingDate = c.details?.nextHearingDate;
        if (nextHearingDate) {
          allHearings.push({
            id: `case-hearing-${c.id}`,
            case_id: c.id,
            type: "HEARING",
            title: `Next hearing: ${c.case_number}`,
            date: nextHearingDate,
            scheduled_at: nextHearingDate,
            status: "PENDING",
            cases: {
              case_number: c.case_number,
              case_type: c.case_type,
              clients: c.clients
            }
          });
        }
      }

      // ── Hearing alerts ──────────────────────────────────────────
      for (const h of allHearings) {
        const cls = classifyHearing(h);
        if (!cls) continue;
        const dateStr = h.scheduled_at || h.date
          ? new Date(h.scheduled_at || h.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
          : "—";
        notifications.push({
          id:          `hearing-${h.id}`,
          type:        "hearing",
          level:       cls.level,
          emoji:       cls.emoji,
          label:       cls.label,
          color:       cls.color,
          title:       h.title || h.type || "Court Event",
          body:        dateStr,
          link:        h.case_id ? `${ROUTES.HEARINGS}?searchCase=${encodeURIComponent(h.cases?.case_number || '')}&highlightCase=${h.case_id}` : ROUTES.DASHBOARD,
          // RICH DETAILS:
          caseNumber:  h.cases?.case_number || "—",
          caseType:    h.cases?.case_type || "—",
          clientName:  h.cases?.clients?.name || (Array.isArray(h.cases?.clients) ? h.cases?.clients[0]?.name : undefined) || "—",
          hearingType: h.type || "—",
          hearingDate: dateStr,
        });
      }

      // ── Payment overdue & upcoming alerts ───────────────────────
      for (const c of (chargeRes.data || [])) {
        const dueStr = c.due_date
          ? new Date(c.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
          : "—";
        const balance = c.balance != null ? Number(c.balance) : Number(c.total || 0) - Number(c.paid || 0);
        const paid = Number(c.paid || 0);
        const isOverdue = c.due_date && c.due_date < today;
        
        let label = "Pending Payment";
        let level = "upcoming";
        let color = "var(--color-primary)";

        if (isOverdue) {
          label = "Payment Overdue";
          level = "overdue";
          color = "var(--color-error)";
        } else if (paid > 0) {
          label = "Partial Payment Due";
          color = "var(--color-warning)";
        }

        // Only show upcoming notifications if they have a due date within the next 30 days or are overdue
        const thirtyDays = new Date(now);
        thirtyDays.setDate(thirtyDays.getDate() + 30);
        const thirtyDaysStr = thirtyDays.toISOString().split("T")[0];
        
        if (!isOverdue && (!c.due_date || c.due_date > thirtyDaysStr)) {
          continue; // skip payments due way in the future
        }

        notifications.push({
          id:            `charge-${c.id}`,
          type:          "payment",
          level:         level,
          emoji:         "💸",
          label:         label,
          color:         color,
          title:         c.name || "Fee Charge",
          body:          `Due: ${dueStr} · ₹${balance.toLocaleString("en-IN")} pending`,
          link:          ROUTES.PAYMENTS,
          // RICH DETAILS:
          caseNumber:    c.cases?.case_number || "—",
          caseType:      c.cases?.case_type || "—",
          clientName:    c.cases?.clients?.name || "—",
          feeName:       c.name || "—",
          totalAmount:   Number(c.total || 0),
          paidAmount:    Number(c.paid || 0),
          balanceAmount: balance,
          dueDate:       dueStr,
        });
      }

      setItems(notifications);
      setCache(cacheKey, notifications, CACHE_TTL);
      setLastFetched(new Date());
    } catch (err) {
      console.error("[useNotifications]", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => refresh(true), CACHE_TTL);
    return () => clearInterval(id);
  }, [refresh]);

  return { items, loading, lastFetched, refresh };
}
