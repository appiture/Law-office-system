import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useLocation, useNavigate } from "react-router-dom";
import { ROUTES } from "../constants/routes";
import AppShell from "../components/layout/AppShell";
import { supabasePlatformApi as platformApi } from "../repositories/supabaseRepository";
import { getPersistentAssetUrl } from "../services/storageService";
import { currency, formatDate, sentenceCaseStatus, textOrDash } from "../utils/formatters";
import MultiStepClientWizard from "../components/MultiStepClientWizard";
import { createPortal } from "react-dom";
import { usePermissions } from "../context/PermissionsContext";
import "./ClientDetails.css";

const idsEqual = (left, right) => String(left ?? "") === String(right ?? "");

const statusClassName = (value) => String(value || "running").toLowerCase().replace(/_/g, "-");

function CaseDetails() {
  const navigate = useNavigate();
  const { caseId } = useParams();
  const location = useLocation();
  const [legalCase, setLegalCase] = useState(null);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [wizardConfig, setWizardConfig] = useState({ client: null, step: 1 });
  const [refreshKey, setRefreshKey] = useState(0);

  const focusParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const { canAccess } = usePermissions();
  const canViewClients = canAccess("clients");
  const canViewCases = canAccess("cases");
  const canViewPayments = canAccess("payments");
  const canViewHearings = canAccess("hearings");
  const canViewDocuments = canAccess("documents");

  const loadData = useCallback(async (isCancelled = () => false) => {
    try {
      setLoading(true);
      setError("");

      if (!canViewCases) {
        throw new Error("You do not have permission to view case details.");
      }

      const matchedCase = await platformApi.getCase(caseId);
      if (isCancelled()) return;
      if (!matchedCase) throw new Error("Case not found.");

      if (canViewClients && matchedCase.client?.id) {
        const clientRecord = await platformApi.getClient(matchedCase.client.id);
        setClient(clientRecord);
      }

      setLegalCase(matchedCase);
    } catch (err) {
      if (!isCancelled()) {
        setError(err.message || "Failed to load the requested record.");
      }
    } finally {
      if (!isCancelled()) {
        setLoading(false);
      }
    }
  }, [caseId, canViewCases, canViewClients]);

  useEffect(() => {
    let cancelled = false;
    void loadData(() => cancelled).then(() => {
      if (!cancelled) {
        const editMode = focusParams.get("edit") === "true";
        const step = parseInt(focusParams.get("step") || "1", 10);
        if (editMode) {
          setWizardConfig(prev => ({ ...prev, step }));
          setShowWizard(true);
        }
      }
    });
    return () => { cancelled = true; };
  }, [loadData, refreshKey, focusParams]);

  const openWizard = (clientData, step = 1, targetCase = null) => {
    setWizardConfig({ client: clientData, step, targetCase });
    setShowWizard(true);
  };

  const handleSaveWizard = async (payload) => {
    await platformApi.saveWizardStep(payload, client?.id);
    setRefreshKey(prev => prev + 1);
    setShowWizard(false);
  };

  const totals = useMemo(() => {
    const chargeItems = legalCase?.chargeItems || [];
    const totalAmount = chargeItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
    const paidAmount = chargeItems.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0);
    return { totalAmount, paidAmount, balanceAmount: totalAmount - paidAmount };
  }, [legalCase]);

  if (loading) {
    return (
      <AppShell title="Case Details">
        <div className="case-details-loading" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
          <div className="loading-spinner" style={{ width: '40px', height: '40px', border: '3px solid rgba(0,0,0,0.1)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ marginTop: '16px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Loading case portfolio...</p>
        </div>
      </AppShell>
    );
  }

  if (error || !legalCase) {
    return (
      <AppShell title="Case Details">
        <div className="case-details-error" style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--color-bg-primary)', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--color-text)' }}>Error Loading Case</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>{error || "No matching record was found."}</p>
          <Link to={ROUTES.CASES} className="primary-button" style={{ textDecoration: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}>Back to Cases</Link>
        </div>
      </AppShell>
    );
  }

  const clientPhotoUrl = getPersistentAssetUrl(client?.photoUrl);

  return (
    <AppShell
      title="Case Portfolio"
      subtitle={
         <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "13px", marginTop: "4px" }}>
            <span style={{ fontWeight: "800", color: "var(--color-primary)" }}>#{legalCase.caseNumber || legalCase.case_number}</span>
            {legalCase.title && (
              <>
                <span style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}>|</span>
                <span style={{ fontWeight: "600", color: "var(--color-text-secondary)" }}>{legalCase.title}</span>
              </>
            )}
         </div>
      }
      actions={
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {canViewCases && (
            <button onClick={() => openWizard(client, 1, legalCase)} className="btn-gold header-action-btn">✏️ Edit Case</button>
          )}
        </div>
      }
    >
      <div className="client-details-page-wrapper">
        <div className="client-details-top-row">
          
          {/* LEFT SIDEBAR */}
          <aside className="client-sidebar">
            {client ? (
              <div className="client-profile-card">
                <div className="client-photo-wrapper" onClick={() => navigate(`/clients/${client.id}`)} style={{ cursor: 'pointer' }}>
                  {clientPhotoUrl ? (
                    <img src={clientPhotoUrl} alt={client.name} className="client-photo" />
                  ) : (
                    <div className="client-photo-placeholder">👤</div>
                  )}
                </div>
                
                <div className="client-sidebar-info">
                  <h2 className="client-sidebar-name">{client.name}</h2>
                  <p className="client-sidebar-occupation">{client.occupation || "Primary Client"}</p>
                  
                  <div className="client-sidebar-actions">
                    <Link to={`/clients/${client.id}`} className="client-sidebar-btn email">
                      👤 View Profile
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="client-profile-card">
                <div className="client-photo-wrapper">
                  <div className="client-photo-placeholder">👤</div>
                </div>
                <div className="client-sidebar-info">
                  <h2 className="client-sidebar-name">Unassigned</h2>
                  <p className="client-sidebar-occupation">Primary Client</p>
                </div>
              </div>
            )}

            {canViewPayments && (
              <div className="client-stats-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Billing Status</div>
                  <Link to={`/payments?searchCase=${encodeURIComponent(legalCase.caseNumber || legalCase.case_number || legalCase.title || "")}&highlightCase=${legalCase.id}`} className="client-sidebar-btn email" style={{ padding: '4px 12px', fontSize: '0.75rem', marginTop: 0, textDecoration: 'none', background: 'rgba(0,0,0,0.04)', color: 'var(--color-text)', borderRadius: '6px', fontWeight: 700 }}>
                    Show in page
                  </Link>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(0,0,0,0.02)', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>TOTAL</span>
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text)' }}>{currency(totals.totalAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(34, 197, 94, 0.05)', borderRadius: '8px', border: '1px solid rgba(34, 197, 94, 0.1)' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-success)' }}>PAID</span>
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-success)' }}>{currency(totals.paidAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-error)' }}>BALANCE</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--color-error)' }}>{currency(totals.balanceAmount)}</span>
                </div>
              </div>
            )}
          </aside>

          {/* MAIN CONTENT */}
          <main className="client-main-content" style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
            {/* Section 1: Matter Overview */}
            <section className="client-section">
              <div className="client-section-header">
                <h3>⚖️ Matter Overview</h3>
              </div>
              <div className="client-section-body">
                <div className="client-info-grid">
                  <div className="client-info-item">
                    <span className="client-info-label">Case Number</span>
                    <span className="client-info-value">{textOrDash(legalCase.caseNumber)}</span>
                  </div>
                  <div className="client-info-item">
                    <span className="client-info-label">Case Type</span>
                    <span className="client-info-value">{textOrDash(legalCase.caseType)}</span>
                  </div>
                  <div className="client-info-item">
                    <span className="client-info-label">Status</span>
                    <span className="client-info-value" style={{ marginTop: '4px' }}>
                       <span className={`client-case-status ${statusClassName(legalCase.status)}`}>{sentenceCaseStatus(legalCase.status)}</span>
                    </span>
                  </div>
                  <div className="client-info-item">
                    <span className="client-info-label">Assigned Lawyer</span>
                    <span className="client-info-value">{textOrDash(legalCase.assignedLawyer)}</span>
                  </div>
                  <div className="client-info-item">
                    <span className="client-info-label">Court Name</span>
                    <span className="client-info-value">{textOrDash(legalCase.courtName)}</span>
                  </div>
                  <div className="client-info-item">
                    <span className="client-info-label">Judge Name</span>
                    <span className="client-info-value">{textOrDash(legalCase.judgeName)}</span>
                  </div>
                  <div className="client-info-item full-width">
                    <span className="client-info-label">Case Description</span>
                    <span className="client-info-value">{textOrDash(legalCase.caseDescription)}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: Opposing Party */}
            <section className="client-section">
              <div className="client-section-header">
                <h3>🔴 Opposing Party</h3>
              </div>
              <div className="client-section-body">
                <div className="client-info-grid">
                  <div className="client-info-item">
                    <span className="client-info-label">Opponent Name</span>
                    <span className="client-info-value">{textOrDash(legalCase.opponentName)}</span>
                  </div>
                  <div className="client-info-item">
                    <span className="client-info-label">Opponent Lawyer</span>
                    <span className="client-info-value">{textOrDash(legalCase.opponentLawyer)}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 3: Timeline & Dates */}
            {canViewHearings && (
              <section className="client-section">
                <div className="client-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3>📅 Timeline & Dates</h3>
                  <Link to={`/hearings?searchCase=${encodeURIComponent(legalCase.caseNumber || legalCase.case_number || legalCase.title || "")}&highlightCase=${legalCase.id}`} className="primary-button" style={{ textDecoration: 'none', padding: '6px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700 }}>Show in page</Link>
                </div>
                <div className="client-section-body" style={{ padding: '0' }}>
                   <div style={{ overflowX: 'auto' }}>
                     <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                       <thead>
                         <tr style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.02), transparent)', borderBottom: '1px solid var(--color-border)' }}>
                           <th style={{ padding: '16px 24px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontWeight: 800, letterSpacing: '0.5px' }}>Date</th>
                           <th style={{ padding: '16px 24px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontWeight: 800, letterSpacing: '0.5px' }}>Title / Description</th>
                           <th style={{ padding: '16px 24px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontWeight: 800, letterSpacing: '0.5px' }}>Status</th>
                         </tr>
                       </thead>
                       <tbody>
                         {(legalCase.hearings || []).map(fu => (
                           <tr key={fu.id} style={{ borderBottom: '1px solid var(--color-border)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.01)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                             <td style={{ padding: '16px 24px', fontWeight: 700, color: 'var(--color-text)' }}>{formatDate(fu.scheduledAt)}</td>
                             <td style={{ padding: '16px 24px', color: 'var(--color-text)' }}><strong>{fu.title}</strong></td>
                             <td style={{ padding: '16px 24px' }}><span className={`client-case-status ${statusClassName(fu.status)}`}>{fu.status}</span></td>
                           </tr>
                         ))}
                         {(legalCase.hearings || []).length === 0 && (
                           <tr><td colSpan="3" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>No hearings scheduled for this case.</td></tr>
                         )}
                       </tbody>
                     </table>
                   </div>
                </div>
              </section>
            )}

            {/* Section 4: Documents */}
            {canViewDocuments && (
              <section className="client-section">
                <div className="client-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3>📄 Documents</h3>
                  <Link to={`/documents?searchCase=${encodeURIComponent(legalCase.caseNumber || legalCase.case_number || legalCase.title || "")}&highlightCase=${legalCase.id}`} className="primary-button" style={{ textDecoration: 'none', padding: '6px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700 }}>Show in page</Link>
                </div>
                <div className="client-section-body" style={{ padding: '0' }}>
                   <div style={{ overflowX: 'auto' }}>
                     <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                       <thead>
                         <tr style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.02), transparent)', borderBottom: '1px solid var(--color-border)' }}>
                           <th style={{ padding: '16px 24px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontWeight: 800, letterSpacing: '0.5px' }}>Date</th>
                           <th style={{ padding: '16px 24px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontWeight: 800, letterSpacing: '0.5px' }}>Document Name</th>
                           <th style={{ padding: '16px 24px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontWeight: 800, letterSpacing: '0.5px' }}>Type</th>
                         </tr>
                       </thead>
                       <tbody>
                         {(legalCase.documents || []).map(doc => (
                           <tr key={doc.id} style={{ borderBottom: '1px solid var(--color-border)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.01)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                             <td style={{ padding: '16px 24px', fontWeight: 700, color: 'var(--color-text)' }}>{formatDate(doc.uploadedAt || doc.created_at)}</td>
                             <td style={{ padding: '16px 24px', color: 'var(--color-text)' }}>
                               <a href={getPersistentAssetUrl(doc.fileUrl)} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: '600' }}>
                                 {doc.fileName || doc.title || "Document"}
                               </a>
                             </td>
                             <td style={{ padding: '16px 24px' }}>
                               <span style={{ padding: '4px 10px', background: 'rgba(0,0,0,0.05)', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700', color: 'var(--color-text-secondary)' }}>
                                 {doc.fileType || doc.category || "File"}
                               </span>
                             </td>
                           </tr>
                         ))}
                         {(legalCase.documents || []).length === 0 && (
                           <tr><td colSpan="3" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>No documents uploaded for this case.</td></tr>
                         )}
                       </tbody>
                     </table>
                   </div>
                </div>
              </section>
            )}

          </main>
        </div>
      </div>

      {showWizard && createPortal(
        <MultiStepClientWizard
          client={wizardConfig.client}
          initialStep={wizardConfig.step}
          onClose={() => setShowWizard(false)}
          onSave={handleSaveWizard}
        />, document.body
      )}
    </AppShell>
  );
}

export default CaseDetails;
