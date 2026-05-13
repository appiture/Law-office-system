import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import CaseIdentityCard from "../components/CaseIdentityCard";
import HeaderFilters from "../components/HeaderFilters";
import ControlledSearchPanel, { EmptyState, ErrorState, LoadingState, PaginationControls } from "../components/ControlledSearchPanel";
import CaseCombobox from "../components/CaseCombobox";
import { supabasePlatformApi as platformApi } from "../repositories/supabaseRepository";
import {
  assertChargePayload,
  assertPaymentPayload,
  getApiErrorMessage,
  normalizePaymentStatus,
  resolveOtherSelection,
} from "../utils/validation";
import { currency, formatDate, sentenceCaseStatus, textOrDash } from "../utils/formatters";
import "./formStyles.css";

const PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "NEFT/RTGS", "Cheque", "Demand Draft", "Other"];
const PAGE_SIZE = 25;
const emptyFilters = { clientName: "", caseNumber: "", status: "", month: "", fromDate: "", toDate: "" };

const emptyCharge  = { label:"", isLawyerFee:false, totalAmount:"", paidAmount:"", dueDate:"", displayOrder:0, notes:"", description:"" };
const emptyPayment = {
  chargeItemId:"",
  amount:"",
  paymentMode:"Cash",
  paymentModeOther:"",
  paymentReference:"",
  paymentDate:"",
  remarks:"",
};

// ── Field Group helper ────────────────────────────────────────
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

// ── Fee Category Modal ────────────────────────────────────────
function FeeModal({ initialCaseId, cases, editItem, onClose, onSaved }) {
  const isEdit = Boolean(editItem);
  const [caseId, setCaseId] = useState(initialCaseId || "");
  const [form,   setForm]   = useState(() => isEdit ? {
    label:        editItem.label        ?? "",
    isLawyerFee:  editItem.isLawyerFee  ?? false,
    totalAmount:  editItem.totalAmount  ?? "",
    paidAmount:   editItem.paidAmount   ?? "",
    paymentMode:  "Cash",
    paymentModeOther: "",
    paymentReference: "",
    dueDate:      editItem.dueDate      ?? "",
    displayOrder: editItem.displayOrder ?? 0,
    notes:        editItem.notes        ?? "",
    description:  editItem.description  ?? "",
  } : { ...emptyCharge, paymentMode: "Cash", paymentModeOther: "", paymentReference: "" });
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

  const handleLawyerFeeToggle = (checked) => {
    set("isLawyerFee", checked);
    if (checked && !form.label.trim()) set("label", "Lawyer Fees");
  };

  const save = async () => {
    if (!caseId)               { setError("Please select a case.");           return; }
    if (!form.label.trim())    { setError("Category label is required.");     return; }
    if (!form.totalAmount)     { setError("Total amount is required.");        return; }
    setSaving(true);
    try {
      const payload = {
        label:        form.label,
        isLawyerFee:  form.isLawyerFee,
        totalAmount:  Number(form.totalAmount),
        paidAmount:   Number(form.paidAmount || 0),
        paymentMode:  resolveOtherSelection(form.paymentMode, form.paymentModeOther),
        paymentReference: form.paymentReference || "",
        dueDate:      form.dueDate || null,
        displayOrder: Number(form.displayOrder || 0),
        notes:        form.notes,
        description:  form.description,
      };
      assertChargePayload(payload);
      if (isEdit) await platformApi.updateChargeItem(caseId, editItem.id, payload);
      else        await platformApi.addChargeItem(caseId, payload);
      setToast(true);
      await onSaved();
      closeTimerRef.current = window.setTimeout(() => { setToast(false); onClose(); }, 2200);
    } catch (e) {
      setError("Failed: " + getApiErrorMessage(e, "Unable to save the fee category."));
    } finally { setSaving(false); }
  };

  return createPortal(
    <div className="flow-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flow-modal flow-modal-sm">
        <div className="flow-modal-header">
          <div className="flow-modal-header-info">
            <h3>{isEdit ? "✏️ Edit Fee Category" : "➕ Add Fee Category"}</h3>
            <p>Define a billing category for this case</p>
          </div>
          <button className="flow-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="flow-modal-body">
          {error && <div className="form-error-banner">⚠️ {error}</div>}

          <div className="form-section">
            <div className="form-section-title"><span>📂</span> Case Selection</div>
            <FG label="Case / Matter" required className="fcol-full" hint={isEdit ? "Cannot change case during edit" : ""}>
               <CaseCombobox
                 value={caseId}
                 onChange={setCaseId}
                 cases={cases}
                 placeholder="Search and select case..."
                 disabled={isEdit || !!initialCaseId}
               />
            </FG>
          </div>

          <div className="lawyer-fee-toggle-wrap">
            <label className="lawyer-fee-toggle-label">
              <input type="checkbox" checked={form.isLawyerFee} onChange={e => handleLawyerFeeToggle(e.target.checked)} />
              <span className="lawyer-fee-toggle-text">
                ⚖️ <strong>Lawyer Fees</strong> — Mark as mandatory lawyer fee
              </span>
            </label>
          </div>

          <div className="form-section">
            <div className="form-section-title"><span>🏷</span> Category Details</div>
            <div className="form-section-grid">
              <FG label="Category Label" required className="fcol-full">
                <input value={form.label} onChange={e => set("label", e.target.value)} placeholder="e.g. Court Filing Fees" />
              </FG>
              <FG label="Total Amount (₹)" required>
                <input type="number" value={form.totalAmount} onChange={e => set("totalAmount", e.target.value)} placeholder="0.00" />
              </FG>
              <FG label="Paid Amount (₹)">
                <input type="number" value={form.paidAmount} onChange={e => set("paidAmount", e.target.value)} placeholder="0.00" />
              </FG>
              {Number(form.paidAmount) > 0 && !isEdit && (
                <>
                  <FG label="Payment Mode">
                    <select value={form.paymentMode} onChange={e => set("paymentMode", e.target.value)}>
                      {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </FG>
                  {form.paymentMode === "Other" && (
                    <FG label="Custom Payment Mode" required>
                      <input
                        value={form.paymentModeOther}
                        onChange={e => set("paymentModeOther", e.target.value)}
                        placeholder="Enter the payment mode"
                      />
                    </FG>
                  )}
                  <FG label="Reference" className="fcol-full">
                    <input value={form.paymentReference} onChange={e => set("paymentReference", e.target.value)} placeholder="Txn ID / Cheque No." />
                  </FG>
                </>
              )}
              <FG label="Due Date">
                <input type="date" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} />
              </FG>
              <FG label="Description" className="fcol-full">
                <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} />
              </FG>
            </div>
          </div>
        </div>
        <div className="flow-modal-footer">
          <button className="btn-neutral" onClick={onClose}>Cancel</button>
          <button className="btn-gold" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "💾 Update" : "➕ Add Category"}
          </button>
        </div>
      </div>
      {toast && <div className="success-toast"><span>✅</span> Fee category saved!</div>}
    </div>,
    document.body
  );
}

