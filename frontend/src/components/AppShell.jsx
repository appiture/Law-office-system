import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { 
  fullLogout, 
  getOrganizationName, 
  getOrganizationLogoUrl,
  getOrganizationId,
  getUserEmail, 
  getUserRole,
  getUserFullName,
  getUserAvatarUrl
} from "../services/authService";
import { checkAdminStatus, isPlatformAdmin } from "../services/adminService";
import { useTheme } from "../context/ThemeContext";
import { usePermissions } from "../context/PermissionsContext";
import appitureLogo from "../assets/appiture_logo.png";
import { supabase } from "../services/supabaseClient";
import "./AppShell.css";


const baseNavItems = [
  { to: "/dashboard", label: "Dashboard", shortLabel: "DB", detail: "Practice overview" },
  { to: "/clients", label: "Clients", shortLabel: "CL", detail: "Profiles and contact records" },
  { to: "/cases", label: "Cases", shortLabel: "CS", detail: "Case management" },
  { to: "/payments", label: "Fees", shortLabel: "FE", detail: "Billing and collections" },
  { to: "/documents", label: "Documents", shortLabel: "DC", detail: "Evidence and filings" },
  { to: "/followups", label: "Timeline", shortLabel: "TL", detail: "Hearings and Court Dates" },
  { to: "/tasks", label: "Tasks", shortLabel: "TK", detail: "Team action items & deadlines" },
  { to: "/settings", label: "Settings", shortLabel: "ST", detail: "App and profile config" },
];

function AppShell({ title, subtitle, actions, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth > 980);
  
  const [organizationName, setOrganizationName] = useState(getOrganizationName());
  const [organizationLogo, setOrganizationLogo] = useState(getOrganizationLogoUrl());
  const [userName, setUserName] = useState(getUserFullName() || getUserEmail());
  const [userAvatar, setUserAvatar] = useState(getUserAvatarUrl());
  const [userRole, setUserRole] = useState(getUserRole());
  const [userEmail, setUserEmailState] = useState(getUserEmail());
  const [superAdmin, setSuperAdmin] = useState(isPlatformAdmin());
  const [pendingTaskCount, setPendingTaskCount] = useState(0);

  const { theme, toggleTheme } = useTheme();
  const { canAccess } = usePermissions();

  useEffect(() => {
    // Check platform admin status once per session
    checkAdminStatus({ force: true }).then(({ isPlatformAdmin: isAdmin }) => setSuperAdmin(isAdmin)).catch(() => {});

    const handleResize = () => {
      const desktop = window.innerWidth > 980;
      setIsDesktop(desktop);
      if (desktop) {
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

    // Count pending tasks from localStorage (fast, no API call needed in sidebar)
    const refreshPendingTasks = async () => {
      try {
        const orgId = getOrganizationId();

        if (!orgId) {
          setPendingTaskCount(0);
          return;
        }

        const { count, error } = await supabase
          .from("tasks")
          .select("*", {
            count: "exact",
            head: true
          })
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .in("status", [
            "PENDING",
            "IN_PROGRESS"
          ]);

        if (error) throw error;

        setPendingTaskCount(count || 0);

      } catch (err) {
        console.error(
          "Failed to fetch pending tasks",
          err
        );

        setPendingTaskCount(0);
      }
    };
    refreshPendingTasks();
    window.addEventListener("tasksUpdated", refreshPendingTasks);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("sessionUpdated", handleSessionUpdate);
      window.removeEventListener("storage", handleStorageEvent);
      window.removeEventListener("tasksUpdated", refreshPendingTasks);
    };
  }, []);

  // Build nav dynamically based on role.
  // Platform admins only see their own portal — no case/workspace items.
  const filteredBaseNavItems = baseNavItems.filter(item => {
    const sectionKey = item.to.replace("/", ""); // "/clients" -> "clients"
    return canAccess(sectionKey);
  });

  const navItems = superAdmin
    ? [
        { to: "/platform-admin", label: "Platform Admin", shortLabel: "PA", detail: "Super admin controls" },
        { to: "/system-audit", label: "Audit Logs", shortLabel: "AL", detail: "System history" }
      ]
    : [
        ...filteredBaseNavItems,
        ...(getUserRole() === "ADMIN" && canAccess("team")
          ? [
              { to: "/team", label: "Team", shortLabel: "TM", detail: "Manage organization members" },
            ]
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
        canAccess("cases") ? { hash: "#case-card", label: "Overview" } : null,
        canAccess("payments") ? { hash: "#payment-card", label: "Financials" } : null,
        canAccess("followups") ? { hash: "#followups-card", label: "Timeline" } : null,
        canAccess("documents") ? { hash: "#documents-card", label: "Documents" } : null,
      ].filter(Boolean);
    }
    if (to === "/clients" && isClientDetail) {
      return [
        canAccess("clients") ? { hash: "#client-info", label: "Identity" } : null,
        canAccess("cases") ? { hash: "#case-card", label: "Cases" } : null,
        canAccess("payments") ? { hash: "#payment-card", label: "Financials" } : null,
        canAccess("followups") ? { hash: "#followups-card", label: "Timeline" } : null,
        canAccess("documents") ? { hash: "#documents-card", label: "Documents" } : null,
      ].filter(Boolean);
    }
    return [];
  };

  return (
    <div className={`app-shell${sidebarOpen ? " sidebar-open" : ""}`} style={{ position: "relative", zIndex: 0, background: "transparent" }}>
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
                    <strong>
                      {item.label}
                      {item.to === "/tasks" && pendingTaskCount > 0 && (
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

            <div className="header-title-block">
              <p className="page-kicker">{superAdmin ? "Platform Admin" : organizationName}</p>
              <div className="header-title-row">
                <h2 className="header-main-title">{title}</h2>
                <button 
                  type="button"
                  className="theme-toggle-header-btn"
                  onClick={toggleTheme}
                  title="Toggle Theme"
                >
                  {theme === "light" ? "🌙" : "☀️"}
                </button>
              </div>
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
