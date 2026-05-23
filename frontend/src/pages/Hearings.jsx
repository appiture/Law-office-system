import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import CaseIdentityCard from "../components/CaseIdentityCard";
import HeaderFilters from "../components/HeaderFilters";
import ControlledSearchPanel, { EmptyState, ErrorState, LoadingState, PaginationControls } from "../components/ControlledSearchPanel";
import CaseCombobox from "../components/CaseCombobox";
import { supabasePlatformApi as platformApi } from "../repositories/supabaseRepository";
import { supabase } from "../services/supabaseClient";
import {
  assertHearingPayload,
  getApiErrorMessage,
  normalizeHearingStatus,
  resolveOtherSelection,
  splitOtherSelection,
} from "../utils/validation";
import { formatDateTime, textOrDash } from "../utils/formatters";
import { openExport } from "../store/exportStore";
import logger from "../services/loggerService";
import { HEARING_STATUS } from "../constants/statuses";
import "./formStyles.css";

const EVENT_TYPES = ["HEARING", "DEADLINE", "JUDGMENT", "NOTE", "BAIL", "CHARGE", "SUBMISSION", "OTHER"];
const PAGE_SIZE = 25;
const emptyFilters = { searchTerm: "", type: "", status: "", fromDate: "", toDate: "" };

const ALERT_GROUPS = [
  { key:"missed",   label:"⚠️ Missed / Needs Attention", color:"var(--color-error)" },
  { key:"today",    label:"📅 Today",                    color:"var(--color-primary)" },
  { key:"upcoming", label:"🔔 Upcoming",                  color:"var(--color-warning)" },
  { key:"planned",  label:"📌 Planned",                   color:"var(--color-text-secondary)" },
  { key:"completed",label:"✅ Completed",                  color:"var(--color-success)" },
];

const toDateTimeLocal = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d)) return "";
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const emptyForm = {
  type:"HEARING", case_title:"", hearing_date:"", status: HEARING_STATUS.PENDING,
  notes:"", postponedTo:"", alertLevel:"", typeOther:"",
};