// ── Record Payment Modal ───────────────────────────────────────
function PaymentModal({ initialCaseId, cases, onClose, onSaved }) {
  const [caseId, setCaseId] = useState(initialCaseId || "");
  const [form, setForm] = useState({ ...emptyPayment, paymentDate: new Date().toISOString().split("T")[0] });
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

  const activeCase = cases.find(c => String(c.id) === String(caseId));
  const chargeItems = activeCase?.chargeItems || [];

  const save = async () => {
    if (!caseId)            { setError("Please select a case.");           return; }
    if (!form.chargeItemId) { setError("Please select a fee category."); return; }
    if (!form.amount)       { setError("Amount is required.");            return; }
    if (!selectedItem)      { setError("Selected fee category is unavailable. Please reselect the case and fee category."); return; }
    if (form.paymentMode === "Other" && !form.paymentModeOther.trim()) {
      setError("Please enter the custom payment mode."); return;
    }
    setSaving(true);
    try {
      const payload = {
        chargeItemId:    Number(form.chargeItemId),
        amount:          Number(form.amount),
        paymentMode:     resolveOtherSelection(form.paymentMode, form.paymentModeOther),
        paymentReference:form.paymentReference,
        paymentDate:     form.paymentDate || null,
        remarks:         form.remarks,
      };
      assertPaymentPayload(payload, selectedItem?.balanceAmount);
      await platformApi.addPayment(caseId, payload);
      setToast(true);
      await onSaved();
      closeTimerRef.current = window.setTimeout(() => { setToast(false); onClose(); }, 2200);
    } catch (e) {
      setError("Failed: " + getApiErrorMessage(e, "Unable to record the payment."));
    } finally { setSaving(false); }
  };

  const selectedItem = chargeItems.find(i => String(i.id) === String(form.chargeItemId));

  return createPortal(
    <div className="flow-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flow-modal flow-modal-sm">
        <div className="flow-modal-header">
          <div className="flow-modal-header-info">
            <h3>💳 Record Client Payment</h3>
            <p>Log a payment received against a fee category</p>
          </div>
          <button className="flow-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="flow-modal-body">
          {error && <div className="form-error-banner">⚠️ {error}</div>}

          <div className="form-section">
            <div className="form-section-title"><span>📂</span> Case Selection</div>
            <FG label="Case / Matter" required className="fcol-full">
               <CaseCombobox
                 value={caseId}
                 onChange={(value) => { setCaseId(value); set("chargeItemId", ""); }}
                 cases={cases}
                 placeholder="Search and select case..."
                 disabled={!!initialCaseId}
               />
            </FG>
          </div>

          <div className="form-section">
            <div className="form-section-title"><span>📋</span> Payment Details</div>
            <div className="form-section-grid">
              <FG label="Fee Category" required className="fcol-full">
                <select value={form.chargeItemId} onChange={e => set("chargeItemId", e.target.value)} disabled={!caseId}>
                  <option value="">Select category…</option>
                  {chargeItems.map(i => (
                    <option key={i.id} value={i.id}>{i.label} (Bal: {currency(i.balanceAmount)})</option>
                  ))}
                </select>
              </FG>
              {selectedItem && (
                <div className="fcol-full" style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  <div className="stat-pill stat-pill-total"><span className="stat-pill-label">Total</span><span className="stat-pill-value">{currency(selectedItem.totalAmount)}</span></div>
                  <div className="stat-pill stat-pill-bal"><span className="stat-pill-label">Balance</span><span className="stat-pill-value">{currency(selectedItem.balanceAmount)}</span></div>
                </div>
              )}
              <FG label="Amount Paid (₹)" required>
                <input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" />
              </FG>
              <FG label="Payment Date">
                <input type="date" value={form.paymentDate} onChange={e => set("paymentDate", e.target.value)} />
              </FG>
              <FG label="Payment Mode">
                <select value={form.paymentMode} onChange={e => set("paymentMode", e.target.value)}>
                  {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
                </select>
              </FG>
              {form.paymentMode === "Other" && (
                <FG label="Custom Payment Mode" required>
                  <input
                    value={form.paymentModeOther}
                    onChange={e => set("paymentModeOther", e.target.value)}
                    placeholder="Enter the payment mode"
                  />
                </FG>
              )}
              <FG label="Reference" className="fcol-full">
                <input value={form.paymentReference} onChange={e => set("paymentReference", e.target.value)} placeholder="Txn ID / Cheque No." />
              </FG>
            </div>
          </div>
        </div>
        <div className="flow-modal-footer">
          <button className="btn-neutral" onClick={onClose}>Cancel</button>
          <button className="btn-gold" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "💳 Record Payment"}
          </button>
        </div>
      </div>
      {toast && <div className="success-toast"><span>✅</span> Payment recorded!</div>}
    </div>,
    document.body
  );
}

