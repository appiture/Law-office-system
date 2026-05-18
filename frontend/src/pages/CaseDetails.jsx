import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useLocation, useNavigate } from "react-router-dom";
import { ROUTES } from "../constants/routes";
import AppShell from "../components/layout/AppShell";
import { supabasePlatformApi as platformApi } from "../repositories/supabaseRepository";
import { getPersistentAssetUrl } from "../services/storageService";
import { currency, formatDate, sentenceCaseStatus } from "../utils/formatters";
import ProfileCard from "../components/ui/ProfileCard/ProfileCard";
import MultiStepClientWizard from "../components/MultiStepClientWizard";
import { createPortal } from "react-dom";
import { usePermissions } from "../context/PermissionsContext";
import MagicBento, { ParticleCard } from "../components/ui/MagicBento/MagicBento";
import "./sharedDetailsLayout.css";

function DetailSection({ id, title, label, actions, children, className = "", style = {} }) {
  return (
    <ParticleCard 
      id={id}
      className={`magic-bento-card magic-bento-card--border-glow ${className}`}
      style={style}
      enableTilt={true}
      clickEffect={true}
    >
      <div className="case-card-header">
        <div className="case-tag">{label || title}</div>
        <div className="section-actions" style={{ marginLeft: 'auto' }}>{actions}</div>
      </div>
      <div className="card-scroll">
        <div className="case-card-heading">
          <h3>{title}</h3>
        </div>
        <div className="section-body-inner">
          {children}
        </div>
      </div>
    </ParticleCard>
  );
}

const idsEqual = (left, right) => String(left ?? "") === String(right ?? "");

const statusClassName = (value) => String(value || "running").toLowerCase().replace(/_/g, "-");

function InfoRow({ label, value }) {
  return (
    <div className="info-row">
      <span className="info-row-label">{label}</span>
      <span className="info-row-value">{value}</span>
    </div>
  );
}

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


  const loadData = useCallback(async (isCancelled = () => false) => {
    try {
      setLoading(true);
      setError("");

      if (!canViewCases) {
        throw new Error("You do not have permission to view case details.");
      }

      const allCases = await platformApi.getCases();
      if (isCancelled()) return;
      const matchedCase = allCases.find((item) => idsEqual(item.id, caseId));
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
        <div className="case-details-loading">
          <div className="loading-spinner"></div>
          <p>Loading case portfolio...</p>
        </div>
      </AppShell>
    );
  }

  if (error || !legalCase) {
    return (
      <AppShell title="Case Details">
        <div className="case-details-error">
          <h2>Error Loading Case</h2>
          <p>{error || "No matching record was found."}</p>
          <Link to={ROUTES.CASES} className="btn-primary">Back to Cases</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Case Portfolio"
      subtitle={
         <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "13px", marginTop: "4px" }}>
            <span style={{ fontWeight: "800", color: "var(--color-primary)" }}>#{legalCase.caseNumber || legalCase.case_number}</span>
            {legalCase.title && (
              <>
                <span style={{ color: "var(--text-secondary)", opacity: 0.5 }}>|</span>
                <span style={{ fontWeight: "500", color: "var(--text-secondary)" }}>{legalCase.title}</span>
              </>
            )}
            {client && (
              <>
                <span style={{ color: "var(--text-secondary)", opacity: 0.5 }}>•</span>
                <span style={{ fontWeight: "700", color: "var(--color-text)" }}>{client.name}</span>
                
                {client.email && (
                  <>
                    <span style={{ color: "var(--text-secondary)", opacity: 0.5 }}>•</span>
                    <span style={{ color: "var(--text-secondary)" }}>{client.email}</span>
                  </>
                )}

                {client.phone && (
                  <>
                    <span style={{ color: "var(--text-secondary)", opacity: 0.5 }}>•</span>
                    <span style={{ color: "var(--text-secondary)" }}>{client.phone}</span>
                  </>
                )}
              </>
            )}
         </div>
      }
      actions={
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => navigate(ROUTES.CASES)} className="btn-neutral">Back</button>
          {canViewCases && (
            <button onClick={() => openWizard(client, 1, legalCase)} className="btn-gold">✏️ Edit Case</button>
          )}
        </div>
      }
    >
      <div className="case-details-container">
        <MagicBento className="case-details-grid" enableTilt={true}>
          <DetailSection id="case-overview" title="Matter Overview" label="Case Info" className="magic-bento-card--full">
            <div className="info-line-list">
              <div className="info-line-grid-2">
                <InfoRow label="Case Number" value={legalCase.caseNumber} />
                <InfoRow label="Case Type" value={legalCase.caseType} />
              </div>
              <div className="info-divider" />
              <div className="info-line-grid-2">
                <InfoRow label="Court Name" value={legalCase.courtName} />
                <InfoRow label="Judge Name" value={legalCase.judgeName} />
              </div>
              <div className="info-divider" />
              <div className="info-line-grid-2">
                <InfoRow label="Status" value={sentenceCaseStatus(legalCase.status)} />
                <InfoRow label="Assigned Lawyer" value={legalCase.assignedLawyer || "Unassigned"} />
              </div>
            </div>
          </DetailSection>

          {client && (
            <DetailSection id="client-summary" title="Primary Client" label="Identity" className="magic-bento-card--half">
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <ProfileCard 
                  name={client.name} 
                  title={client.occupation} 
                  avatarUrl={getPersistentAssetUrl(client.photoUrl)} 
                  enableTilt={false}
                />
                <Link to={`/clients/${client.id}`} className="btn-neutral">View Full Profile</Link>
              </div>
            </DetailSection>
          )}

          {canViewPayments && (
            <DetailSection id="case-financials" title="Billing Status" label="Financials" className="magic-bento-card--half">
              <div className="financial-mini-grid">
                <div className="mini-stat"><small>TOTAL</small><span>{currency(totals.totalAmount)}</span></div>
                <div className="mini-stat"><small>PAID</small><span>{currency(totals.paidAmount)}</span></div>
                <div className="mini-stat highlight"><small>BALANCE</small><span>{currency(totals.balanceAmount)}</span></div>
              </div>
            </DetailSection>
          )}

          {canViewHearings && (
            <DetailSection id="hearings-card" title="Timeline & Dates" label="Hearings" className="magic-bento-card--full">
              <div className="payment-history-table-wrap">
                <table className="payment-history-table">
                  <thead>
                    <tr><th>Date</th><th>Title / Description</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {(legalCase.hearings || []).map(fu => (
                      <tr key={fu.id}>
                        <td>{formatDate(fu.scheduledAt)}</td>
                        <td><strong>{fu.title}</strong></td>
                        <td><span className={`status-tag ${statusClassName(fu.status)}`}>{fu.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailSection>
          )}
        </MagicBento>
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
