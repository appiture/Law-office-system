import { useTheme } from "../context/ThemeContext";
import { usePermissions } from "../context/PermissionsContext";
import { useAppShell } from "../hooks/useAppShell";
import appitureLogo from "../assets/appiture_logo.png";
import Sidebar from "./Sidebar";
import PageHeader from "./PageHeader";
import { ROUTES } from "../constants/routes";
import { getUserRole } from "../services/authService";
import "./AppShell.css";

const baseNavItems = [
  { to: ROUTES.DASHBOARD, label: "Dashboard", shortLabel: "DB", detail: "Practice overview" },
  { to: ROUTES.CLIENTS, label: "Clients", shortLabel: "CL", detail: "Profiles and contact records" },
  { to: ROUTES.CASES, label: "Cases", shortLabel: "CS", detail: "Case management" },
  { to: ROUTES.PAYMENTS, label: "Payments", shortLabel: "PY", detail: "Billing and collections" },
  { to: ROUTES.DOCUMENTS, label: "Documents", shortLabel: "DC", detail: "Evidence and filings" },
  { to: ROUTES.HEARINGS, label: "Hearings", shortLabel: "HR", detail: "Court Dates and Followups" },
  { to: ROUTES.TASKS, label: "Tasks", shortLabel: "TK", detail: "Team action items & deadlines" },
  { to: ROUTES.SETTINGS, label: "Settings", shortLabel: "ST", detail: "App and profile config" },
];

function AppShell({ title, subtitle, actions, children }) {
  const {
    sidebarOpen,
    setSidebarOpen,
    organizationName,
    organizationLogo,
    setOrganizationLogo,
    userName,
    userAvatar,
    setUserAvatar,
    userRole,
    userEmail,
    superAdmin,
    pendingTaskCount,
    getInitials,
    isCaseDetail,
    isClientDetail,
    canGoBack,
    handleBack,
    location,
  } = useAppShell();

  const { theme, toggleTheme } = useTheme();
  const { canAccess } = usePermissions();

  const filteredBaseNavItems = baseNavItems.filter(item => {
    const sectionKey = item.to.split("/")[1]; 
    return canAccess(sectionKey);
  });

  const navItems = superAdmin
    ? [
        { to: ROUTES.SUPER_ADMIN_DASHBOARD, label: "Platform Admin", shortLabel: "PA", detail: "Super admin controls" },
        { to: ROUTES.SYSTEM_AUDIT, label: "Audit Logs", shortLabel: "AL", detail: "System history" }
      ]
    : [
        ...filteredBaseNavItems,
        ...(getUserRole() === "ADMIN" && canAccess("team")
          ? [{ to: ROUTES.TEAM, label: "Team", shortLabel: "TM", detail: "Manage organization members" }]
          : []),
      ];

  const getSubItems = (to) => {
    if (to === ROUTES.CASES && isCaseDetail) {
      return [
        canAccess("cases") ? { hash: "#case-card", label: "Overview" } : null,
        canAccess("payments") ? { hash: "#payment-card", label: "Payments" } : null,
        canAccess("followups") ? { hash: "#followups-card", label: "Hearings" } : null,
        canAccess("documents") ? { hash: "#documents-card", label: "Documents" } : null,
      ].filter(Boolean);
    }
    if (to === ROUTES.CLIENTS && isClientDetail) {
      return [
        canAccess("clients") ? { hash: "#client-info", label: "Identity" } : null,
        canAccess("cases") ? { hash: "#case-card", label: "Cases" } : null,
        canAccess("payments") ? { hash: "#payment-card", label: "Payments" } : null,
        canAccess("followups") ? { hash: "#followups-card", label: "Hearings" } : null,
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

      <Sidebar 
        superAdmin={superAdmin}
        organizationName={organizationName}
        organizationLogo={organizationLogo}
        setOrganizationLogo={setOrganizationLogo}
        getInitials={getInitials}
        navItems={navItems}
        getSubItems={getSubItems}
        setSidebarOpen={setSidebarOpen}
        pendingTaskCount={pendingTaskCount}
        userAvatar={userAvatar}
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        setUserAvatar={setUserAvatar}
      />

      <main className="app-main">
        <PageHeader 
          setSidebarOpen={setSidebarOpen}
          handleBack={handleBack}
          canGoBack={canGoBack}
          superAdmin={superAdmin}
          organizationName={organizationName}
          title={title}
          subtitle={subtitle}
          theme={theme}
          toggleTheme={toggleTheme}
          actions={actions}
          sidebarOpen={sidebarOpen}
        />

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