// ── Payment Detail Modal ──────────────────────────────
function PaymentDetailModal({ entry, onClose }) {
  return createPortal(
    <div className="flow-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flow-modal flow-modal-sm">
        <div className="flow-modal-header">
          <div className="flow-modal-header-info">
            <h3>💳 Payment Receipt</h3>
            <p>Full details of this payment transaction</p>
          </div>
          <button className="flow-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="flow-modal-body">
          <div className="payment-detail-grid">
            <div className="payment-detail-amount-hero">
              <span className="payment-detail-amount-label">Amount Received</span>
              <span className="payment-detail-amount-value">{currency(entry.amount)}</span>
            </div>
            <div className="payment-detail-row"><span className="payment-detail-key">Fee Category</span><span className="payment-detail-val">{entry.chargeLabel || "—"}</span></div>
            <div className="payment-detail-row"><span className="payment-detail-key">Date</span><span className="payment-detail-val">{entry.paymentDate ? formatDate(entry.paymentDate) : "—"}</span></div>
            <div className="payment-detail-row"><span className="payment-detail-key">Mode</span><span className="payment-detail-val">{entry.paymentMode || "—"}</span></div>
            <div className="payment-detail-row"><span className="payment-detail-key">Reference</span><span className="payment-detail-val">{entry.paymentReference || "—"}</span></div>
            <div className="payment-detail-row"><span className="payment-detail-key">Recorded By</span><span className="payment-detail-val">{entry.recordedBy || "—"}</span></div>
            <div className="payment-detail-row"><span className="payment-detail-key">Timestamp</span><span className="payment-detail-val">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}</span></div>
          </div>
        </div>
        <div className="flow-modal-footer">
          <button className="btn-neutral" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function FeeStatusBadge({ status }) {
  const normalized = normalizePaymentStatus(status);
  const map = { PAID:"fee-status-paid", PARTIAL:"fee-status-partial", OVERDUE:"fee-status-overdue", PENDING:"fee-status-unpaid" };
  return <span className={`fee-status-badge ${map[normalized] || "fee-status-unpaid"}`}>{sentenceCaseStatus(normalized)}</span>;
}

// ── Payments Page ─────────────────────────────────────────────
function Payments() {
  const [cases,        setCases]        = useState([]);
  const [modalCases,   setModalCases]   = useState([]);
  const [feeModal,     setFeeModal]     = useState(null); 
  const [payModal,     setPayModal]     = useState(null); 
  const [detailEntry,  setDetailEntry]  = useState(null); 
  const [searchParams] = useSearchParams();
  const initialSearchCase = searchParams.get("searchCase") || "";
  const [filters, setFilters] = useState({ ...emptyFilters, caseNumber: initialSearchCase });
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
      const response = await platformApi.searchPayments({
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
      console.error("Failed to load payments:", err);
      setError(err.message || "Failed to load payments.");
      setCases([]);
      setTotal(0);
      setHasLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [filters, page, showAllMode]);

  const ensureModalCases = async () => {
    if (modalCases.length > 0) return;
    setModalLoading(true);
    try {
      const response = await platformApi.searchPayments({ showAll: true, page: 1, pageSize: 500 });
      setModalCases(Array.isArray(response.items) ? response.items : []);
    } finally {
      setModalLoading(false);
    }
  };

  const openPaymentModal = async (initialCaseId = null) => {
    await ensureModalCases();
    setPayModal({ initialCaseId });
  };

  const openFeeModal = async (initialCaseId = null, editItem = null) => {
    await ensureModalCases();
    setFeeModal({ initialCaseId, editItem });
  };

  const handleSearch = useCallback((nextFilters = filters) => {
    setShowAllMode(false);
    void loadData({ nextPage: 1, showAll: false, nextFilters });
  }, [filters, loadData]);

  useEffect(() => {
    if (initialSearchCase && !initialSearchTriggered) {
      setInitialSearchTriggered(true);
      handleSearch({ ...emptyFilters, caseNumber: initialSearchCase });
    } else if (hasLoaded) {
      // Auto-refresh when filters change after initial load
      handleSearch(filters);
    }
  }, [filters.status, filters.fromDate, filters.toDate, initialSearchCase, initialSearchTriggered, handleSearch, hasLoaded]);

  const handleShowAll = () => {
    setShowAllMode(true);
    void loadData({ nextPage: 1, showAll: true });
  };

  return (
    <AppShell
      title="Payments & Fees"
      subtitle="Search first, then load payment records."
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <button type="button" className="btn-gold" onClick={() => void openPaymentModal(null)} disabled={modalLoading}>
            💳 Record Payment
          </button>
          <button type="button" className="btn-neutral" onClick={() => void openFeeModal(null)} disabled={modalLoading}>
            ➕ New Fee
          </button>
        </div>
      }
    >
      <ErrorState message={error} />
      <HeaderFilters
        searchTerm={filters.caseNumber}
        onSearchChange={(val) => setFilters(p => ({ ...p, caseNumber: val }))}
        searchPlaceholder="Search case number..."
        dateRangeConfig={{
          label: "Payment Due",
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          onFromDateChange: (val) => setFilters(p => ({ ...p, fromDate: val })),
          onToDateChange: (val) => setFilters(p => ({ ...p, toDate: val }))
        }}
        filters={[
          {
            id: "status",
            label: "Status",
            options: [
              { value: "paid", label: "Paid" },
              { value: "partial", label: "Partial" },
              { value: "overdue", label: "Overdue" },
            ]
          }
        ]}
        filterValues={{ status: filters.status }}
        onFilterChange={(id, val) => setFilters(p => ({ ...p, [id]: val }))}
        onClearFilters={() => {
          setFilters({ ...emptyFilters });
          setCases([]);
          setTotal(0);
          setHasLoaded(false);
          setError("");
        }}
        onShowAll={handleShowAll}
      />

      {hasLoaded && !loading && (
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 12 }}>
          {total} case{total !== 1 ? "s" : ""} found
        </div>
      )}

      <section className="card-grid">
        {!hasLoaded && <EmptyState label="Use the filters above to load payment records." />}
        {loading && <LoadingState label="Loading payments..." />}
        {hasLoaded && !loading && cases.map(legalCase => (
          <div key={legalCase.id}>
            <CaseIdentityCard item={legalCase} className="case-card-premium" detailsTarget={`/cases/${legalCase.id}#payment-card`}>
            <div className="payment-stats-grid">
              <div className="payment-stat-box psb-billed"><span className="payment-stat-label">Total Billed</span><span className="payment-stat-value">{currency(legalCase.totalAmount)}</span></div>
              <div className="payment-stat-box psb-received"><span className="payment-stat-label">Received</span><span className="payment-stat-value">{currency(legalCase.paidAmount)}</span></div>
              <div className="payment-stat-box psb-outstanding"><span className="payment-stat-label">Outstanding</span><span className="payment-stat-value">{currency(legalCase.balanceAmount)}</span></div>
            </div>

            <div className="mini-section">
              <div className="section-heading">
                 <h4>💼 Fee Categories</h4>
                 <button className="btn-gold" style={{ fontSize:10 }} onClick={() => void openFeeModal(legalCase.id)}>+ Category</button>
              </div>
              {legalCase.chargeItems?.length > 0 ? (
                <div style={{ overflowX:"auto" }}>
                  <table className="fee-table">
                    <thead><tr><th>Category</th><th>Total</th><th>Paid</th><th>Bal</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {legalCase.chargeItems.map(item => (
                        <tr key={item.id}>
                          <td><strong>{item.label}</strong></td>
                          <td>{currency(item.totalAmount)}</td>
                          <td>{currency(item.paidAmount)}</td>
                          <td style={{ color:"#b91c1c" }}>{currency(item.balanceAmount)}</td>
                          <td><FeeStatusBadge status={item.status} /></td>
                          <td><button className="btn-edit-soft" onClick={() => void openFeeModal(legalCase.id, item)}>Edit</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="empty-box">No fees yet.</div>}
            </div>

            <div className="mini-section">
               <div className="section-heading">
                  <h4>💳 History</h4>
                  <button className="btn-gold" style={{ fontSize:10 }} onClick={() => void openPaymentModal(legalCase.id)}>+ Payment</button>
               </div>
                 <div className="ledger-list">
                 {legalCase.paymentHistory?.map(entry => (
                   <div key={entry.id} className="ledger-item ledger-item-clickable" onClick={() => setDetailEntry(entry)}>
                      <div className="ledger-item-info"><strong>{textOrDash(entry.chargeLabel, "Charge item")}</strong><p>{formatDate(entry.paymentDate || entry.createdAt)} · {textOrDash(entry.paymentMode, "Unspecified")} · By: {textOrDash(entry.recordedBy, "System")}</p></div>
                      <span className="ledger-item-amount">{currency(entry.amount)}</span>
                   </div>
                 ))}
               </div>
            </div>
          </CaseIdentityCard>
          </div>
        ))}
        {hasLoaded && !loading && cases.length === 0 && <EmptyState label="No payment records match your filters." />}
      </section>

      <PaginationControls page={page} total={total} pageSize={PAGE_SIZE} onPageChange={(nextPage) => void loadData({ nextPage })} />

      {feeModal && <FeeModal initialCaseId={feeModal.initialCaseId} cases={modalCases.length ? modalCases : cases} editItem={feeModal.editItem} onClose={() => setFeeModal(null)} onSaved={loadData} />}
      {payModal && <PaymentModal initialCaseId={payModal.initialCaseId} cases={modalCases.length ? modalCases : cases} onClose={() => setPayModal(null)} onSaved={loadData} />}
      {detailEntry && <PaymentDetailModal entry={detailEntry} onClose={() => setDetailEntry(null)} />}
    </AppShell>
  );
}

export default Payments;




