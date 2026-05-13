import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"; // Refreshed to resolve dev server glitch
import { Link, useParams, useLocation, useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import { supabasePlatformApi as platformApi } from "../repositories/supabaseRepository";
import { getPersistentAssetUrl } from "../services/storageService";
import { currency, formatDate, sentenceCaseStatus, textOrDash } from "../utils/formatters";
import ProfileCard from "../components/ui/ProfileCard/ProfileCard";
import MultiStepClientWizard from "../components/MultiStepClientWizard";
import { createPortal } from "react-dom";
import { usePermissions } from "../context/PermissionsContext";
import "./CaseDetails.css";

function DetailSection({ id, title, label, actions, children, className = "", style = {} }) {
  return (
    <div 
      id={id}
      className={`standard-card ${className}`}
      style={style}
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
    </div>
  );
}

const idsEqual = (left, right) => String(left ?? "") === String(right ?? "");

const statusClassName = (value) => String(value || "running").toLowerCase().replace(/_/g, "-");

const formatAddress = (client) => {
  const parts = [
    client?.address,
    [client?.city, client?.state, client?.pinCode].filter(Boolean).join(", "),
  ].filter(Boolean);
  return textOrDash(parts.join(" | "), "No address");
};

function DetailNav({ items }) {
  return (
    <nav className="detail-section-nav" aria-label="Details sections">
      {items.map((item) => (
        <a key={item.id} href={`#${item.id}`}>{item.label}</a>
      ))}
    </nav>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="info-row">
      <span className="info-row-label">{label}</span>
      <span className="info-row-value" title={typeof value === "string" ? value : undefined}>{value}</span>
    </div>
  );
}

function CaseDetails() {
  const navigate = useNavigate();
  const { id, caseId, clientId } = useParams();
  const location = useLocation();
  const requestedId = caseId || clientId || id;
  const requestedKind = clientId ? "client" : "case";
  const [client, setClient] = useState(null);
  const [legalCase, setLegalCase] = useState(null);
  const [clientCases, setClientCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isClientView, setIsClientView] = useState(() => requestedKind === "client");
  const [previewImage, setPreviewImage] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardConfig, setWizardConfig] = useState({ client: null, step: 0 });
  const [refreshKey, setRefreshKey] = useState(0);
  const downloadTimersRef = useRef([]);
  const focusParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const { canAccess } = usePermissions();
  const canViewClients = canAccess("clients");
  const canViewCases = canAccess("cases");
  const canViewPayments = canAccess("payments");
  const canViewFollowUps = canAccess("followups");
  const canViewDocuments = canAccess("documents");

  const loadData = useCallback(async (isCancelled = () => false) => {
    try {
      setLoading(true);
      setError("");
      setIsClientView(requestedKind === "client");
      setClient(null);
      setLegalCase(null);
      setClientCases([]);

      if (requestedKind === "client") {
        if (!canViewClients) {
          throw new Error("You do not have permission to view client details.");
        }

        const clientRecord = await platformApi.getClient(requestedId);
        if (isCancelled()) return;

        let linkedCases = [];
        if (canViewCases) {
          const allCasesResponse = await platformApi.getCases();
          if (isCancelled()) return;
          const allCases = Array.isArray(allCasesResponse) ? allCasesResponse : [];
          linkedCases = allCases.filter((item) => idsEqual(item.client?.id, requestedId));
        }

        setIsClientView(true);
        setClient(clientRecord);
        setClientCases(linkedCases);
        setLegalCase(linkedCases[0] || null);
        return;
      }

      if (!canViewCases) {
        throw new Error("You do not have permission to view case details.");
      }

      const allCasesResponse = await platformApi.getCases();
      if (isCancelled()) return;
      const allCases = Array.isArray(allCasesResponse) ? allCasesResponse : [];
      const matchedCase = allCases.find((item) => idsEqual(item.id, requestedId));
      if (!matchedCase) throw new Error("Case not found.");

      let clientRecord = null;
      if (canViewClients && matchedCase.client?.id) {
        clientRecord = await platformApi.getClient(matchedCase.client.id);
        if (isCancelled()) return;
      }

      const linkedCases = canViewCases && matchedCase.client?.id
        ? allCases.filter((item) => idsEqual(item.client?.id, matchedCase.client?.id))
        : [matchedCase];

      setIsClientView(false);
      setLegalCase(matchedCase);
      setClient(canViewClients ? (clientRecord || matchedCase.client || null) : null);
      setClientCases(linkedCases.length ? linkedCases : [matchedCase]);
    } catch (err) {
      if (!isCancelled()) {
        setError(err.message || "Failed to load the requested record.");
        setClient(null);
        setLegalCase(null);
        setClientCases([]);
      }
    } finally {
      if (!isCancelled()) {
        setLoading(false);
      }
    }
  }, [requestedId, requestedKind, canViewClients, canViewCases]);

  useEffect(() => {
    let cancelled = false;
    void loadData(() => cancelled).then(() => {
      if (!cancelled) {
        const editMode = focusParams.get("edit") === "true";
        const step = parseInt(focusParams.get("step") || "0", 10);
        if (editMode) {
          // If we have a clientId in URL but requested a case step, ensure we have data
          setWizardConfig(prev => ({ ...prev, step }));
          setShowWizard(true);
        }
      }
    });
    return () => { cancelled = true; };
  }, [loadData, refreshKey, focusParams]);

  const openWizard = (clientData, step = 0, targetCase = null) => {
    if (!canViewClients) return;
    let wizardClient = { ...clientData };
    const allCases = clientCases; // use loaded clientCases, not clientData.cases
    if (targetCase) {
      const others = allCases.filter(c => !idsEqual(c.id, targetCase.id));
      wizardClient.cases = [targetCase, ...others];
    } else {
      wizardClient.cases = allCases;
    }
    setWizardConfig({ client: wizardClient, step });
    setShowWizard(true);
  };

  const handleSaveWizard = async (payload) => {
    const existingClientId = wizardConfig.client?.id || client?.id || payload.client?.id || null;
    const savedClient = await platformApi.saveWizardStep(payload, existingClientId);
    setRefreshKey(prev => prev + 1);
    setShowWizard(false);
    if (!existingClientId && savedClient?.id) {
      navigate(`/clients/${savedClient.id}`, { replace: true });
    }
  };

  const clearDownloadTimers = useCallback(() => {
    downloadTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    downloadTimersRef.current = [];
  }, []);

  const triggerDocumentDownload = useCallback(async (doc) => {
    const sourceUrl = getPersistentAssetUrl(doc.fileUrl);
    if (!sourceUrl) return;

    let href = sourceUrl;
    let revokeHref = false;

    try {
      const response = await fetch(sourceUrl);
      if (response.ok) {
        const blob = await response.blob();
        href = URL.createObjectURL(blob);
        revokeHref = true;
      }
    } catch {
      href = sourceUrl;
    }

    const link = document.createElement("a");
    link.href = href;
    link.download = doc.fileName || "document";
    link.target = "_blank";
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();

    if (revokeHref) {
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    }
  }, []);

  const downloadAllDocuments = () => {
    if (!documents || documents.length === 0) {
      alert("No documents to download.");
      return;
    }
    clearDownloadTimers();
    documents.forEach((doc, index) => {
      if (doc.fileUrl) {
        const timerId = window.setTimeout(() => {
          void triggerDocumentDownload(doc);
        }, index * 500); // Stagger to prevent browser blocking
        downloadTimersRef.current.push(timerId);
      }
    });
  };

  useEffect(() => clearDownloadTimers, [clearDownloadTimers]);

  const downloadReport = (format) => {
    const data = {
      identity: canViewClients ? {
        name: client?.name,
        occupation: client?.occupation,
        gender: client?.gender,
        dob: client?.dateOfBirth,
        email: client?.email,
        phone: client?.phone,
        altPhone: client?.altPhone,
        address: formatAddress(client),
        idProof: `${client?.idProofType}: ${client?.idProofNumber}`
      } : null,
      case: canViewCases && legalCase ? {
        number: legalCase.caseNumber,
        type: legalCase.caseType,
        court: legalCase.courtName,
        judge: legalCase.judgeName,
        status: legalCase.status,
        filingDate: legalCase.filingDate,
        assignedLawyer: legalCase.assignedLawyer
      } : null,
      financials: canViewPayments ? {
        total: totals.totalAmount,
        paid: totals.paidAmount,
        balance: totals.balanceAmount,
        history: paymentHistory.map(ph => ({
          date: ph.paymentDate,
          amount: ph.amount,
          method: ph.paymentMode,
          reference: ph.paymentReference,
          status: ph.status || "Recorded"
        }))
      } : null
    };

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Report_${client?.name || 'Client'}_${new Date().getTime()}.json`;
      link.click();
    } else if (format === 'csv') {
      let csv = "Section,Field,Value\n";
      if (data.identity) {
        csv += `Identity,Name,${data.identity.name}\n`;
        csv += `Identity,Email,${data.identity.email}\n`;
        csv += `Identity,Phone,${data.identity.phone}\n`;
      }
      if (legalCase) {
        csv += `Case,Number,${data.case?.number || ""}\n`;
        csv += `Case,Status,${data.case?.status || ""}\n`;
      }
      if (data.financials) {
        csv += `Financials,Total Fee,${data.financials.total}\n`;
        csv += `Financials,Paid,${data.financials.paid}\n`;
        csv += `Financials,Balance,${data.financials.balance}\n\n`;
        csv += "Payment Date,Amount,Method,Status\n";
        data.financials.history.forEach(ph => {
          csv += `${ph.date},${ph.amount},${ph.method},${ph.status}\n`;
        });
      }

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Report_${client?.name || 'Client'}_${new Date().getTime()}.csv`;
      link.click();
    } else if (format === 'print') {
      window.print();
    }
  };

  const allCasesForView = isClientView ? clientCases : legalCase ? [legalCase] : [];
  const chargeItems = allCasesForView.flatMap((item) => item.chargeItems || []);
  const paymentHistory = allCasesForView.flatMap((item) => item.paymentHistory || []);
  const documents = allCasesForView.flatMap((item) => (item.documents || []).map((document) => ({ ...document, caseNumber: item.caseNumber, caseId: item.id })));
  const followUps = allCasesForView.flatMap((item) => (item.followUps || []).map((followUp) => ({ ...followUp, caseNumber: item.caseNumber, caseId: item.id })));
  const focusedFollowUpId = focusParams.get("followupId") || (location.hash.startsWith("#followup-") ? location.hash.replace("#followup-", "") : "");
  const isFollowUpFocus = focusParams.get("focus") === "followup" || Boolean(focusedFollowUpId);
  const visibleFollowUps = isFollowUpFocus && focusedFollowUpId
    ? followUps.filter((followUp) => String(followUp.id) === String(focusedFollowUpId))
    : followUps;

  const totals = useMemo(() => {
    const totalAmount = chargeItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
    const paidAmount = chargeItems.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0);
    return {
      totalAmount,
      paidAmount,
      balanceAmount: totalAmount - paidAmount,
    };
  }, [chargeItems]);

  useEffect(() => {
    let highlightTimerId;
    let removeHighlightTimerId;

    if (!loading && !error && location.hash) {
      const elementId = location.hash.replace('#', '');
      const element = document.getElementById(elementId);
      if (element) {
        highlightTimerId = window.setTimeout(() => {
          document.querySelectorAll('.highlight-section').forEach((item) => item.classList.remove('highlight-section'));
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('highlight-section');
          removeHighlightTimerId = window.setTimeout(() => {
            element.classList.remove('highlight-section');
          }, 3000);
        }, 100);
      }
    }
    return () => {
      if (highlightTimerId) window.clearTimeout(highlightTimerId);
      if (removeHighlightTimerId) window.clearTimeout(removeHighlightTimerId);
    };
  }, [loading, error, location.hash, requestedId, visibleFollowUps.length]);

  if (loading) {
    return (
      <AppShell title="Details">
        <div className="case-details-loading">
          <div className="loading-spinner"></div>
          <p>Loading details...</p>
        </div>
      </AppShell>
    );
  }

  if (error || (!client && !legalCase)) {
    return (
      <AppShell title="Details">
        <div className="case-details-error">
          <h2>Error Loading Record</h2>
          <p>{error || "No matching record was found."}</p>
          <Link to={isClientView ? "/clients" : "/cases"} className="btn-primary">Back</Link>
        </div>
      </AppShell>
    );
  }

  const activeCases = clientCases.filter((item) => !["CLOSED_WON", "CLOSED_LOST", "CLOSED"].includes(String(item.status || "").toUpperCase())).length;
  const photoUrl = getPersistentAssetUrl(client?.photoUrl);
  const canEditClient = canViewClients && Boolean(client);
  const canEditCase = canViewCases && canViewClients && Boolean(client);
  const hasExportableContent = canViewClients || canViewCases || canViewPayments || canViewFollowUps || canViewDocuments;
  const detailNavItems = [
    canViewClients ? { id: "client-profile", label: "Identity" } : null,
    canViewClients ? { id: "client-info", label: "Core Info" } : null,
    canViewCases ? { id: "case-card", label: "Matter Overview" } : null,
    canViewPayments ? { id: "payment-card", label: "Financials" } : null,
    canViewFollowUps ? { id: "followups-card", label: "Timeline" } : null,
    canViewDocuments ? { id: "documents-card", label: "Files" } : null,
  ].filter(Boolean);

  return (
    <AppShell
      title={isClientView ? "Client Profile" : "Case Portfolio"}
      subtitle={isClientView ? client?.name : `Case #${legalCase?.caseNumber}`}
      actions={
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {hasExportableContent && (
          <div className="download-dropdown-wrap">
            <button className="btn-gold" style={{ padding: '8px 16px', borderRadius: '10px' }} title="Export Options">
              📥 Export Record
            </button>
            <div className="download-options">
              <div className="options-group-label">REPORT FORMATS</div>
              <button onClick={() => downloadReport('print')}>📄 PDF / Professional Print</button>
              <button onClick={() => downloadReport('csv')}>📊 CSV Spreadsheet</button>
              <button onClick={() => downloadReport('json')}>🛠️ JSON Data Backup</button>
              {canViewDocuments && (
                <>
                  <div className="info-divider" style={{ margin: '8px 0' }} />
                  <div className="options-group-label">ATTACHMENTS</div>
                  <button onClick={downloadAllDocuments}>📂 Download All Documents ({documents.length})</button>
                </>
              )}
            </div>
          </div>
          )}
          {isClientView && canEditClient ? (
            <button onClick={() => openWizard(client, 0)} className="btn-gold">
              ✏️ Edit Client
            </button>
          ) : canEditCase ? (
            <button onClick={() => openWizard(client, 1, legalCase)} className="btn-gold">
              ✏️ Edit Case
            </button>
          ) : null}
        </div>
      }
    >
      <DetailNav items={detailNavItems} />

      <div className="case-details-container">
        <div className="case-details-grid">
          {/* 1. Identity Summary Cell - Focused & Clean */}
          {canViewClients && (
          <DetailSection 
            id="client-profile" 
            title="Identity Summary" 
            label="Identity"
            className="magic-bento-card--profile"
            style={{ height: '100%' }}
            actions={canEditClient ? (
              <button onClick={() => openWizard(client, 0)} className="btn-edit-section">
                ✏️ Edit Photo
              </button>
            ) : null}
          >
            <div className="profile-hero-section">
              <ProfileCard
                className="profile-card"
                name={client?.name}
                title={client?.occupation || "Legal Client"}
                avatarUrl={photoUrl}
                behindGlowEnabled={true}
                behindGlowColor="var(--color-gold)"
                showUserInfo={false}
                onImageClick={() => photoUrl && setPreviewImage({ src: photoUrl, alt: client?.name || "Client" })}
                enableTilt={false}
              />
              <div className="profile-hero-meta">
                <div className="meta-badge">{isClientView ? "Verified Client" : "Case Primary"}</div>
                {canViewCases && (
                <div className="meta-stats">
                  <div className="stat">
                    <strong>{clientCases.length}</strong>
                    <small>Total Cases</small>
                  </div>
                  <div className="stat">
                    <strong>{activeCases}</strong>
                    <small>Active</small>
                  </div>
                </div>
                )}
              </div>
            </div>
          </DetailSection>
          )}

          {/* 2. Personal & KYC Cell - No Redundancy */}
          {canViewClients && (
          <DetailSection 
            id="client-info" 
            title="Core Details & KYC" 
            label="Verified Records"
            className="magic-bento-card--details"
            actions={canEditClient ? (
              <button onClick={() => openWizard(client, 0)} className="btn-edit-section">
                ✏️ Edit KYC
              </button>
            ) : null}
          >
            <div className="info-line-list">
              <div className="info-line-grid-2">
                <InfoRow label="Primary Email" value={client?.email || "-"} />
                <InfoRow label="Phone Contact" value={client?.phone || "-"} />
              </div>
              <div className="info-divider" />
              <div className="info-line-grid-2">
                <InfoRow label="Occupation" value={client?.occupation || "-"} />
                <InfoRow label="Gender" value={textOrDash(client?.gender, "Not specified")} />
              </div>
              <div className="info-divider" />
              <div className="info-line-grid-2">
                <InfoRow label="Date of Birth" value={formatDate(client?.dateOfBirth)} />
                <InfoRow label="Alt. Phone" value={client?.altPhone || "-"} />
              </div>
              <div className="info-divider" />
              <div className="info-line-grid-2">
                <InfoRow label="ID Document" value={textOrDash(client?.idProofType, "None")} />
                <InfoRow label="ID Reference" value={textOrDash(client?.idProofNumber, "None")} />
              </div>
              <div className="info-divider" />
              <div className="info-line-grid-2">
                <InfoRow label="City / State" value={`${client?.city || "-"}${client?.state ? ` / ${client.state}` : ""}`} />
                <InfoRow label="PIN Code" value={client?.pinCode || "-"} />
              </div>
              <div className="info-divider" />
              <InfoRow label="Full Address" value={formatAddress(client)} />

              {canViewCases && legalCase && (
                <>
                  <div className="info-divider" style={{ borderTop: '2px dashed var(--color-border)', margin: '1rem 0' }} />
                  <div className="mini-matter-summary">
                    <div className="info-row-label">Primary Matter Summary</div>
                    <div className="info-line-grid-2" style={{ marginTop: '0.5rem' }}>
                      <InfoRow label="Case #" value={legalCase.caseNumber} />
                      <InfoRow label="Status" value={sentenceCaseStatus(legalCase.status)} />
                    </div>
                    <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.7 }}>
                      {legalCase.caseType} • {legalCase.courtName}
                    </div>
                  </div>
                </>
              )}
              
              {client?.notes && (
                <>
                  <div className="info-divider" />
                  <div className="internal-notes-box">
                    <div className="info-row-label">Internal Notes</div>
                    <p style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>{client.notes}</p>
                  </div>
                </>
              )}

              <div className="info-divider" style={{ opacity: 0.3 }} />
              <div className="info-line-grid-2 meta-footer">
                <InfoRow label="Record Created" value={formatDate(client?.createdAt)} />
                <InfoRow label="Managed By" value={textOrDash(client?.createdBy, "System")} />
              </div>
            </div>
          </DetailSection>
          )}

          {/* 3. Case Details Cell - Always Showcase Specifics */}
          {canViewCases && legalCase ? (
            <DetailSection 
              id="case-card" 
              title={isClientView ? "Primary Case Details" : "Matter Overview"} 
              label="Matter Details" 
              className="magic-bento-card--full"
              actions={canEditCase ? (
                <button onClick={() => openWizard(client, 1)} className="btn-edit-section">
                  ➕ New Case
                </button>
              ) : null}
            >
              <div className="info-line-list">
                <div className="info-line-grid-2">
                  <InfoRow label="Case Number" value={textOrDash(legalCase.caseNumber, "Not set")} />
                  <InfoRow label="Case Type" value={textOrDash(legalCase.caseType, "Not set")} />
                </div>
                <div className="info-divider" />
                <div className="info-line-grid-2">
                  <InfoRow label="Court Name" value={textOrDash(legalCase.courtName, "Not set")} />
                  <InfoRow label="Judge Name" value={textOrDash(legalCase.judgeName, "Not set")} />
                </div>
                <div className="info-divider" />
                <div className="info-line-grid-3">
                  <InfoRow label="Filing Date" value={formatDate(legalCase.filingDate)} />
                  <InfoRow label="Assigned Lawyer" value={textOrDash(legalCase.assignedLawyer, "Not assigned")} />
                  <InfoRow label="Next Hearing" value={formatDate(legalCase.nextHearingDate)} />
                </div>
                <div className="info-divider" />
                <div className="info-line-grid-2">
                  <InfoRow label="Opposing Party" value={textOrDash(legalCase.opponentName, "Not set")} />
                  <InfoRow label="Opponent's Lawyer" value={textOrDash(legalCase.opponentLawyer, "Not set")} />
                </div>
                <div className="info-divider" />
                <div className="info-line-grid-2" style={{ alignItems: 'center' }}>
                  <InfoRow label="Case Status" value={sentenceCaseStatus(legalCase.status, "Running")} />
                  {canEditCase && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                      onClick={() => openWizard(client, 1, legalCase)} 
                      className="btn-gold-action"
                      style={{ padding: '8px 16px', fontSize: '12px' }}
                    >
                      ✏️ Edit Case Details
                    </button>
                  </div>
                  )}
                </div>
                
                {legalCase.caseDescription && (
                  <div className="case-description-box">
                    <div className="info-row-label">Case Description</div>
                    <p>{legalCase.caseDescription}</p>
                  </div>
                )}
              </div>
            </DetailSection>
          ) : canViewCases ? (
            <DetailSection id="case-card" title="No Active Case" label="Matter Details" className="magic-bento-card--full">
              <p className="empty-text">This client has no associated case records yet.</p>
            </DetailSection>
          ) : null}

          {/* 4. Financial Overview Cell */}
          {canViewPayments && (
          <DetailSection 
            id="payment-card" 
            title="Financials" 
            label="Billing Status"
            className="magic-bento-card--half"
            actions={
              <button 
                onClick={() => navigate(`/payments?searchCase=${legalCase?.caseNumber || ""}`)} 
                className="btn-gold-action"
              >
                💰 Full Ledger
              </button>
            }
          >
            <div className="financial-mini-grid">
              <div className="mini-stat">
                <small>TOTAL FEE</small>
                <span>{currency(totals.totalAmount)}</span>
              </div>
              <div className="mini-stat">
                <small>PAID SO FAR</small>
                <span>{currency(totals.paidAmount)}</span>
              </div>
              <div className="mini-stat highlight">
                <small>REMAINING BALANCE</small>
                <span>{currency(totals.balanceAmount)}</span>
              </div>
            </div>
          </DetailSection>
          )}

          {/* 5. Timeline & Court Dates Cell */}
          {canViewFollowUps && (
          <DetailSection 
            id="followups-card" 
            title="Upcoming Dates" 
            label="Timeline"
            className="magic-bento-card--half"
            actions={
              <button 
                onClick={() => navigate(`/followups?searchCase=${legalCase?.caseNumber || ""}`)} 
                className="btn-gold-action"
              >
                📅 Timeline
              </button>
            }
          >
            <div className="mini-timeline">
              {visibleFollowUps.slice(0, 3).map((fu) => (
                <div key={fu.id} className="timeline-item-bento">
                  <div className="time">{formatDate(fu.scheduledAt)}</div>
                  <div className="desc">{fu.title}</div>
                </div>
              ))}
              {visibleFollowUps.length === 0 && <p className="empty-text">No upcoming hearings or deadlines.</p>}
            </div>
          </DetailSection>
          )}

          {/* 6. Documents Cell */}
          {canViewDocuments && (
          <DetailSection 
            id="documents-card" 
            title="Files & Attachments" 
            label="Library"
            className="magic-bento-card--full"
            actions={
              <button 
                onClick={() => navigate(`/documents?searchCase=${legalCase?.caseNumber || ""}`)} 
                className="btn-gold-action"
              >
                📁 Documents
              </button>
            }
          >
            <div className="documents-list-bento">
              {documents.map((doc) => (
                <div key={doc.id} className="doc-item-bento">
                  <div className="doc-info">
                    <strong>{doc.fileName}</strong>
                    <small>{doc.category} • {formatDate(doc.createdAt)}</small>
                  </div>
                  {doc.fileUrl && (
                    <div className="doc-actions-bento">
                      <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="btn-icon" title="View File">📂</a>
                    </div>
                  )}
                </div>
              ))}
              {documents.length === 0 && <p className="empty-text">No documents uploaded yet.</p>}
            </div>
          </DetailSection>
          )}

          {/* 7. Full Payment History - Bottom Row */}
          {canViewPayments && (
          <DetailSection 
            id="payment-history-full" 
            title="Full Payment Ledger" 
            label="Financial Audit"
            className="magic-bento-card--full"
          >
            <div className="payment-history-table-wrap">
              <table className="payment-history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference / Method</th>
                    <th>Status</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentHistory.length > 0 ? (
                    paymentHistory.map((ph) => (
                      <tr key={ph.id}>
                        <td>{formatDate(ph.paymentDate)}</td>
                        <td>
                          <div className="pay-method-cell">
                            <strong>{textOrDash(ph.paymentMode, "Recorded payment")}</strong>
                            <small>{ph.paymentReference || ph.recordedBy || "-"}</small>
                          </div>
                        </td>
                        <td><span className={`status-tag ${statusClassName(ph.status || "recorded")}`}>{ph.status || "Recorded"}</span></td>
                        <td className="text-right amount-cell">{currency(ph.amount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="empty-text">No payment records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </DetailSection>
          )}
        </div>
      </div>

      {/* Hidden Report Header for PDF/Print */}
      <div className="print-report-header">
        <div className="print-report-brand">
          <h1>LAW OFFICE MANAGEMENT SYSTEM</h1>
          <p>Official Case / Client Report • Generated {formatDate(new Date())}</p>
        </div>
        <div className="print-report-id">
          <strong>REF:</strong> {isClientView ? `CL-${client?.id}` : `CS-${legalCase?.caseNumber}`}
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

      {previewImage && (
        <div className="image-preview-overlay" onClick={() => setPreviewImage(null)}>
          <div className="image-preview-modal" onClick={e => e.stopPropagation()}>
            <button className="image-preview-close" onClick={() => setPreviewImage(null)}>✕ Close</button>
            <img src={previewImage.src} alt={previewImage.alt} className="image-preview-large" />
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default CaseDetails;




