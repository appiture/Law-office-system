import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ROUTES } from "../constants/routes";
import { 
  canAccessWorkspace, 
  isAuthenticated, 
  syncSupabaseSession,
  getWorkspaceAccessMessage,
  fullLogout,
  mustResetPassword,
  isDemoExpired,
  getDemoExpiresAt
} from "../services/authService";
import { isPlatformAdmin, checkAdminStatus } from "../services/adminService";
import { usePermissions } from "../context/PermissionsContext";
import DemoExpiredScreen from "./DemoExpiredScreen";

function ProtectedRoute({ children, section, requirePlatformAdmin = false }) {
  const { canAccess, permissionsReady } = usePermissions();
  const location = useLocation();
  const hasCachedAccess = isAuthenticated() && (canAccessWorkspace() || isPlatformAdmin());
  const [ready, setReady]                 = useState(hasCachedAccess);
  const [authenticated, setAuthenticated] = useState(hasCachedAccess);
  const [hasWorkspace, setHasWorkspace]   = useState(hasCachedAccess);
  const [isAdmin, setIsAdmin]             = useState(isPlatformAdmin());
  const [isExpired, setIsExpired]         = useState(isDemoExpired());
  const [accessMessage, setAccessMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        await syncSupabaseSession();

        // Platform admins have no org — canAccessWorkspace is always false for them.
        // Hit the DB once to verify before blocking with the workspace error.
        if (isAuthenticated() && !canAccessWorkspace()) {
          try {
            const res = await checkAdminStatus({ force: true });
            if (!cancelled && res.success) {
              const adminResult = res.data.isPlatformAdmin;
              setIsAdmin(adminResult);
              if (adminResult) {
                setAuthenticated(true);
                setHasWorkspace(true);
                setReady(true);
                return;
              }
            }
          } catch {
            // Not a platform admin — fall through to workspace-blocked screen
          }
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) {
          setAuthenticated(isAuthenticated());
          setHasWorkspace(canAccessWorkspace() || isPlatformAdmin());
          setIsAdmin(isPlatformAdmin());
          setIsExpired(isDemoExpired());
          setAccessMessage(getWorkspaceAccessMessage());
          setReady(true);
        }
      }
    };
    hydrate();
    return () => { cancelled = true; };
  }, []);

  if (!ready) {
    return (
      <div className="page-loader">
        Loading workspace...
      </div>
    );
  }

  if (!authenticated) {
    if (window.isLoggingOut) return null;
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  if (mustResetPassword() && location.pathname !== ROUTES.RESET_PASSWORD) {
    return <Navigate to={ROUTES.RESET_PASSWORD} replace />;
  }

  // Explicit platform admin route protection
  if (requirePlatformAdmin && !isAdmin) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  // Path-based fallback for platform admin routes just in case
  if (location.pathname.startsWith(ROUTES.SUPER_ADMIN_DASHBOARD) && !isAdmin) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }
  
  if (location.pathname.startsWith(ROUTES.SYSTEM_AUDIT) && !isAdmin) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  // Platform admin with no workspace → send directly to their portal
  if (isAdmin && !canAccessWorkspace() && !location.pathname.startsWith(ROUTES.SUPER_ADMIN_DASHBOARD) && !location.pathname.startsWith(ROUTES.SYSTEM_AUDIT)) {
    return <Navigate to={ROUTES.SUPER_ADMIN_DASHBOARD} replace />;
  }

  // Demo expired block (only platform admins are exempt)
  if (isExpired && !isAdmin) {
    return <DemoExpiredScreen demoExpiresAt={getDemoExpiresAt()} />;
  }

  // Regular user whose org is not yet approved
  if (!hasWorkspace) {
    return (
      <div className="page-loader" style={{ 
        flexDirection: "column", 
        gap: 20, 
        padding: 40,
        textAlign: "center"
      }}>
        <p style={{ fontSize: 22, fontWeight: 800 }}>
          Workspace Access Pending
        </p>
        <p style={{ 
          maxWidth: 480, 
          opacity: 0.7, 
          lineHeight: 1.6 
        }}>
          {accessMessage || 
            "Your workspace is pending approval. " +
            "Contact your platform administrator."}
        </p>
        <button
          className="ghost-button"
          onClick={() => void fullLogout()}
        >
          Sign Out
        </button>
      </div>
    );
  }

  if (section && !permissionsReady) {
    return (
      <div className="page-loader">
        Loading permissions...
      </div>
    );
  }

  if (section && !canAccess(section)) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return children;
}

export default ProtectedRoute;




