import React, { useMemo } from 'react';
import './ProfileCard.css';

const DEFAULT_INNER_GRADIENT = 'linear-gradient(145deg,#60496e8c 0%,#71C4FF44 100%)';

const ProfileCardComponent = ({
  avatarUrl = '<Placeholder for avatar URL>',
  iconUrl = '',
  grainUrl = '',
  innerGradient,
  behindGlowEnabled = true,
  behindGlowColor,
  behindGlowSize,
  className = '',
  name = 'Javi A. Torres',
  title = 'Software Engineer',
  email,
  phone,
  contactText = 'Contact',
  showUserInfo = true,
  onContactClick
}) => {
  const cardStyle = useMemo(
    () => ({
      '--icon': iconUrl ? `url(${iconUrl})` : 'none',
      '--grain': grainUrl ? `url(${grainUrl})` : 'none',
      '--inner-gradient': innerGradient ?? DEFAULT_INNER_GRADIENT,
      '--behind-glow-color': behindGlowColor ?? 'rgba(125, 190, 255, 0.67)',
      '--behind-glow-size': behindGlowSize ?? '50%'
    }),
    [iconUrl, grainUrl, innerGradient, behindGlowColor, behindGlowSize]
  );

  return (
    <div className={`pc-card-wrapper ${className}`.trim()} style={cardStyle}>
      {behindGlowEnabled && <div className="pc-behind" />}
      <div className="pc-card-shell">
        <section className="pc-card">
          <div className="pc-inside">
            <div className="pc-shine" />
            <div className="pc-glare" />
            
            <div className="pc-content pc-avatar-content">
              {avatarUrl && (
                <img
                  className="avatar"
                  src={avatarUrl}
                  alt={`${name || 'User'} avatar`}
                  loading="lazy"
                  onError={e => {
                    const t = e.target;
                    t.style.display = 'none';
                  }}
                />
              )}
            </div>
            
            <div className="pc-content pc-bottom-content">
              <div className="pc-details">
                <h3>{name}</h3>
                <p>{title}</p>
                
                {showUserInfo && (
                  <div className="pc-contact-details">
                    {email && (
                      <a href={`mailto:${email}`} onClick={e => e.stopPropagation()} className="pc-meta-link">
                        📧 {email}
                      </a>
                    )}
                    {phone && (
                      <a href={`https://wa.me/${phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="pc-meta-link">
                        📞 {phone}
                      </a>
                    )}
                    <button
                      className="pc-contact-btn"
                      onClick={onContactClick}
                      type="button"
                    >
                      {contactText}
                    </button>
                  </div>
                )}
              </div>
            </div>
            
          </div>
        </section>
      </div>
    </div>
  );
};

const ProfileCard = React.memo(ProfileCardComponent);
export default ProfileCard;
