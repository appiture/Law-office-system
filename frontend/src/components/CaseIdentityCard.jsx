import { Link } from "react-router-dom";
import { getPersistentAssetUrl } from "../services/storageService";
import { sentenceCaseStatus, textOrDash } from "../utils/formatters";

function CaseIdentityCard({ item, children, footer, className = "", onImageClick, detailsTarget, detailsLabel = "View Full Details" }) {
  const client = item?.client || item;
  const photoUrl = getPersistentAssetUrl(client?.photoUrl, "https://placehold.co/120x120/png?text=Client");
  const hasPhoto = Boolean(getPersistentAssetUrl(client?.photoUrl));
  const articleClassName = ["case-card", className].filter(Boolean).join(" ");
  const clientCaseCount = Array.isArray(item?.cases) ? item.cases.length : null;
  const subtitle = item?.caseNumber ? item.caseNumber : clientCaseCount != null ? `${clientCaseCount} case${clientCaseCount === 1 ? "" : "s"}` : "Client Profile";

  return (
    <article className={articleClassName}>
      <div className="case-card-header">
        {onImageClick ? (
          <button
            type="button"
            className="case-card-image-button"
            onClick={() => hasPhoto && onImageClick({ src: photoUrl, alt: client?.name || "Client" })}
            disabled={!hasPhoto}
            aria-label={hasPhoto ? `Preview ${client?.name || "client"} photo` : "No client photo available"}
          >
            <img src={photoUrl} alt={client?.name || "Client"} className="client-avatar" />
          </button>
        ) : (
          <img src={photoUrl} alt={client?.name || "Client"} className="client-avatar" />
        )}
        <div className="case-card-heading">
          <p className="case-tag">{subtitle}</p>
          <h3>{textOrDash(client?.name, "Unnamed Client")}</h3>
          <div className="case-card-contact">
            <span>{textOrDash(client?.phone, "No phone")}</span>
            {client?.email ? <span>{client.email}</span> : null}
            {!item?.caseNumber && clientCaseCount != null ? <span>{clientCaseCount} case{clientCaseCount === 1 ? "" : "s"}</span> : null}
            {item?.caseNumber ? <span>{sentenceCaseStatus(item?.status, "Running")}</span> : null}
          </div>
        </div>
        {/* Link removed from header to prioritize the standardized footer button */}
      </div>

      {children}

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




