import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import CaseIdentityCard from "../components/CaseIdentityCard";
import CaseCombobox from "../components/CaseCombobox";
import HeaderFilters from "../components/HeaderFilters";
import ControlledSearchPanel, { EmptyState, ErrorState, LoadingState, PaginationControls } from "../components/ControlledSearchPanel";
import { supabasePlatformApi as platformApi } from "../repositories/supabaseRepository";
import { buildTenantAssetPrefix, getPersistentAssetUrl, removeAsset, uploadAsset } from "../services/storageService";
import { supabaseBuckets } from "../services/supabaseClient";
import { assertDocumentPayload, getApiErrorMessage, resolveOtherSelection } from "../utils/validation";
import { formatDateTime } from "../utils/formatters";
import { openExport } from "../store/exportStore";
import logger from "../services/loggerService";
import "./formStyles.css";

const DOC_CATEGORIES = [
  "Legal File", "Evidence", "Proof", "Petition", "Contract",
  "Correspondence", "Court Order", "Affidavit", "Other"
];

const PAGE_SIZE = 25;
const emptyFilters = { searchTerm: "", category: "", fromDate: "", toDate: "" };

// ── File type icon and colour ─────────────────────────────────
function docIcon(mimeType, fileName) {
  const ext = (fileName || "").split(".").pop()?.toLowerCase();
  if (mimeType?.includes("pdf") || ext === "pdf")    return { emoji:"📄", cls:"doc-icon-pdf" };
  if (mimeType?.startsWith("image/"))                 return { emoji:"🖼️", cls:"doc-icon-img" };
  if (["doc","docx"].includes(ext))                   return { emoji:"📝", cls:"doc-icon-doc" };
  return { emoji:"📁", cls:"doc-icon-file" };
}

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

