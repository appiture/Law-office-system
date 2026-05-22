import { Link } from "react-router-dom";
import { getPersistentAssetUrl } from "../services/storageService";
import { sentenceCaseStatus, textOrDash } from "../utils/formatters";

function CaseIdentityCard({ item, children, footer, className = "", onImageClick, detailsTarget, detailsLabel = "View Full Details", pinnedContent }) {
  const client = item?.client || item;
  const photoUrl = getPersistentAssetUrl(client?.photoUrl, "https://placehold.co/120x120/png?text=Client");
  const hasPhoto = Boolean(getPersistentAssetUrl(client?.photoUrl));
  const articleClassName = ["case-card", className].filter(Boolean).join(" ");
  const clientCaseCount = Array.isArray(item?.cases) ? item.cases.length : null;
  const subtitle = item?.caseNumber ? item.caseNumber : clientCaseCount != null ? `${clientCaseCount} case${clientCaseCount === 1 ? "" : "s"}` : "Client Profile";

  return (
    <article className={articleClassName}>
      <div className="case-card-header" style={{ display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', marginBottom: '16px' }}>
        {onImageClick ? (
          <button
            type="button"
            className="case-card-image-button"
            style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: '50%' }}
            onClick={() => hasPhoto && onImageClick({ src: photoUrl, alt: client?.name || "Client" })}
            disabled={!hasPhoto}
            aria-label={hasPhoto ? `Preview ${client?.name || "client"} photo` : "No client photo available"}
          >
            <img src={photoUrl} alt={client?.name || "Client"} style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--color-gold-light)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
          </button>
        ) : (
          <img src={photoUrl} alt={client?.name || "Client"} style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--color-gold-light)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
        )}
        
        <div className="case-card-heading" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--color-text)' }}>
            {textOrDash(client?.name, "Unnamed Client")}
          </h3>
          
          <div className="case-card-contact" style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>📞 {textOrDash(client?.phone, "No phone")}</span>
            {client?.email ? <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>📧 {client.email}</span> : null}
          </div>
          
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              {subtitle}
            </span>
            {item?.caseNumber ? (
              <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', backgroundColor: 'var(--color-gold-bg)', color: 'var(--color-gold)' }}>
                {sentenceCaseStatus(item?.status, "Running")}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {pinnedContent}

      <div className="card-scroll">
        {children}
      </div>

      {(detailsTarget || footer) && (
        <div className="case-card-footer">
          {footer}
          {detailsTarget && (
            <Link to={detailsTarget} className="btn-gold-action" style={{ textDecoration: 'none', textAlign: 'center', width: '100%' }}>
              👁️ {detailsLabel}
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

export default CaseIdentityCard;




