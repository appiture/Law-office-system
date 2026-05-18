import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { ROUTES } from "../constants/routes";
import { EXPORT_FORMATS } from "../constants/exportFormats";
import AppShell from "../components/layout/AppShell";
import { supabasePlatformApi as platformApi } from "../repositories/supabaseRepository";
import { getPersistentAssetUrl } from "../services/storageService";
import { formatDate, textOrDash } from "../utils/formatters";
import ProfileCard from "../components/ui/ProfileCard/ProfileCard";
import MultiStepClientWizard from "../components/MultiStepClientWizard";
import { createPortal } from "react-dom";
import { usePermissions } from "../context/PermissionsContext";
import "./sharedDetailsLayout.css";

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

function ClientDetails() {

  const { clientId } = useParams();
  const location = useLocation();
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
          <Link to={ROUTES.CLIENTS} className="btn-primary">Back to Clients</Link>
        </div>
      </AppShell>
    );
  }

  const activeCasesCount = clientCases.filter((item) => !["CLOSED_WON", "CLOSED_LOST", "CLOSED"].includes(String(item.status || "").toUpperCase())).length;
  const photoUrl = getPersistentAssetUrl(client?.photoUrl);
  const canEditClient = canViewClients && Boolean(client);

  const detailNavItems = [
    { id: "client-profile", label: "Identity" },
    { id: "client-info", label: "KYC & Details" },
    { id: "cases-list", label: "Associated Matters" },
  ];

  return (
    <AppShell
      title="Client Profile"
      subtitle={
         <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "13px", marginTop: "4px" }}>
            <span style={{ fontWeight: "800", color: "var(--color-primary)" }}>{client?.name}</span>
            {client?.occupation && (
              <>
                <span style={{ color: "var(--text-secondary)", opacity: 0.5 }}>|</span>
                <span style={{ fontWeight: "500", color: "var(--text-secondary)" }}>{client.occupation}</span>
              </>
            )}
            
            {(client?.email || client?.phone) && (
              <>
                <span style={{ color: "var(--text-secondary)", opacity: 0.5 }}>•</span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {[client.email, client.phone].filter(Boolean).join(" - ")}
                </span>
              </>
            )}
         </div>
      }
      actions={
        <div style={{ display: 'flex', gap: '10px' }}>
          <div className="download-dropdown-wrap">
            <button className="btn-gold">📥 Export Report</button>
            <div className="download-options">
              <button onClick={() => downloadReport('print')}>📄 PDF / Print</button>
              <button onClick={() => downloadReport(EXPORT_FORMATS.CSV)}>📊 CSV Data</button>
              <button onClick={() => downloadReport('json')}>🛠️ JSON Backup</button>
            </div>
          </div>
          {canEditClient && (
            <button onClick={() => openWizard(client, 0)} className="btn-gold">✏️ Edit Client</button>
          )}
        </div>
      }
    >
      <DetailNav items={detailNavItems} />

      <div className="case-details-container">
        <div className="case-details-grid">
          <DetailSection 
            id="client-profile" 
            title="Identity Summary" 
            label="Profile"
            className="magic-bento-card--profile"
          >
            <div className="profile-hero-section">
              <ProfileCard
                name={client?.name}
                title={client?.occupation || "Client"}
                avatarUrl={photoUrl}
                behindGlowEnabled={true}
                onImageClick={() => photoUrl && setPreviewImage({ src: photoUrl, alt: client?.name })}
              />
              <div className="profile-hero-meta">
                <div className="meta-badge">Verified Records</div>
                <div className="meta-stats">
                  <div className="stat"><strong>{clientCases.length}</strong><small>Cases</small></div>
                  <div className="stat"><strong>{activeCasesCount}</strong><small>Active</small></div>
                </div>
              </div>
            </div>
          </DetailSection>

          <DetailSection id="client-info" title="Core Details & KYC" label="KYC Records" className="magic-bento-card--details">
            <div className="info-line-list">
              <div className="info-line-grid-2">
                <InfoRow label="Email" value={client?.email || "-"} />
                <InfoRow label="Phone" value={client?.phone || "-"} />
              </div>
              <div className="info-divider" />
              <InfoRow label="Address" value={formatAddress(client)} />
              <div className="info-divider" />
              <div className="info-line-grid-2">
                <InfoRow label="ID Proof" value={client?.idProofType || "-"} />
                <InfoRow label="Reference" value={client?.idProofNumber || "-"} />
              </div>
            </div>
          </DetailSection>

          <DetailSection id="cases-list" title="Associated Matters" label="Case History" className="magic-bento-card--full">
            <div className="payment-history-table-wrap">
              <table className="payment-history-table">
                <thead>
                  <tr>
                    <th>Case Number</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Filing Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clientCases.map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.caseNumber}</strong></td>
                      <td>{c.caseType}</td>
                      <td><span className={`status-tag ${statusClassName(c.status)}`}>{c.status}</span></td>
                      <td>{formatDate(c.filingDate)}</td>
                      <td>
                        <Link to={`/cases/${c.id}`} className="btn-icon">👁️ View</Link>
                      </td>
                    </tr>
                  ))}
                  {clientCases.length === 0 && (
                    <tr><td colSpan="5" className="empty-text">No cases linked to this client.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </DetailSection>
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
            <img src={previewImage.src} alt={previewImage.alt} />
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default ClientDetails;
