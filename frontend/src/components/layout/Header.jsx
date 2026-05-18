import { ArrowLeft } from "lucide-react";
import { useLocation } from "react-router-dom";
import MobileNav from "./MobileNav";
import ThemeToggle from "./ThemeToggle";
import NotificationBell from "./NotificationBell";

function Header({ 
  setSidebarOpen, 
  handleBack, 
  canGoBack, 
  superAdmin, 
  organizationName, 
  title, 
  subtitle, 
  theme, 
  toggleTheme, 
  actions,
  sidebarOpen,
  pendingTaskCount
}) {
  const location = useLocation();
  const isDashboard = location.pathname === "/dashboard" || location.pathname === "/platform-admin";

  return (
    <header className="page-header" onClick={() => sidebarOpen && setSidebarOpen(false)}>
      <div className="page-header-start">
        <MobileNav setSidebarOpen={setSidebarOpen} />
        
        {canGoBack && (
          <button
            type="button"
            className="page-back-button"
            onClick={handleBack}
            title="Go back"
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
        )}

        <div className="header-title-block">
          <p className="page-kicker">{superAdmin ? "Platform Admin" : organizationName}</p>
          <div className="header-title-row">
            <h2 className="header-main-title">{title}</h2>
            {isDashboard && <ThemeToggle theme={theme} toggleTheme={toggleTheme} />}
          </div>
          {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        </div>
      </div>

      <div className="page-actions">
        {isDashboard && !superAdmin && <NotificationBell pendingTaskCount={pendingTaskCount} />}
        {actions}
      </div>
    </header>
  );
}

export default Header;
