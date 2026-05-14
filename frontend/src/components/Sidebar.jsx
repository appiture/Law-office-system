import { NavLink } from "react-router-dom";
import { fullLogout } from "../services/authService";

function Sidebar({ 
  superAdmin, 
  organizationName, 
  organizationLogo, 
  setOrganizationLogo,
  getInitials,
  navItems,
  getSubItems,
  setSidebarOpen,
  pendingTaskCount,
  userAvatar,
  userName,
  userEmail,
  userRole,
  setUserAvatar
}) {
  return (
    <aside className="app-sidebar">
      <div className="app-sidebar-branding">
        {superAdmin ? (
          <>
            <div className="brand-mark" aria-hidden="true" style={{ background: "linear-gradient(135deg,#C9A34E,#a07830)", color: "#0f172a" }}>PA</div>
            <div className="brand-copy">
              <h1 style={{ fontSize: 13, color: "#C9A34E" }}>Platform Admin</h1>
            </div>
          </>
        ) : (
          <>
            {organizationLogo ? (
              <img src={organizationLogo} alt={organizationName} className="org-logo" onError={() => setOrganizationLogo(null)} />
            ) : (
              <div className="brand-mark" aria-hidden="true">{getInitials(organizationName)}</div>
            )}
            <div className="brand-copy">
              <h1>{organizationName}</h1>
            </div>
          </>
        )}
      </div>

      <nav className="app-nav">
        {navItems.map((item) => {
          const subItems = getSubItems(item.to);
          return (
            <div key={item.to} className="nav-group">
              <NavLink
                to={item.to}
                title={item.label}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
              >
                <span className="nav-link-mark" aria-hidden="true">{item.shortLabel}</span>
                <span className="nav-link-copy">
                  <strong>
                    {item.label}
                    {item.to.includes("tasks") && pendingTaskCount > 0 && (
                      <span className="nav-badge" title={`${pendingTaskCount} pending tasks`}>
                        {pendingTaskCount > 99 ? "99+" : pendingTaskCount}
                      </span>
                    )}
                  </strong>
                  <small>{item.detail}</small>
                </span>
              </NavLink>
              {subItems.length > 0 && (
                <div className="nav-sub-items">
                  {subItems.map(sub => (
                    <a 
                      key={sub.hash} 
                      href={sub.hash} 
                      className="nav-sub-link"
                      onClick={() => setSidebarOpen(false)}
                    >
                      {sub.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="profile-panel">
        <div className="profile-info">
          {userAvatar ? (
            <img src={userAvatar} alt={userName} className="user-avatar" onError={() => setUserAvatar(null)} />
          ) : (
            <div className="user-avatar-fallback">{userEmail.charAt(0).toUpperCase()}</div>
          )}
          <div className="profile-copy">
            <p className="profile-label">Signed in as</p>
            <strong>{userName || userEmail}</strong>
            <p className="profile-role" style={superAdmin ? { color: "#C9A34E", fontWeight: 700 } : {}}>
              {superAdmin ? "⭐ Super Admin" : userRole}
            </p>
          </div>
        </div>
        <button type="button" className="ghost-button" onClick={() => void fullLogout()}>
          Logout
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