// ── FG helper ─────────────────────────────────────────────────
function FG({ label, required, hint, className, children }) {
  return (
    <div className={`field-group${className ? " "+className : ""}`}>
      <span className="field-label">{label}{required && <span className="required-star">*</span>}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

// ── Hearing Event Modal ───────────────────────────────────────
function EventModal({ caseId, editItem, cases: availableCases = [], onClose, onSaved }) {
  const isEdit = Boolean(editItem);
  const cases = availableCases;
  const [form, setForm] = useState(() => isEdit ? {
    caseId:      caseId || "",
    type:        splitOtherSelection(editItem.type, EVENT_TYPES, "OTHER").selected || "HEARING",
    typeOther:   splitOtherSelection(editItem.type, EVENT_TYPES, "OTHER").custom,
    case_title:  editItem.case_title  || editItem.title || "",
    hearing_date: toDateTimeLocal(editItem.hearing_date || editItem.scheduledAt),
    status:      normalizeHearingStatus(editItem.status),
    notes:       editItem.notes       || "",
    postponedTo: toDateTimeLocal(editItem.postponedTo),
  } : { caseId: caseId || "", ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const [toast,  setToast]  = useState(false);
  const closeTimerRef = useRef(null);

  useEffect(() => () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
  }, []);

  const set = (f, v) => { setForm(p => ({ ...p, [f]: v })); setError(""); };

  const save = async () => {
    if (!form.caseId)              { setError("Please select a case.");         return; }
    if (!form.case_title.trim())   { setError("Event title is required.");    return; }
    if (!form.hearing_date)        { setError("Scheduled date is required."); return; }
    if (form.type === "OTHER" && !form.typeOther.trim()) {
      setError("Please enter the custom event type."); return;
    }
    setSaving(true);
    try {
      const payload = {
        type:         resolveOtherSelection(form.type, form.typeOther, "OTHER"),
        title:        form.case_title,
        case_title:   form.case_title,
        scheduledAt:  form.hearing_date,
        hearing_date: form.hearing_date,
        status:       normalizeHearingStatus(form.status),
        notes:        form.notes || "",
        postponedTo:  normalizeHearingStatus(form.status) === HEARING_STATUS.POSTPONED ? (form.postponedTo || null) : null,
      };
      assertHearingPayload(payload);
      if (isEdit) await platformApi.updateHearing(form.caseId, editItem.id, payload);
      else        await platformApi.addHearing(form.caseId, payload);
      setToast(true);
      await onSaved();
      closeTimerRef.current = window.setTimeout(() => { setToast(false); onClose(); }, 2400);
    } catch (e) {
      setError("Failed: " + getApiErrorMessage(e, "Unable to save the event."));
    } finally { setSaving(false); }
  };

  return createPortal(
    <div className="flow-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flow-modal flow-modal-sm">

        <div className="flow-modal-header">
          <div className="flow-modal-header-info">
            <h3>{isEdit ? "✏️ Edit Timeline Event" : "➕ Add Timeline Event"}</h3>
            <p>{isEdit ? "Update the event details" : "Select a case and log a hearing, deadline, judgment, or note"}</p>
          </div>
          <button className="flow-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="flow-modal-body">
          {error && <div className="form-error-banner">⚠️ {error}</div>}

          <div className="form-section">
            <div className="form-section-title"><span>📌</span> Event Details</div>
            <div className="form-section-grid">
              <FG label="Select Case" required hint="Search and select a case by typing case number, client name, or case type">
                <CaseCombobox
                  value={form.caseId}
                  onChange={(value) => set("caseId", value)}
                  cases={cases}
                  placeholder="Search and select case..."
                />
              </FG>
              <FG label="Event Type" required>
                <select value={form.type} onChange={e => set("type", e.target.value)}>
                  {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </FG>
              {form.type === "OTHER" && (
                <FG label="Custom Event Type" required>
                  <input
                    value={form.typeOther}
                    onChange={e => set("typeOther", e.target.value)}
                    placeholder="Enter the event type"
                  />
                </FG>
              )}
              <FG label="Status">
                <select value={form.status} onChange={e => set("status", e.target.value)}>
                  <option value={HEARING_STATUS.PENDING}>Pending</option>
                  <option value={HEARING_STATUS.COMPLETED}>Completed</option>
                  <option value={HEARING_STATUS.POSTPONED}>Postponed</option>
                </select>
              </FG>
                <FG label="Event Title" required hint="E.g., Next Hearing Date, Submission Deadline, etc.">
                  <input
                    value={form.case_title}
                    onChange={e => set("case_title", e.target.value)}
                    placeholder="Enter event title"
                  />
                </FG>
                <FG label="Scheduled At" required>
                  <input
                    type="datetime-local"
                    value={form.hearing_date}
                    onChange={e => set("hearing_date", e.target.value)}
                  />
                </FG>{normalizeHearingStatus(form.status) === HEARING_STATUS.POSTPONED && (
                <FG label="Postponed To">
                  <input type="datetime-local" value={form.postponedTo}
                    onChange={e => set("postponedTo", e.target.value)} />
                </FG>
              )}
              <FG label="Notes / Remarks" className="fcol-full">
                <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={3}
                  placeholder="Any observations, instructions, or contextual notes…" />
              </FG>
            </div>
          </div>
        </div>

        <div className="flow-modal-footer">
           <button className="btn-neutral" style={{ color:"var(--color-error)" }} onClick={onClose}>Cancel</button>
          <button className="btn-gold" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "💾 Update Event" : "➕ Add Event"}
          </button>
        </div>
      </div>
      {toast && <div className="success-toast"><span>✅</span> Timeline event saved!</div>}
    </div>,
    document.body
  );
}

// ── Alert level status badge ───────────────────────────────────
const ALERT_STYLES = {
  missed:    { bg:"rgba(239, 68, 68, 0.1)",  color:"var(--color-error)", dot:"var(--color-error)"  },
  today:     { bg:"rgba(59, 130, 246, 0.1)",  color:"var(--color-primary)", dot:"var(--color-primary)"  },
  upcoming:  { bg:"rgba(245, 158, 11, 0.1)",   color:"var(--color-warning)", dot:"var(--color-warning)"  },
  planned:   { bg:"rgba(107, 114, 128, 0.1)",  color:"var(--color-text-secondary)", dot:"var(--color-text-tertiary)"  },
  completed: { bg:"rgba(34, 197, 94, 0.1)",  color:"var(--color-success)", dot:"var(--color-success)"  },
};

function TimelineNode({ item, onEdit, onComplete, onDelete }) {
  const st = ALERT_STYLES[item.alertLevel] || ALERT_STYLES.planned;
  const isReadOnly = item.isSyntheticCaseHearing || item.isManualCalendarEvent;

  return (
    <div key={item.id} style={{
      display:"grid", gridTemplateColumns:"14px 1fr", gap:12, position:"relative"
    }}>
      {/* Dot */}
      <div style={{
        width:14, height:14, borderRadius:"50%", background:st.dot,
        marginTop:12, flexShrink:0, zIndex:1,
        boxShadow:`0 0 0 3px ${st.dot}22`
      }} />
      {/* Content */}
      <div style={{ background:st.bg, borderRadius:14, padding:"12px 14px", display:"flex", flexDirection:"column", gap:6 }}>
        <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
          <div>
            <span style={{ fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.08em", color:st.color }}>
              {textOrDash(item.type)}
            </span>
            {isReadOnly && (
              <span style={{ marginLeft: 8, fontSize:10, fontWeight:700, color:"var(--color-text-tertiary)", background: "rgba(0,0,0,0.05)", padding: "2px 6px", borderRadius: 4 }}>
                {item.isSyntheticCaseHearing ? "📅 Case Field" : "📝 Calendar Note"}
              </span>
            )}
            <div style={{ fontWeight:800, color:"var(--color-text)", fontSize:14, marginTop:2 }}>{item.title}</div>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {!isReadOnly && normalizeHearingStatus(item.status) !== HEARING_STATUS.COMPLETED && (
              <button className="btn-edit-soft" onClick={() => onComplete(item)} style={{ fontSize:11 }}>
                ✔ Mark Done
              </button>
            )}
            {!isReadOnly && <button className="btn-edit-soft" onClick={() => onEdit(item)} style={{ fontSize:11 }}>Edit</button>}
            {!isReadOnly && <button className="btn-danger-soft" onClick={() => onDelete(item.id)} style={{ fontSize:11 }}>Remove</button>}
          </div>
        </div>
         <div style={{ fontSize:12, color:"var(--color-text-secondary)" }}>
           {item.status} · {formatDateTime(item.scheduledAt)}
           {item.postponedTo && <> · Postponed → {formatDateTime(item.postponedTo)}</>}
         </div>
         {item.notes && <p style={{ fontSize:13, color:"var(--color-text-secondary)", margin:0, lineHeight:1.5 }}>{item.notes}</p>}
      </div>
    </div>
  );
}

// ── Hearings Page ────────────────────────────────────────────
function Hearings() {
  const [cases,      setCases]      = useState([]);
  const [modalCases, setModalCases] = useState([]);
  const [eventModal, setEventModal] = useState(null); // { caseId, editItem? }
  const [searchParams] = useSearchParams();
  const { hearingId } = useParams();
  const initialSearchCase = searchParams.get("searchCase") || "";
  const highlightCaseId   = searchParams.get("highlightCase") || "";
  const [filters, setFilters] = useState({ ...emptyFilters, searchTerm: initialSearchCase });
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showAllMode, setShowAllMode] = useState(false);
  const [initialSearchTriggered, setInitialSearchTriggered] = useState(false);



  const loadData = useCallback(async ({ nextPage = page, showAll = showAllMode, nextFilters = filters } = {}) => {
    setLoading(true);
    setError("");
    try {
      const response = await platformApi.searchHearings({
        filters: nextFilters,
        showAll,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      // Group flat hearing items back into case-shaped objects for the render
      const flat = Array.isArray(response.items) ? response.items : [];
      const caseMap = new Map();
      for (const h of flat) {
        const cId = h.caseId || h.case_id;
        if (!caseMap.has(cId)) {
          caseMap.set(cId, {
            id: cId,
            caseNumber: h.caseNumber,
            caseType: h.caseType,
            clientName: h.clientName,
            client: h.client || { name: h.clientName },
            hearings: [],
          });
        }
        caseMap.get(cId).hearings.push(h);
      }
      setCases([...caseMap.values()]);
      setTotal(Number(response.total || 0));
      setPage(Number(response.page || nextPage));
      setHasLoaded(true);
      setShowAllMode(showAll);
    } catch (err) {
      logger.error("Failed to load timeline events", err);
      setError(err.message || "Failed to load timeline events.");
      setCases([]);
      setTotal(0);
      setHasLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [filters, page, showAllMode]);


  const ensureModalCases = async () => {
    if (modalCases.length > 0) return true;
    setModalLoading(true);
    try {
      const response = await platformApi.searchCases({ showAll: true, page: 1, pageSize: 500 });
      setModalCases(Array.isArray(response.items) ? response.items : []);
      return true;
    } catch (err) {
      logger.error("Failed to load cases for event modal", err);
      setError(err.message || "Failed to load cases for the event modal.");
      return false;
    } finally {
      setModalLoading(false);
    }
  };

  const openEventModal = async (payload = {}) => {
    const ready = await ensureModalCases();
    if (!ready) return;
    setEventModal(payload);
  };

  const openHearingModal = useCallback(async (id) => {
    setModalLoading(true);
    try {
      const { data, error } = await supabase
        .from("hearings")
        .select("*")
        .eq("id", id)
        .single();
      if (!error && data) {
        const editItem = {
          id: data.id,
          type: data.type,
          title: data.title,
          scheduledAt: data.scheduled_at || data.date,
          status: data.status,
          notes: data.notes,
          postponedTo: data.postponed_to,
        };
        await openEventModal({ caseId: data.case_id, editItem });
      }
    } catch (err) {
      logger.error("Failed to load hearing", err);
    } finally {
      setModalLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hearingId) {
      openHearingModal(hearingId);
    }
  }, [hearingId, openHearingModal]);

  // Scroll to and highlight a specific case card when arriving from a notification
  useEffect(() => {
    if (!highlightCaseId || cases.length === 0) return;
    const el = document.getElementById(`hearing-case-${highlightCaseId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightCaseId, cases]);

  const markCompleted = async (caseId, item) => {
    await platformApi.updateHearing(caseId, item.id, {
      type: item.type,
      title: item.title,
      case_title: item.title,
      scheduledAt: item.scheduledAt,
      hearing_date: item.scheduledAt,
      status: HEARING_STATUS.COMPLETED, notes: item.notes || "", postponedTo: item.postponedTo || null,
    });
    await loadData();
  };

  const deleteEvent = async (caseId, hearingId) => {
    if (!window.confirm("Remove this timeline event?")) return;
    await platformApi.deleteHearing(caseId, hearingId);
    await loadData();
  };

  const totalEvents = cases.reduce((sum, c) => sum + (c.hearings?.length || 0), 0);
  const handleSearch = useCallback((nextFilters = filters) => {
    setShowAllMode(false);
    void loadData({ nextPage: 1, showAll: false, nextFilters });
  }, [filters, loadData]);

  // Auto-load on mount only if there is an initial search case
  useEffect(() => {
    if (initialSearchCase && !initialSearchTriggered) {
      setInitialSearchTriggered(true);
      void loadData({ nextPage: 1, showAll: false, nextFilters: { ...emptyFilters, searchTerm: initialSearchCase } });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // Run only on mount

  // Re-run search when filters change
  useEffect(() => {
    const hasActiveFilters = Object.values(filters).some(Boolean);
    if (hasActiveFilters) {
      handleSearch(filters);
    } else if (hasLoaded && !showAllMode) {
      setCases([]);
      setTotal(0);
      setHasLoaded(false);
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.searchTerm, filters.type, filters.status, filters.fromDate, filters.toDate, hasLoaded, showAllMode]);

  const handleShowAll = () => {
    setShowAllMode(true);
    void loadData({ nextPage: 1, showAll: true });
  };

  return (
    <AppShell
      title="Timeline & Court Dates"
      subtitle="Central timeline for hearings, deadlines, and key case milestones — colour-coded by urgency."
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <button 
            type="button" 
            className="btn-gold header-action-btn" 
            onClick={() => openExport({
              type: "hearings",
              availableData: cases.flatMap(c =>
                (c.hearings || []).map(f => ({
                  ...f,
                  caseNumber:   c.caseNumber   || c.case_number,
                  clientName:   c.client?.name || c.clientName,
                  courtName:    c.courtName    || c.court_name,
                  lawyerName:   c.lawyerName   || c.lawyer_name,
                  title:        f.title        || f.description,
                  type:         f.type         || f.eventType,
                  postponed_to: f.postponedTo  || f.postponed_to,
                  notes:        f.notes        || f.description,
                  case: { caseNumber: c.caseNumber || c.case_number },
                }))
              ),
              currentFilters: filters,
              dateRange: { start: filters.fromDate, end: filters.toDate }
            })}
          >
            📥 Export
          </button>
          <button type="button" className="primary-button header-action-btn" onClick={() => void openEventModal({})} disabled={modalLoading}>
            {modalLoading ? "Loading..." : "+ Add Event"}
          </button>
        </div>
      }
    >
      <ErrorState message={error} />
      <HeaderFilters
        searchTerm={filters.searchTerm}
        onSearchChange={(val) => setFilters(p => ({ ...p, searchTerm: val }))}
        searchPlaceholder="Search events by any word..."
        dateRangeConfig={{
          label: "Event Date",
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          onFromDateChange: (val) => setFilters(p => ({ ...p, fromDate: val })),
          onToDateChange: (val) => setFilters(p => ({ ...p, toDate: val }))
        }}
        filters={[
          {
            id: "type",
            label: "Event Type",
            options: EVENT_TYPES.map((type) => ({ value: type, label: type }))
          },
          {
            id: "status",
            label: "Status",
            options: [
              { value: HEARING_STATUS.PENDING, label: "Pending" },
              { value: HEARING_STATUS.COMPLETED, label: "Completed" },
              { value: HEARING_STATUS.POSTPONED, label: "Postponed" }
            ]
          }
        ]}
        filterValues={{ type: filters.type, status: filters.status }}
        onFilterChange={(id, val) => setFilters(p => ({ ...p, [id]: val }))}
        onClearFilters={() => {
          setFilters(emptyFilters);
          setCases([]);
          setTotal(0);
          setHasLoaded(false);
          setShowAllMode(false);
          setError("");
        }}
        onShowAll={handleShowAll}
      />

      {hasLoaded && !loading && (
         <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 12 }}>
           {totalEvents} event{totalEvents !== 1 ? "s" : ""} in {total} case{total !== 1 ? "s" : ""}
         </div>
      )}

      <section className="card-grid">
        {loading && !hasLoaded ? (
          <LoadingState label="Loading timeline events..." />
        ) : error ? (
          <ErrorState message={error} />
        ) : !hasLoaded ? (
          <EmptyState 
            label="Search for cases or click 'Show All' to view hearings and events."
          />
        ) : cases.length === 0 ? (
          <EmptyState 
            label={showAllMode ? "No events found." : "No matching timeline events."}
          />
        ) : cases.map(legalCase => (
          <div
            key={legalCase.id}
            id={`hearing-case-${legalCase.id}`}
            style={highlightCaseId === String(legalCase.id) ? {
              outline: "2.5px solid var(--color-gold)",
              borderRadius: "14px",
              boxShadow: "0 0 0 5px var(--color-gold-bg), 0 8px 32px rgba(196,154,108,0.18)",
              animation: "highlightPulse 1.8s ease-in-out",
            } : {}}
          >
            <CaseIdentityCard
              item={legalCase}
              className="case-card-premium"
              detailsTarget={legalCase.id === "general-events" ? null : `/cases/${legalCase.id}#hearings-card`}
              pinnedContent={
                <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--color-border)" }}>
                  <div className="section-heading" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 8, justifyContent: 'flex-end' }}>
                    {legalCase.id !== "general-events" && (
                      <button className="btn-gold" style={{ fontSize:12, padding:"7px 12px" }}
                        onClick={() => void openEventModal({ caseId: legalCase.id })}>
                        + Add Event
                      </button>
                    )}
                  </div>
                  {/* Alert group legend */}
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {ALERT_GROUPS.map(g => {
                      const count = legalCase.hearings?.filter(f => f.alertLevel === g.key).length ?? 0;
                      return count > 0 ? (
                        <span key={g.key} style={{ fontSize:11, fontWeight:700, color:g.color, background:`${g.color}15`, padding:"3px 9px", borderRadius:999 }}>
                          {g.label} ({count})
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              }
            >
            <div className="mini-section" style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: "0 4px", position: "relative" }}>
              {legalCase.hearings?.length > 0 ? (
                <div style={{ position:"relative", paddingLeft:8, paddingBottom: 16 }}>
                  {/* Vertical line */}
                    <div style={{ position:"absolute", left:5, top:0, bottom:0, width:2, background:"linear-gradient(180deg,var(--color-gold-light),var(--color-border))", borderRadius:999 }} />
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {ALERT_GROUPS.flatMap(g =>
                    (legalCase.hearings || [])
                      .filter(f => f.alertLevel === g.key)
                      .map(item => (
                        <TimelineNode
                          key={item.id}
                          item={item}
                          onEdit={editItem => void openEventModal({ caseId: legalCase.id, editItem })}
                          onComplete={i => void markCompleted(legalCase.id, i)}
                          onDelete={id => void deleteEvent(legalCase.id, id)}
                        />
                      ))
                  )}
                  </div>
                </div>
              ) : (
                <div className="empty-box">
                  No events yet. Add a hearing or deadline to start tracking.
                </div>
              )}
            </div>
            </CaseIdentityCard>
          </div>
        ))}

        {hasLoaded && !loading && cases.length === 0 && <EmptyState label="No hearings match your filters." />}
      </section>

      <PaginationControls page={page} total={total} pageSize={PAGE_SIZE} onPageChange={(nextPage) => void loadData({ nextPage })} />

      {eventModal && (
        <EventModal
          caseId={eventModal.caseId}
          editItem={eventModal.editItem}
          cases={modalCases}
          onClose={() => setEventModal(null)}
          onSaved={loadData}
        />
      )}

    </AppShell>
  );
}

export default Hearings;