// ── Upload Modal ──────────────────────────────────────────────
function UploadModal({ initialCaseId, cases, onClose, onSaved }) {
  const [caseId, setCaseId] = useState(initialCaseId || "");
  const [form, setForm] = useState({
    title: "", category: "Legal File", categoryOther: "", description: "", file: null
  });
  const [uploading,  setUploading]  = useState(false);
  const [error,      setError]      = useState("");
  const [toast,      setToast]      = useState(false);
  const [dragOver,   setDragOver]   = useState(false);
  const closeTimerRef = useRef(null);

  useEffect(() => () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
  }, []);

  const set = (f, v) => { setForm(p => ({ ...p, [f]: v })); setError(""); };

  const handleFile = (file) => { if (file) set("file", file); };

  const save = async () => {
    if (!caseId) { setError("Please select a case before uploading a document."); return; }
    if (!form.file) { setError("Please select a file to upload."); return; }
    if (form.category === "Other" && !form.categoryOther.trim()) {
      setError("Please enter the custom document category."); return;
    }
    setUploading(true);
    try {
      const upload = await uploadAsset({
        file:   form.file,
        bucket: supabaseBuckets.documents,
        prefix: buildTenantAssetPrefix({ caseId, scope: "documents" }),
      });
      const payload = {
        category:  resolveOtherSelection(form.category, form.categoryOther),
        fileName:  form.title.trim() || form.file.name,
        fileUrl:   upload.signedUrl || upload.publicUrl,
        filePath:  upload.path,
        fileType:  form.file.type,
        fileSize:  form.file.size,
        description: form.description,
      };
      assertDocumentPayload(payload);
      await platformApi.addDocument(caseId, payload);
      setToast(true);
      await onSaved();
      closeTimerRef.current = window.setTimeout(() => { setToast(false); onClose(); }, 2400);
    } catch (e) {
      setError("Upload failed: " + getApiErrorMessage(e, "Unknown error"));
    } finally { setUploading(false); }
  };

  return createPortal(
    <div className="flow-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flow-modal flow-modal-sm">

        <div className="flow-modal-header">
          <div className="flow-modal-header-info">
            <h3>📂 Upload Document</h3>
            <p>Attach a file to this case record</p>
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
                 onChange={setCaseId}
                 cases={cases}
                 placeholder="Search and select case..."
                 disabled={!!initialCaseId}
               />
            </FG>
          </div>

          <div className="form-section">
            <div className="form-section-title"><span>📋</span> Document Info</div>
            <div className="form-section-grid">
              <FG label="Document Title" hint="Leave blank to use file name" className="fcol-full">
                <input value={form.title} onChange={e => set("title", e.target.value)}
                  placeholder="e.g. FIR Copy, Agreement Deed, Vakalatnama" />
              </FG>
              <FG label="Category" required>
                <select value={form.category} onChange={e => set("category", e.target.value)}>
                  {DOC_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </FG>
              {form.category === "Other" && (
                <FG label="Custom Category" required>
                  <input
                    value={form.categoryOther}
                    onChange={e => set("categoryOther", e.target.value)}
                    placeholder="Enter the document category"
                  />
                </FG>
              )}
              <FG label="Description">
                <textarea value={form.description} onChange={e => set("description", e.target.value)}
                  rows={2} placeholder="Brief description of this document…" />
              </FG>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title"><span>📁</span> File Upload</div>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
               style={{
                 border: `2px dashed ${dragOver ? "var(--color-gold-light)" : "var(--color-border)"}`,
                 borderRadius: 14,
                 padding: "28px 20px",
                 textAlign: "center",
                 background: dragOver ? "var(--color-gold-bg)" : "var(--color-bg)",
                 transition: "all 0.18s ease",
                 cursor: "pointer",
               }}
              onClick={() => document.getElementById("doc-file-input").click()}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>
                {form.file ? (docIcon(form.file.type, form.file.name).emoji) : "⬆️"}
              </div>
              {form.file ? (
                <>
                   <p style={{ fontWeight:700, color:"var(--color-text)", margin:"0 0 4px" }}>{form.file.name}</p>
                   <p style={{ fontSize:12, color:"var(--color-text-secondary)", margin:0 }}>
                    {(form.file.size / 1024).toFixed(1)} KB · {form.file.type || "Unknown type"}
                  </p>
                  <button type="button" className="btn-danger-soft" style={{ marginTop:10 }}
                    onClick={e => { e.stopPropagation(); set("file", null); }}>
                    Remove
                  </button>
                </>
              ) : (
                <>
                   <p style={{ fontWeight:700, color:"var(--color-text-secondary)", margin:"0 0 4px" }}>Drag & drop a file here</p>
                   <p style={{ fontSize:12, color:"var(--color-text-tertiary)", margin:0 }}>or click to browse — PDF, Images, Word, etc.</p>
                </>
              )}
            </div>
            <input id="doc-file-input" type="file" style={{ display:"none" }}
              onChange={e => handleFile(e.target.files?.[0])} />
          </div>
        </div>

        <div className="flow-modal-footer">
           <button className="btn-neutral" style={{ color:"var(--color-error)" }} onClick={onClose}>Cancel</button>
          <button className="btn-gold" onClick={() => void save()} disabled={uploading || !form.file}>
            {uploading ? "Uploading…" : "📤 Upload Document"}
          </button>
        </div>
      </div>
      {toast && <div className="success-toast"><span>✅</span> Document uploaded!</div>}
    </div>,
    document.body
  );
}

