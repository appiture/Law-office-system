import React from "react";
import { useTheme } from "../../context/ThemeContext";
import { useAppShell } from "../../hooks/useAppShell";
import appitureLogo from "../../assets/appiture_logo.png";
import Sidebar from "./Sidebar";
import Header from "./Header";
import DotGrid from "../ui/DotGrid/DotGrid";
import BorderGlow from "../ui/BorderGlow/BorderGlow";
import "../AppShell.css";
import "../../styles/effects.css";

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
    navItems,
    getSubItems,
    canGoBack,
    handleBack,
  } = useAppShell();

  const { theme, toggleTheme } = useTheme();

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
        <Header 
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
          pendingTaskCount={pendingTaskCount}
        />

        <div className="app-content" onClick={() => sidebarOpen && setSidebarOpen(false)}>
          <BorderGlow className="border-glow-wrapper" glowIntensity={0.5} borderRadius={24}>
            <div className="dot-grid-background">
              <DotGrid dotSize={1} gap={24} opacity={0.05} />
            </div>
            <div className="app-shell-inner">
              {children}
            </div>
          </BorderGlow>
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
