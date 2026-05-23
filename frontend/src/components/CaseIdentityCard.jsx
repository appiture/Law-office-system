import { Link } from "react-router-dom";
import { getPersistentAssetUrl } from "../services/storageService";
import { sentenceCaseStatus, textOrDash } from "../utils/formatters";

function CaseIdentityCard({ item, children, footer, className = "", onImageClick, detailsTarget, detailsLabel = "View Full Details", pinnedContent }) {
  const client = item?.client || item;
  
  // Clean up photo URL logic to ensure fallback is always applied visually
  const rawPhotoUrl = client?.photoUrl || client?.photo_url || "";
  const photoUrl = getPersistentAssetUrl(rawPhotoUrl, "");
  const hasPhoto = Boolean(rawPhotoUrl);
  
  const articleClassName = ["case-card", className].filter(Boolean).join(" ");
  const clientCaseCount = Array.isArray(item?.cases) ? item.cases.length : null;
  const subtitle = item?.caseNumber ? item.caseNumber : clientCaseCount != null ? `${clientCaseCount} case${clientCaseCount === 1 ? "" : "s"}` : "Client Profile";

  const getInitials = (name) => {
    return textOrDash(name, "U").charAt(0).toUpperCase();
  };

  return (
    <article 
      className={articleClassName} 
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        maxHeight: '600px', // Ensures the card does not grow infinitely
        overflow: 'hidden' 
      }}
    >
      <div 
        className="case-card-header" 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '16px', 
          borderBottom: '1px solid var(--color-border)', 
          padding: '16px', 
          background: 'var(--color-bg-secondary)',
          flexShrink: 0
        }}
      >
        {onImageClick ? (
          <button
            type="button"
            className="case-card-image-button"
            style={{ padding: 0, border: 'none', background: 'none', cursor: hasPhoto ? 'pointer' : 'default', borderRadius: '50%', flexShrink: 0 }}
            onClick={() => hasPhoto && onImageClick({ src: photoUrl, alt: client?.name || "Client" })}
            disabled={!hasPhoto}
            aria-label={hasPhoto ? `Preview ${client?.name || "client"} photo` : "No client photo available"}
          >
            {hasPhoto && photoUrl ? (
              <img 
                src={photoUrl} 
                alt={client?.name || "Client"} 
                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--color-gold-light)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} 
              />
            ) : null}
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text)', display: (!hasPhoto || !photoUrl) ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 800, border: '3px solid var(--color-gold-light)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {getInitials(client?.name)}
            </div>
          </button>
        ) : (
          <div style={{ flexShrink: 0 }}>
            {hasPhoto && photoUrl ? (
              <img 
                src={photoUrl} 
                alt={client?.name || "Client"} 
                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--color-gold-light)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} 
              />
            ) : null}
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text)', display: (!hasPhoto || !photoUrl) ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 800, border: '3px solid var(--color-gold-light)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {getInitials(client?.name)}
            </div>
          </div>
        )}
        
        <div className="case-card-heading" style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {textOrDash(client?.name, "Unnamed Client")}
          </h3>
          
          <div className="case-card-contact" style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>📞 {textOrDash(client?.phone, "No phone")}</span>
            {client?.email ? <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>📧 {client.email}</span> : null}
          </div>
          
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
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

      {pinnedContent && (
        <div style={{ flexShrink: 0, background: 'var(--color-bg-primary)' }}>
          {pinnedContent}
        </div>
      )}

      <div 
        className="card-scroll" 
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '16px',
          background: 'var(--color-bg-primary)' 
        }}
      >
        {children}
      </div>

      {(detailsTarget || footer) && (
        <div className="case-card-footer" style={{ padding: '16px', borderTop: '1px solid var(--color-border)', flexShrink: 0, background: 'var(--color-bg-secondary)' }}>
          {footer}
          {detailsTarget && (
            <Link to={detailsTarget} className="btn-gold-action" style={{ textDecoration: 'none', textAlign: 'center', width: '100%', display: 'block' }}>
              👁️ {detailsLabel}
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

export default CaseIdentityCard;




