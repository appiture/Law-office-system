import { ArrowLeft } from "lucide-react";

function PageHeader({ 
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
  sidebarOpen
}) {
  return (
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
  );
}

export default PageHeader;
