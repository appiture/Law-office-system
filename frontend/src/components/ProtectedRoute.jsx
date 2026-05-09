import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { 
  canAccessWorkspace, 
  isAuthenticated, 
  syncSupabaseSession,
  getWorkspaceAccessMessage,
  fullLogout,
  mustResetPassword
} from "../services/authService";
import { isPlatformAdmin, checkAdminStatus } from "../services/adminService";

function ProtectedRoute({ children }) {
  const location = useLocation();
  const hasCachedAccess = isAuthenticated() && (canAccessWorkspace() || isPlatformAdmin());
  const [ready, setReady]                 = useState(hasCachedAccess);
  const [authenticated, setAuthenticated] = useState(hasCachedAccess);
  const [hasWorkspace, setHasWorkspace]   = useState(hasCachedAccess);
  const [isAdmin, setIsAdmin]             = useState(isPlatformAdmin());
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
            const { isPlatformAdmin: adminResult } = await checkAdminStatus({ force: true });
            if (!cancelled) {
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
    return <Navigate to="/login" replace />;
  }

  if (mustResetPassword() && location.pathname !== "/reset-password") {
    return <Navigate to="/reset-password" replace />;
  }

  // Platform admin with no workspace → send directly to their portal
  if (isAdmin && !canAccessWorkspace() && location.pathname !== "/platform-admin") {
    return <Navigate to="/platform-admin" replace />;
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

  return children;
}

export default ProtectedRoute;




