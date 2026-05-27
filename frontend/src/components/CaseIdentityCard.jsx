import { Link } from "react-router-dom";
import { getPersistentAssetUrl } from "../services/storageService";
import { sentenceCaseStatus, textOrDash } from "../utils/formatters";

// Icons
const PhoneIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>;
const MailIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>;
const BriefcaseIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>;

function CaseIdentityCard({ item, children, footer, className = "", onImageClick, detailsTarget, detailsLabel = "View", pinnedContent, hideStatus = false }) {
  const client = item?.client || item;
  
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
        height: '100%',
        background: 'var(--color-bg-primary)',
        borderRadius: '16px',
        border: '1px solid var(--color-border)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.04)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        overflow: 'hidden'
      }}
    >
      <div 
        className="case-card-header" 
        style={{ 
          display: 'flex', 
          alignItems: 'flex-start', 
          gap: '16px', 
          padding: '20px 20px 16px 20px', 
          background: 'linear-gradient(to bottom, var(--color-bg-secondary), var(--color-bg-primary))',
          flexShrink: 0,
          borderBottom: '1px solid var(--color-border)'
        }}
      >
        <div style={{ flexShrink: 0 }}>
          {hasPhoto && photoUrl ? (
            <img 
              src={photoUrl} 
              alt={client?.name || "Client"} 
              onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
              onClick={() => onImageClick && onImageClick({ src: photoUrl, alt: client?.name || "Client" })}
              style={{ width: '48px', height: '48px', borderRadius: '12px', objectFit: 'cover', border: '1px solid var(--color-border)', cursor: onImageClick ? 'pointer' : 'default', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }} 
            />
          ) : null}
          <div 
            onClick={() => onImageClick && hasPhoto && onImageClick({ src: photoUrl, alt: client?.name || "Client" })}
            style={{ 
              width: '48px', height: '48px', borderRadius: '12px', 
              backgroundColor: 'var(--color-bg-tertiary)', 
              color: 'var(--color-text-secondary)', 
              display: (!hasPhoto || !photoUrl) ? 'flex' : 'none', 
              alignItems: 'center', justifyContent: 'center', 
              fontSize: '1.25rem', fontWeight: 600, 
              border: '1px solid var(--color-border)',
              cursor: onImageClick && hasPhoto ? 'pointer' : 'default',
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
            }}
          >
            {getInitials(client?.name)}
          </div>
        </div>
        
        <div className="case-card-heading" style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: 0, marginTop: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>
              {textOrDash(client?.name, "Unnamed Client")}
            </h3>
            {item?.caseNumber && !hideStatus && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                {sentenceCaseStatus(item?.status, "Running")}
              </span>
            )}
          </div>
          
          <div className="case-card-contact" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--color-text)', background: 'var(--color-bg-tertiary)', padding: '2px 8px', borderRadius: '4px' }}>
              <BriefcaseIcon /> {subtitle}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><PhoneIcon /> {textOrDash(client?.phone, "No phone")}</span>
            {client?.email && <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MailIcon /> {client.email}</span>}
          </div>
        </div>
      </div>

      {pinnedContent && (
        <div style={{ flexShrink: 0, borderBottom: '1px solid var(--color-border)' }}>
          {pinnedContent}
        </div>
      )}

      <div 
        style={{ 
          flex: 1, 
          padding: '20px',
        }}
      >
        {children}
      </div>

      {(detailsTarget || footer) && (
        <div className="case-card-footer" style={{ 
          padding: '12px 20px', 
          borderTop: '1px solid var(--color-border)', 
          background: 'var(--color-bg-secondary)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'flex-end', 
          gap: '12px', 
          marginTop: 'auto'
        }}>
          {footer}
          {detailsTarget && (
            <Link to={detailsTarget} className="primary-button" style={{ 
              textDecoration: 'none', 
              padding: '8px 16px', 
              borderRadius: '8px', 
              fontWeight: 600, 
              fontSize: '0.8125rem', 
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              margin: 0,
              width: 'auto'
            }}>
              {detailsLabel}
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

export default CaseIdentityCard;





