import { useEffect, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import CaseIdentityCard from "../components/CaseIdentityCard";
import HeaderFilters from "../components/HeaderFilters";
import ControlledSearchPanel, { EmptyState, ErrorState, LoadingState, PaginationControls } from "../components/ControlledSearchPanel";
import { supabasePlatformApi as platformApi } from "../repositories/supabaseRepository";
import {
  assertCasePayload,
  getApiErrorMessage,
  resolveOtherSelection,
  splitOtherSelection,
} from "../utils/validation";
import { formatDateTime } from "../utils/formatters";
import { getUserRole } from "../services/authService";
import ExportModal from "../components/ExportModal";
import "./formStyles.css";

const CASE_TYPES = [
  "Civil", "Criminal", "Family", "Property", "Consumer",
  "Labour", "Tax", "Corporate", "Constitutional", "Other"
];

const STATUS_OPTIONS = [
  { value: "RUNNING",      label: "Running" },
  { value: "PENDING",      label: "Pending" },
  { value: "WAITING",      label: "Waiting – Next Date" },
  { value: "CLOSED_WON",  label: "Closed – Won" },
  { value: "CLOSED_LOST", label: "Closed – Lost" },
  { value: "CLOSED",      label: "Closed – Other" },
  { value: "ON_HOLD",     label: "On Hold" },
];

const PAGE_SIZE = 25;
const emptyFilters = { searchTerm: "", caseType: "", status: "", fromDate: "", toDate: "" };

const STATUS_COLORS = {
  RUNNING:     { bg:"rgba(37,99,235,0.1)",  color:"var(--color-primary)" },
  PENDING:     { bg:"rgba(245,158,11,0.1)",  color:"var(--color-warning)" },
  WAITING:     { bg:"rgba(139,92,246,0.1)", color:"var(--color-status-waiting)" },
  CLOSED_WON:  { bg:"rgba(34,197,94,0.1)",  color:"var(--color-success)" },
  CLOSED_LOST: { bg:"rgba(239,68,68,0.1)",  color:"var(--color-error)" },
  CLOSED:      { bg:"rgba(107,114,128,0.1)",color:"var(--color-text-secondary)" },
  ON_HOLD:     { bg:"rgba(245,158,11,0.1)", color:"var(--color-warning)" },
};

const emptyForm = {
  clientId:"", caseNumber:"", caseType:"", courtName:"",
  judgeName:"", assignedLawyer:"", assigned_lawyer_id:"", filingDate:"", firstHearingDate:"",
  nextHearingDate:"", opponentName:"", opponentLawyer:"",
  caseTypeOther:"",
  caseDescription:"", status:"RUNNING",
};

// ── FG Helper ─────────────────────────────────────────────────
function FG({ label, required, hint, className, children }) {
  return (
    <div className={`field-group${className ? " "+className : ""}`}>
      <span className="field-label">
        {label}{required && <span className="required-star">*</span>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

// ── Case Modal ────────────────────────────────────────────────
function CaseModal({ clients, lawyers = [], editCase, onClose, onSaved, canAssignLawyer }) {
  const isEdit = Boolean(editCase);
  const [form, setForm] = useState(() =>
    editCase ? {
      clientId:         String(editCase.client?.id ?? ""),
      caseNumber:       editCase.caseNumber       ?? "",
      caseType:         splitOtherSelection(editCase.caseType, CASE_TYPES).selected,
      caseTypeOther:    splitOtherSelection(editCase.caseType, CASE_TYPES).custom,
      courtName:        editCase.courtName        ?? "",
      judgeName:        editCase.judgeName        ?? "",
      assignedLawyer:   editCase.assignedLawyer   ?? "",
      assigned_lawyer_id: editCase.assignedLawyerId ?? "",
      filingDate:       editCase.filingDate        ?? "",
      firstHearingDate: editCase.firstHearingDate ?? "",
      nextHearingDate:  editCase.nextHearingDate  ?? "",
      opponentName:     editCase.opponentName     ?? "",
      opponentLawyer:   editCase.opponentLawyer   ?? "",
      caseDescription:  editCase.caseDescription  ?? "",
      status:           editCase.status           ?? "RUNNING",
    } : { ...emptyForm }
  );
  const [saving, setSaving]   = useState(false);
  const [error,  setError]    = useState("");
  const [toast,  setToast]    = useState(false);

  const set = (field, val) => { setForm(p => ({ ...p, [field]: val })); setError(""); };

  const save = async () => {
    if (!form.clientId)   { setError("Please select a client."); return; }
    if (!form.caseNumber.trim()) { setError("Case number is required."); return; }
    if (!form.caseType)   { setError("Case type is required."); return; }
    if (form.caseType === "Other" && !form.caseTypeOther.trim()) {
      setError("Please enter the custom case type."); return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        clientId: Number(form.clientId),
        caseType: resolveOtherSelection(form.caseType, form.caseTypeOther),
      };
      assertCasePayload(payload);
      await platformApi.saveCase(payload, editCase?.id);
      setToast(true);
      await onSaved();
      setTimeout(() => { setToast(false); onClose(); }, 2600);
    } catch (e) {
      setError("Failed to save: " + getApiErrorMessage(e, "Unable to save the case."));
    } finally { setSaving(false); }
  };

  return createPortal(
    <div className="flow-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flow-modal">

        <div className="flow-modal-header">
          <div className="flow-modal-header-info">
            <h3>{isEdit ? "✏️ Edit Case" : "➕ New Case"}</h3>
            <p>{isEdit ? `Editing case ${editCase.caseNumber}` : "Enter all case details below"}</p>
          </div>
          <button type="button" className="flow-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="flow-modal-body">
          {error && <div className="form-error-banner">⚠️ {error}</div>}

          {/* Section 1 – Link & Identity */}
          <div className="form-section">
            <div className="form-section-title"><span>🔗</span> Case Identity</div>
            <div className="form-section-grid">
              <FG label="Client" required>
                <select value={form.clientId} onChange={e => set("clientId", e.target.value)}>
                  <option value="">Select client…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </FG>
              <FG label="Case Number / Lawyer ID" required>
                <input value={form.caseNumber} onChange={e => set("caseNumber", e.target.value)} placeholder="e.g. CIV/2024/001" />
              </FG>
              <FG label="Case Type" required>
                <select value={form.caseType} onChange={e => set("caseType", e.target.value)}>
                  <option value="">Select type…</option>
                  {CASE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </FG>
              {form.caseType === "Other" && (
                <FG label="Custom Case Type" required>
                  <input
                    value={form.caseTypeOther}
                    onChange={e => set("caseTypeOther", e.target.value)}
                    placeholder="Enter the case type"
                  />
                </FG>
              )}
              <FG label="Status">
                <select value={form.status} onChange={e => set("status", e.target.value)}>
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </FG>
            </div>
          </div>

          {/* Section 2 – Court */}
          <div className="form-section">
            <div className="form-section-title"><span>⚖️</span> Court Details</div>
            <div className="form-section-grid">
              <FG label="Court Name">
                <input value={form.courtName} onChange={e => set("courtName", e.target.value)} placeholder="e.g. City Civil Court, Mumbai" />
              </FG>
              <FG label="Presiding Judge">
                <input value={form.judgeName} onChange={e => set("judgeName", e.target.value)} placeholder="e.g. Hon. Justice R. Sharma" />
              </FG>
              <FG label="Assigned Lawyer" hint={canAssignLawyer ? "" : "Only administrators can change the assigned lawyer."}>
                <select
                  disabled={!canAssignLawyer}
                  value={form.assigned_lawyer_id || ""}
                  onChange={(e) => {
                    const selectedLawyer = lawyers.find(l => String(l.id) === String(e.target.value));
                    setForm(p => ({
                      ...p,
                      assigned_lawyer_id: e.target.value,
                      assignedLawyer: selectedLawyer ? selectedLawyer.fullName : ""
                    }));
                  }}
                >
                  <option value="">Select Lawyer</option>
                  {lawyers.map((lawyer) => (
                    <option key={lawyer.id} value={lawyer.id}>
                      {lawyer.label}
                    </option>
                  ))}
                </select>
              </FG>
            </div>
          </div>

          {/* Section 3 – Dates */}
          <div className="form-section">
            <div className="form-section-title"><span>📅</span> Key Dates</div>
            <div className="form-section-grid form-section-grid-3">
              <FG label="Filing Date">
                <input type="date" value={form.filingDate} onChange={e => set("filingDate", e.target.value)} />
              </FG>
              <FG label="First Hearing Date">
                <input type="date" value={form.firstHearingDate} onChange={e => set("firstHearingDate", e.target.value)} />
              </FG>
              <FG label="Next Hearing Date">
                <input type="date" value={form.nextHearingDate} onChange={e => set("nextHearingDate", e.target.value)} />
              </FG>
            </div>
          </div>

          {/* Section 4 – Opponent */}
          <div className="form-section">
            <div className="form-section-title"><span>🔴</span> Opposing Party</div>
            <div className="form-section-grid">
              <FG label="Opponent Name">
                <input value={form.opponentName} onChange={e => set("opponentName", e.target.value)} placeholder="e.g. ABC Ltd." />
              </FG>
              <FG label="Opponent's Lawyer">
                <input value={form.opponentLawyer} onChange={e => set("opponentLawyer", e.target.value)} placeholder="e.g. Adv. P. Verma" />
              </FG>
              <FG label="Case Description / Summary" className="fcol-full">
                <textarea value={form.caseDescription} onChange={e => set("caseDescription", e.target.value)} rows={4}
                  placeholder="Summarise the case background, key facts, and relief sought…" />
              </FG>
            </div>
          </div>
        </div>

         <div className="flow-modal-footer">
           <button type="button" className="btn-neutral" style={{ color:"var(--color-error)" }} onClick={onClose}>Cancel</button>
          <div className="flow-modal-footer-right">
            <button type="button" className="btn-gold" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : isEdit ? "💾 Update Case" : "➕ Create Case"}
            </button>
          </div>
        </div>
      </div>
      {toast && <div className="success-toast"><span>✅</span> Case saved successfully!</div>}
    </div>,
    document.body
  );
}

// ── Status Badge ───────────────────────────────────────────────
function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.CLOSED;
  return (
    <span style={{ background:s.bg, color:s.color, padding:"3px 10px", borderRadius:999, fontSize:11, fontWeight:800, letterSpacing:"0.05em", textTransform:"uppercase" }}>
      {STATUS_OPTIONS.find(o => o.value === status)?.label || status}
    </span>
  );
}

// ── Cases Page ────────────────────────────────────────────────
function Cases() {
  const [searchParams] = useSearchParams();
  const userRole = getUserRole();
  const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN" || userRole === "OWNER";

  const [clients, setClients] = useState([]);
  const [lawyers, setLawyers] = useState([]);
  const [cases,   setCases]   = useState([]);
  const [showModal,    setShowModal]    = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [editingCase,  setEditingCase]  = useState(null);
  const [filters, setFilters] = useState(() => ({ ...emptyFilters, searchTerm: searchParams.get("search") || "" }));
  const [hasLoaded, setHasLoaded] = useState(Boolean(searchParams.get("search")));
  const [loading, setLoading] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showAllMode, setShowAllMode] = useState(false);

  const loadData = async ({ nextPage = page, showAll = showAllMode, nextFilters = filters } = {}) => {
    setLoading(true);
    setError("");
    try {
      const response = await platformApi.searchCases({
        filters: nextFilters,
        showAll,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setCases(Array.isArray(response.items) ? response.items : []);
      setTotal(Number(response.total || 0));
      setPage(Number(response.page || nextPage));
      setHasLoaded(true);
      setShowAllMode(showAll);
    } catch (err) {
      console.error("Failed to load cases:", err);
      setError(err.message || "Failed to load cases.");
      setCases([]);
      setTotal(0);
      setHasLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  const initialEditId = searchParams.get("editId");
  const [initialEditTriggered, setInitialEditTriggered] = useState(false);

  const clientOptions = useMemo(() => clients.map(c => ({ id: c.id, name: c.name })), [clients]);

  const ensureClientsForModal = useCallback(async () => {
    if (clients.length > 0 && lawyers.length > 0) return;
    setModalLoading(true);
    try {
      const [clientResponse, lawyerRows] = await Promise.all([
        platformApi.searchClients({ showAll: true, page: 1, pageSize: 500 }),
        platformApi.getAssignableLawyers(),
      ]);
      setClients(Array.isArray(clientResponse.items) ? clientResponse.items : []);
      setLawyers(Array.isArray(lawyerRows) ? lawyerRows : []);
    } finally {
      setModalLoading(false);
    }
  }, [clients.length, lawyers.length]);

  const openCreate = async () => { setEditingCase(null); await ensureClientsForModal(); setShowModal(true); };
  const openEdit   = useCallback(async (c)  => { setEditingCase(c);   await ensureClientsForModal(); setShowModal(true); }, [ensureClientsForModal]);
  const closeModal = ()   => { setShowModal(false); setEditingCase(null); };

  useEffect(() => {
    if (searchParams.get("search")) {
      void loadData({ nextPage: 1, showAll: false });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialEditId && !initialEditTriggered && cases.length > 0) {
      const caseToEdit = cases.find(c => String(c.id) === String(initialEditId));
      if (caseToEdit) {
        setInitialEditTriggered(true);
        void openEdit(caseToEdit);
      }
    }
  }, [initialEditId, initialEditTriggered, cases, openEdit]);

  const handleSearch = (nextFilters = filters) => {
    setShowAllMode(false);
    void loadData({ nextPage: 1, showAll: false, nextFilters });
  };

  const handleShowAll = () => {
    setShowAllMode(true);
    void loadData({ nextPage: 1, showAll: true });
  };

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
  }, [filters.searchTerm, filters.caseType, filters.status, filters.fromDate, filters.toDate, hasLoaded, showAllMode]);

  return (
    <AppShell
      title="Cases"
      subtitle="Search cases by case number, client, court, lawyer, opponent, or notes."
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button type="button" className="btn-gold" onClick={() => setShowExportModal(true)}>
            📥 Export
          </button>
          {userRole !== "LAWYER" && (
            <button type="button" className="primary-button" onClick={() => void openCreate()} disabled={modalLoading} style={{ whiteSpace: 'nowrap' }}>
              {modalLoading ? "Loading..." : "+ Add Case"}
            </button>
          )}
        </div>
      }
    >
      <ErrorState message={error} />
      <HeaderFilters
        searchTerm={filters.searchTerm}
        onSearchChange={(val) => setFilters(p => ({ ...p, searchTerm: val }))}
        searchPlaceholder="Search cases by any word..."
        dateRangeConfig={{
          label: "Upload Date",
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          onFromDateChange: (val) => setFilters(p => ({ ...p, fromDate: val })),
          onToDateChange: (val) => setFilters(p => ({ ...p, toDate: val }))
        }}
        filters={[
          {
            id: "caseType",
            label: "Case Type",
            options: CASE_TYPES.map(t => ({ value: t, label: t }))
          },
          {
            id: "status",
            label: "Status",
            options: STATUS_OPTIONS.map(({ value, label }) => ({ value, label }))
          }
        ]}
        filterValues={{ caseType: filters.caseType, status: filters.status }}
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
           {total} case{total !== 1 ? "s" : ""} found
         </div>
       )}

      {/* Cases Grid */}
      <section className="card-grid">
        {!hasLoaded && <EmptyState label="Use the filters above to load cases." />}
        {loading && <LoadingState label="Loading cases..." />}
        {hasLoaded && !loading && cases.map(legalCase => (
          <div key={legalCase.id}>
            <CaseIdentityCard
              item={legalCase}
              className="case-card-premium"
              detailsTarget={`/cases/${legalCase.id}#case-card`}
              footer={
                <button type="button" className="btn-glass-action" onClick={() => void openEdit(legalCase)}>
                  ✏️ Edit Details
                </button>
              }
            >
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
              <StatusBadge status={legalCase.status} />
               {legalCase.caseType && (
                 <span style={{ fontSize:12, fontWeight:700, color:"var(--color-gold)", background:"var(--color-gold-bg)", padding:"2px 8px", borderRadius:6 }}>
                   {legalCase.caseType}
                 </span>
               )}
            </div>

            <div className="client-info-list" style={{ marginTop: 8 }}>
              <p><strong>⚖️ Court</strong> {legalCase.courtName || "—"}</p>
              <p><strong>👤 Lawyer</strong> {legalCase.assignedLawyer || "—"}</p>
            </div>

            <div style={{ fontSize:10, color:"#94a3b8", textAlign: 'right' }}>
              Last Sync: {formatDateTime(legalCase.updatedAt)}
            </div>
          </CaseIdentityCard>
          </div>
        ))}

        {hasLoaded && !loading && cases.length === 0 && <EmptyState label="No cases match your filters." />}
      </section>

      <PaginationControls page={page} total={total} pageSize={PAGE_SIZE} onPageChange={(nextPage) => void loadData({ nextPage })} />

      {showModal && (
        <CaseModal
          clients={clientOptions}
          lawyers={lawyers}
          editCase={editingCase}
          onClose={closeModal}
          onSaved={loadData}
          canAssignLawyer={isAdmin}
        />
      )}

      {showExportModal && (
        <ExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          type="cases"
          currentFilters={filters}
          defaultDateRange={{ start: filters.fromDate, end: filters.toDate }}
        />
      )}
    </AppShell>
  );
}

export default Cases;