// ── Documents Page ────────────────────────────────────────────
function Documents() {
  const [searchParams] = useSearchParams();
  const initialSearchCase = searchParams.get("searchCase") || "";

  const [cases, setCases] = useState([]);
  const [uploadFor, setUploadFor] = useState(null);
  const [modalCases, setModalCases] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [filters, setFilters] = useState({ ...emptyFilters, searchTerm: initialSearchCase });
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showAllMode, setShowAllMode] = useState(false);
  const [initialSearchTriggered, setInitialSearchTriggered] = useState(false);

  const ensureModalCases = async () => {
    if (modalCases.length > 0) return;
    setModalLoading(true);
    try {
      const response = await platformApi.searchDocuments({ showAll: true, page: 1, pageSize: 500 });
      setModalCases(Array.isArray(response.items) ? response.items : []);
    } finally {
      setModalLoading(false);
    }
  };

  const openUploadModal = async (initialCaseId = null) => {
    await ensureModalCases();
    setUploadFor({ initialCaseId });
  };

  const loadDocuments = useCallback(async ({ nextPage = page, showAll = showAllMode, nextFilters = filters } = {}) => {
    setLoading(true);
    setError("");
    try {
      const response = await platformApi.searchDocuments({
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
      logger.error("Failed to load documents", err);
      setError(err.message || "Failed to load documents.");
      setCases([]);
      setTotal(0);
      setHasLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [filters, page, showAllMode]);

  const handleSearch = useCallback((nextFilters = filters) => {
    setShowAllMode(false);
    void loadDocuments({ nextPage: 1, showAll: false, nextFilters });
  }, [filters, loadDocuments]);

  const handleShowAll = useCallback(() => {
    setShowAllMode(true);
    void loadDocuments({ nextPage: 1, showAll: true });
  }, [loadDocuments]);

  const handlePageChange = (nextPage) => {
    void loadDocuments({ nextPage });
  };

  const focusDocId = searchParams.get("focus");

  useEffect(() => {
    if (focusDocId && cases.length > 0) {
      const targetCase = cases.find(c => c.documents?.some(d => String(d.id) === focusDocId));
      if (targetCase) {
        // Scroll to the case card or document if needed
        const el = document.getElementById(`doc-${focusDocId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [focusDocId, cases]);

  useEffect(() => {
    const hasActiveFilters = Object.values(filters).some(Boolean);
    if (initialSearchCase && !initialSearchTriggered) {
      setInitialSearchTriggered(true);
      handleSearch({ ...emptyFilters, searchTerm: initialSearchCase });
    } else if (hasActiveFilters || focusDocId) {
      // If we have a focusDocId, we should probably load everything or the relevant case
      // For now, handleSearch(filters) is fine if filters are empty it might not load much
      // but usually deep links will include searchCase or similar if possible.
      // If no filters, and focusDocId exists, let's trigger a load if not loaded
      if (!hasLoaded) handleShowAll();
      else handleSearch(filters);
    } else if (hasLoaded && !showAllMode) {
      setCases([]);
      setTotal(0);
      setHasLoaded(false);
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.searchTerm, filters.category, filters.fromDate, filters.toDate, initialSearchCase, initialSearchTriggered, handleSearch, handleShowAll, hasLoaded, showAllMode, focusDocId]);

  const deleteDocument = async (caseId, doc) => {
    if (!window.confirm(`Delete "${doc.fileName}"?`)) return;
    try {
      await platformApi.deleteDocument(caseId, doc.id);
      await removeAsset({ bucket: supabaseBuckets.documents, path: doc.filePath });
      await loadDocuments();
    } catch (err) {
      alert("Failed to delete document: " + err.message);
    }
  };

  return (
    <AppShell
      title="Documents"
      subtitle="Standardized document management across all cases."
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <button type="button" className="btn-gold" onClick={() => openExport({
            type: "documents",
            availableData: cases.flatMap(c => (c.documents || []).map(d => ({
              ...d,
              title: d.fileName || d.name,
              caseNumber: c.caseNumber || c.case_number,
              clientName: c.client?.name || c.clientName,
              case: { caseNumber: c.caseNumber || c.case_number },
              uploaded_at: d.createdAt || d.uploaded_at,
              uploaded_by: d.uploadedBy || d.uploaded_by,
            }))),
            currentFilters: filters,
            defaultDateRange: { start: filters.fromDate, end: filters.toDate }
          })}>
            📥 Export
          </button>
          <button type="button" className="primary-button" onClick={() => openUploadModal(null)} disabled={modalLoading}>
            {modalLoading ? "Loading..." : "+ Upload Document"}
          </button>
        </div>
      }
    >
      <HeaderFilters
        searchTerm={filters.searchTerm}
        onSearchChange={(val) => setFilters(p => ({ ...p, searchTerm: val }))}
        searchPlaceholder="Search documents by any word..."
        dateRangeConfig={{
          label: "Upload Date",
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          onFromDateChange: (val) => setFilters(p => ({ ...p, fromDate: val })),
          onToDateChange: (val) => setFilters(p => ({ ...p, toDate: val }))
        }}
        filters={[
          {
            id: "category",
            label: "Category",
            options: DOC_CATEGORIES.map(c => ({ value: c, label: c }))
          }
        ]}
        filterValues={{ category: filters.category }}
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

      {loading && !hasLoaded ? (
        <LoadingState message="Loading documents..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => loadDocuments()} />
      ) : cases.length === 0 ? (
        <EmptyState 
          title={showAllMode ? "No documents found" : "No matching documents"} 
          message="Try adjusting your search filters or upload a new document."
        />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)" }}>
              Showing {cases.length} case{cases.length !== 1 ? "s" : ""} with documents
            </div>
          </div>

          <section className="card-grid">
            {cases.map(legalCase => {
              const docs = legalCase.documents || [];
              return (
                <div key={legalCase.id}>
                  <CaseIdentityCard
                    item={legalCase}
                    className="case-card-premium"
                    detailsTarget={`/cases/${legalCase.id}#documents-card`}
                  >
                  <div className="mini-section">
                    <div className="section-heading">
                      <div>
                        <h4 style={{ margin:0, fontSize:13, fontWeight:800, color:"var(--color-text)" }}>
                          📂 Documents ({docs.length})
                        </h4>
                        <p className="section-copy">Files attached to this case</p>
                      </div>
                      <button className="btn-gold" style={{ fontSize:12, padding:"7px 12px" }}
                        onClick={() => openUploadModal(legalCase.id)}>
                        + Upload
                      </button>
                    </div>

                    {docs.length > 0 ? (
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {docs.map(doc => {
                          const { emoji, cls } = docIcon(doc.fileType, doc.fileName);
                          const fileUrl = getPersistentAssetUrl(doc.fileUrl);
                          return (
                            <div key={doc.id} id={`doc-${doc.id}`} className={`doc-card ${String(doc.id) === focusDocId ? 'doc-card-focused' : ''}`}>
                              <div className={`doc-icon ${cls}`}>{emoji}</div>
                              <div className="doc-info">
                                <strong title={doc.fileName}>{doc.fileName}</strong>
                                <div className="doc-meta">
                                  <span className="doc-category-badge">{doc.category}</span>
                                  {doc.fileSize && <span>{(doc.fileSize / 1024).toFixed(0)} KB</span>}
                                  <span>{formatDateTime(doc.createdAt)}</span>
                                </div>
                                {doc.description && (
                                   <p style={{ fontSize:12, color:"var(--color-text-secondary)", margin:"4px 0 0", lineHeight:1.4 }}>
                                    {doc.description}
                                  </p>
                                )}
                              </div>
                              <div className="doc-actions">
                                {fileUrl ? (
                                  <a href={fileUrl} target="_blank" rel="noreferrer"
                                    className="btn-edit-soft" style={{ textDecoration:"none" }}>
                                    Open
                                  </a>
                                ) : (
                                   <span style={{ fontSize:11, color:"var(--color-text-tertiary)" }}>Unavailable</span>
                                )}
                                <button className="btn-danger-soft"
                                  onClick={() => void deleteDocument(legalCase.id, doc)}>
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="empty-box">
                        No documents yet for this case.
                      </div>
                    )}
                  </div>
                </CaseIdentityCard>
                </div>
              );
            })}
          </section>

          <PaginationControls 
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={handlePageChange}
          />
        </>
      )}

      {uploadFor && (
        <UploadModal
          initialCaseId={uploadFor.initialCaseId}
          cases={modalCases}
          onClose={() => setUploadFor(null)}
          onSaved={loadDocuments}
        />
      )}

    </AppShell>
  );
}

export default Documents;




