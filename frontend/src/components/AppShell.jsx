import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { 
  fullLogout, 
  getOrganizationName, 
  getOrganizationLogoUrl,
  getUserEmail, 
  getUserRole,
  getUserFullName,
  getUserAvatarUrl
} from "../services/authService";
import { checkAdminStatus, isPlatformAdmin } from "../services/adminService";
import { useTheme } from "../context/ThemeContext";
import DotGrid from "./ui/DotGrid/DotGrid";
import appitureLogo from "../assets/appiture_logo.png";
import "./AppShell.css";


const baseNavItems = [
  { to: "/dashboard", label: "Dashboard", shortLabel: "DB", detail: "Practice overview" },
  { to: "/clients", label: "Clients", shortLabel: "CL", detail: "Profiles and contact records" },
  { to: "/cases", label: "Matters", shortLabel: "MT", detail: "Case portfolio and stages" },
  { to: "/payments", label: "Fees", shortLabel: "FE", detail: "Billing and collections" },
  { to: "/documents", label: "Documents", shortLabel: "DC", detail: "Evidence and filings" },
  { to: "/followups", label: "Follow-Ups", shortLabel: "FU", detail: "Hearings and reminders" },
  { to: "/settings", label: "Settings", shortLabel: "ST", detail: "App and profile config" },
];

function AppShell({ title, subtitle, actions, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const [organizationName, setOrganizationName] = useState(getOrganizationName());
  const [organizationLogo, setOrganizationLogo] = useState(getOrganizationLogoUrl());
  const [userName, setUserName] = useState(getUserFullName() || getUserEmail());
  const [userAvatar, setUserAvatar] = useState(getUserAvatarUrl());
  const [userRole, setUserRole] = useState(getUserRole());
  const [userEmail, setUserEmailState] = useState(getUserEmail());
  const [superAdmin, setSuperAdmin] = useState(isPlatformAdmin());

  const { theme } = useTheme();

  useEffect(() => {
    // Check platform admin status once per session
    checkAdminStatus({ force: true }).then(({ isPlatformAdmin: isAdmin }) => setSuperAdmin(isAdmin)).catch(() => {});

    const handleResize = () => {
      if (window.innerWidth > 980) {
        setSidebarOpen(false);
      }
    };

    const handleSessionUpdate = () => {
      setOrganizationName(getOrganizationName());
      setOrganizationLogo(getOrganizationLogoUrl());
      setUserName(getUserFullName() || getUserEmail());
      setUserAvatar(getUserAvatarUrl());
      setUserRole(getUserRole());
      setUserEmailState(getUserEmail());
    };

    const handleStorageEvent = (e) => {
      if (e.key === "lawoffice.session") {
        handleSessionUpdate();
      }
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("sessionUpdated", handleSessionUpdate);
    window.addEventListener("storage", handleStorageEvent);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("sessionUpdated", handleSessionUpdate);
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, []);

  // Build nav dynamically based on role.
  // Platform admins only see their own portal — no case/workspace items.
  const navItems = superAdmin
    ? [{ to: "/platform-admin", label: "Platform Admin", shortLabel: "PA", detail: "Super admin controls" }]
    : [
        ...baseNavItems,
        ...(getUserRole() === "ADMIN"
          ? [{ to: "/team", label: "Team", shortLabel: "TM", detail: "Manage organization members" }]
          : []),
      ];

  const getInitials = (name) => {
    if (!name) return "LO";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const location = useLocation();
  const isCaseDetail = location.pathname.startsWith("/cases/") && location.pathname !== "/cases";
  const isClientDetail = location.pathname.startsWith("/clients/") && location.pathname !== "/clients";

  const getSubItems = (to) => {
    if (to === "/cases" && isCaseDetail) {
      return [
        { hash: "#case-card", label: "Overview" },
        { hash: "#cases-portfolio", label: "Portfolio" },
        { hash: "#payment-card", label: "Financials" },
        { hash: "#followups-card", label: "Timeline" },
        { hash: "#documents-card", label: "Documents" },
      ];
    }
    if (to === "/clients" && isClientDetail) {
      return [
        { hash: "#client-info", label: "Identity" },
        { hash: "#cases-portfolio", label: "Cases" },
        { hash: "#payment-card", label: "Financials" },
        { hash: "#followups-card", label: "Timeline" },
        { hash: "#documents-card", label: "Documents" },
      ];
    }
    return [];
  };

  return (
    <div className={`app-shell${sidebarOpen ? " sidebar-open" : ""}`} style={{ position: "relative", zIndex: 0, background: "transparent" }}>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: -1, pointerEvents: "none", opacity: theme === "dark" ? 0.3 : 0.6 }}>
        <DotGrid
          baseColor={theme === "dark" ? "#64748B" : "#3A5BA0"}
          activeColor={theme === "dark" ? "#C9A34E" : "#6C8EDC"}
          dotSize={1.5}
          gap={24}
          proximity={150}
          shockRadius={200}
          shockStrength={4}
          resistance={800}
          returnDuration={1.2}
        />
      </div>

      <button
        type="button"
        className="app-sidebar-backdrop"
        aria-label="Close navigation"
        onClick={() => setSidebarOpen(false)}
      />

      <aside className="app-sidebar">
        <div className="app-sidebar-branding">
          {superAdmin ? (
            /* Platform admin — show a distinct identity, no org logo */
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
                    <strong>{item.label}</strong>
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

      <main className="app-main">
        <header className="page-header" onClick={() => sidebarOpen && setSidebarOpen(false)}>
          <div className="page-header-start">
            <button
              type="button"
              className="mobile-nav-trigger"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              Menu
            </button>

            <div>
              <p className="page-kicker">{superAdmin ? "Platform Admin" : organizationName}</p>
              <h2>{title}</h2>
              {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
            </div>
          </div>

          <div className="page-actions">
            {actions}
          </div>
        </header>

        <div className="app-content" onClick={() => sidebarOpen && setSidebarOpen(false)}>
          {children}
        </div>

        <footer className="page-footer">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "4px", opacity: 0.5 }}>
            <img src={appitureLogo} alt="Appiture" className="footer-logo" />
            <p>Developed by <strong>Appiture</strong></p>
          </div>
          <p>for queries contact <a href="https://www.appiture.in" target="_blank" rel="noopener noreferrer">www.appiture.in</a></p>
        </footer>
      </main>
    </div>
  );
}

export default AppShell;




