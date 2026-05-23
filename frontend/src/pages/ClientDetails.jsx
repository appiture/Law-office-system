import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useLocation, useNavigate } from "react-router-dom";
import { ROUTES } from "../constants/routes";
import { EXPORT_FORMATS } from "../constants/exportFormats";
import AppShell from "../components/layout/AppShell";
import { supabasePlatformApi as platformApi } from "../repositories/supabaseRepository";
import { getPersistentAssetUrl } from "../services/storageService";
import { formatDate, textOrDash } from "../utils/formatters";
import MultiStepClientWizard from "../components/MultiStepClientWizard";
import { createPortal } from "react-dom";
import { usePermissions } from "../context/PermissionsContext";
import "./ClientDetails.css";

const idsEqual = (left, right) => String(left ?? "") === String(right ?? "");

const statusClassName = (value) => String(value || "running").toLowerCase().replace(/_/g, "-");

const formatAddress = (client) => {
  const parts = [
    client?.address,
    [client?.city, client?.state, client?.pinCode].filter(Boolean).join(", "),
  ].filter(Boolean);
  return textOrDash(parts.join(" | "), "No address");
};

function ClientDetails() {
  const { clientId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [clientCases, setClientCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewImage, setPreviewImage] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardConfig, setWizardConfig] = useState({ client: null, step: 0 });
  const [refreshKey, setRefreshKey] = useState(0);
  
  const focusParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const { canAccess } = usePermissions();
  const canViewClients = canAccess("clients");
  const canViewCases = canAccess("cases");

  const loadData = useCallback(async (isCancelled = () => false) => {
    try {
      setLoading(true);
      setError("");
      
      if (!canViewClients) {
        throw new Error("You do not have permission to view client details.");
      }

      const clientRecord = await platformApi.getClient(clientId);
      if (isCancelled()) return;

      let linkedCases = [];
      if (canViewCases) {
        const allCasesResponse = await platformApi.getCases();
        if (isCancelled()) return;
        const allCases = Array.isArray(allCasesResponse) ? allCasesResponse : [];
        linkedCases = allCases.filter((item) => idsEqual(item.client?.id, clientId));
      }

      setClient(clientRecord);
      setClientCases(linkedCases);
    } catch (err) {
      if (!isCancelled()) {
        setError(err.message || "Failed to load the requested record.");
        setClient(null);
        setClientCases([]);
      }
    } finally {
      if (!isCancelled()) {
        setLoading(false);
      }
    }
  }, [clientId, canViewClients, canViewCases]);

  useEffect(() => {
    let cancelled = false;
    void loadData(() => cancelled).then(() => {
      if (!cancelled) {
        const editMode = focusParams.get("edit") === "true";
        const step = parseInt(focusParams.get("step") || "0", 10);
        if (editMode) {
          setWizardConfig(prev => ({ ...prev, step }));
          setShowWizard(true);
        }
      }
    });
    return () => { cancelled = true; };
  }, [loadData, refreshKey, focusParams]);

  const openWizard = (clientData, step = 0) => {
    if (!canViewClients) return;
    setWizardConfig({ client: clientData, step });
    setShowWizard(true);
  };

  const handleSaveWizard = async (payload) => {
    const existingClientId = client?.id || payload.client?.id || null;
    await platformApi.saveWizardStep(payload, existingClientId);
    setRefreshKey(prev => prev + 1);
    setShowWizard(false);
  };

  const downloadReport = (format) => {
    const data = {
      identity: {
        name: client?.name,
        occupation: client?.occupation,
        gender: client?.gender,
        dob: client?.dateOfBirth,
        email: client?.email,
        phone: client?.phone,
        altPhone: client?.altPhone,
        address: formatAddress(client),
        idProof: `${client?.idProofType}: ${client?.idProofNumber}`
      },
      cases: clientCases.map(c => ({
        number: c.caseNumber,
        type: c.caseType,
        status: c.status,
        filingDate: c.filingDate
      }))
    };

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Client_Report_${client?.name || 'Client'}_${new Date().getTime()}.json`;
      link.click();
    } else if (format === EXPORT_FORMATS.CSV) {
      let csv = "Section,Field,Value\n";
      csv += `Identity,Name,${data.identity.name}\n`;
      csv += `Identity,Email,${data.identity.email}\n`;
      csv += `Identity,Phone,${data.identity.phone}\n\n`;
      csv += "Case Number,Type,Status,Filing Date\n";
      data.cases.forEach(c => {
        csv += `${c.number},${c.type},${c.status},${c.filingDate}\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Client_Report_${client?.name || 'Client'}_${new Date().getTime()}.csv`;
      link.click();
    } else if (format === 'print') {
      window.print();
    }
  };

  if (loading) {
    return (
      <AppShell title="Client Details">
        <div className="case-details-loading">
          <div className="loading-spinner"></div>
          <p>Loading client info...</p>
        </div>
      </AppShell>
    );
  }

  if (error || !client) {
    return (
      <AppShell title="Client Details">
        <div className="case-details-error">
          <h2>Error Loading Client</h2>
          <p>{error || "No matching client was found."}</p>
          <Link to={ROUTES.CLIENTS} className="primary-button">Back to Clients</Link>
        </div>
      </AppShell>
    );
  }

  const activeCasesCount = clientCases.filter((item) => !["CLOSED_WON", "CLOSED_LOST", "CLOSED"].includes(String(item.status || "").toUpperCase())).length;
  const photoUrl = getPersistentAssetUrl(client?.photoUrl);
  const canEditClient = canViewClients && Boolean(client);

  return (
    <AppShell
      title="Client Profile"
      subtitle="View complete client information, KYC details, and associated matters."
      actions={
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div className="download-dropdown-wrap">
            <button className="btn-gold header-action-btn">📥 Export Report</button>
            <div className="download-options">
              <button onClick={() => downloadReport('print')}>📄 PDF / Print</button>
              <button onClick={() => downloadReport(EXPORT_FORMATS.CSV)}>📊 CSV Data</button>
              <button onClick={() => downloadReport('json')}>🛠️ JSON Backup</button>
            </div>
          </div>
          {canEditClient && (
            <button onClick={() => openWizard(client, 0)} className="btn-gold header-action-btn">✏️ Edit Client</button>
          )}
        </div>
      }
    >
      <div className="client-details-page-wrapper">
        <div className="client-details-top-row">
        
        {/* LEFT SIDEBAR */}
        <aside className="client-sidebar">
          <div className="client-profile-card">
            <div className="client-photo-wrapper" onClick={() => photoUrl && setPreviewImage({ src: photoUrl, alt: client?.name })}>
              {photoUrl ? (
                <img src={photoUrl} alt={client?.name} className="client-photo" />
              ) : (
                <div className="client-photo-placeholder">👤</div>
              )}
            </div>
            
            <div className="client-sidebar-info">
              <h2 className="client-sidebar-name">{client?.name}</h2>
              <p className="client-sidebar-occupation">{client?.occupation || "Client"}</p>
              
              <div className="client-sidebar-actions">
                {client?.phone && (
                  <a href={`https://wa.me/${client.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="client-sidebar-btn whatsapp">
                    📞 WhatsApp
                  </a>
                )}
                {client?.email && (
                  <a href={`mailto:${client.email}`} className="client-sidebar-btn email">
                    📧 Email Client
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="client-stats-card">
            <div className="client-stat-item">
              <span className="client-stat-value">{clientCases.length}</span>
              <span className="client-stat-label">Total Cases</span>
            </div>
            <div className="client-stat-item">
              <span className="client-stat-value">{activeCasesCount}</span>
              <span className="client-stat-label">Active Cases</span>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="client-main-content">
          
          {/* Section 1: Personal Information */}
          <section className="client-section">
            <div className="client-section-header">
              <h3>👤 Personal Information</h3>
            </div>
            <div className="client-section-body">
              <div className="client-info-grid">
                <div className="client-info-item">
                  <span className="client-info-label">Full Name</span>
                  <span className="client-info-value">{textOrDash(client?.name)}</span>
                </div>
                <div className="client-info-item">
                  <span className="client-info-label">Gender</span>
                  <span className="client-info-value">{textOrDash(client?.gender)}</span>
                </div>
                <div className="client-info-item">
                  <span className="client-info-label">Date of Birth</span>
                  <span className="client-info-value">{client?.dateOfBirth ? formatDate(client.dateOfBirth) : "-"}</span>
                </div>
                <div className="client-info-item">
                  <span className="client-info-label">Occupation</span>
                  <span className="client-info-value">{textOrDash(client?.occupation)}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Contact & KYC Details */}
          <section className="client-section">
            <div className="client-section-header">
              <h3>🪪 Contact & KYC Details</h3>
            </div>
            <div className="client-section-body">
              <div className="client-info-grid">
                <div className="client-info-item">
                  <span className="client-info-label">Primary Phone</span>
                  <span className="client-info-value">{textOrDash(client?.phone)}</span>
                </div>
                <div className="client-info-item">
                  <span className="client-info-label">Alternative Phone</span>
                  <span className="client-info-value">{textOrDash(client?.altPhone)}</span>
                </div>
                <div className="client-info-item">
                  <span className="client-info-label">Email Address</span>
                  <span className="client-info-value">{textOrDash(client?.email)}</span>
                </div>
                <div className="client-info-item">
                  <span className="client-info-label">ID Proof Type</span>
                  <span className="client-info-value">{textOrDash(client?.idProofType)}</span>
                </div>
                <div className="client-info-item">
                  <span className="client-info-label">ID Proof Number</span>
                  <span className="client-info-value">{textOrDash(client?.idProofNumber)}</span>
                </div>
                <div className="client-info-item full-width">
                  <span className="client-info-label">Full Address</span>
                  <span className="client-info-value">{formatAddress(client)}</span>
                </div>
              </div>
            </div>
          </section>

        </main>
        </div>

        {/* Section 3: Associated Matters (FULL ROW) */}
        <section className="client-section full-width-section">
          <div className="client-section-header">
            <h3>⚖️ Associated Matters</h3>
          </div>
          <div className="client-section-body">
            <div className="client-cases-list grid-list">
              {clientCases.length > 0 ? (
                clientCases.map(c => (
                  <Link to={`/cases/${c.id}`} key={c.id} className="client-case-card">
                    <div className="client-case-left">
                      <div className="client-case-header">
                        <span className="client-case-number">{c.caseNumber}</span>
                        <span className={`client-case-status ${statusClassName(c.status)}`}>{c.status}</span>
                      </div>
                      <span className="client-case-type">{c.caseType}</span>
                    </div>
                    <div className="client-case-right">
                      <span className="client-case-date">Filed: {formatDate(c.filingDate)}</span>
                      <span className="client-case-arrow">View Case →</span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="client-empty-state">
                  <div className="client-empty-state-icon">📁</div>
                  <p>No cases linked to this client yet.</p>
                </div>
              )}
            </div>
          </div>
        </section>
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
            <img src={previewImage.src} alt={previewImage.alt} />
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default ClientDetails;
