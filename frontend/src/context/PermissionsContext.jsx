import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { isAuthenticated } from "../services/authService";

const CORE_SECTIONS = new Set(["dashboard", "settings"]);

const PermissionsContext = createContext({
  permissions: {},
  permissionsReady: false,
  canAccess: () => false,
});

export function PermissionsProvider({ children }) {
  const [permissions, setPermissions] = useState({});
  const [permissionsReady, setPermissionsReady] = useState(false);

  const fetchPermissions = useCallback(async () => {
    setPermissionsReady(false);

    if (!isAuthenticated() || !supabase) {
      setPermissions({});
      setPermissionsReady(true);
      return;
    }

    try {
      const { data, error } = await supabase.rpc("get_my_permissions");
      if (error) {
        console.error("Permissions fetch failed:", error);
        setPermissions({});
        return;
      }

      setPermissions(data || {});
    } catch (err) {
      console.error("Error fetching permissions:", err);
      setPermissions({});
    } finally {
      setPermissionsReady(true);
    }
  }, []);

  useEffect(() => {
    fetchPermissions();

    window.addEventListener("sessionUpdated", fetchPermissions);
    return () => {
      window.removeEventListener("sessionUpdated", fetchPermissions);
    };
  }, [fetchPermissions]);

  const canAccess = (section) => {
    if (CORE_SECTIONS.has(section)) return true;

    // Fail-closed: If permission is still loading, not defined, or false, deny access.
    return Boolean(permissions[section]);
  };

  return (
    <PermissionsContext.Provider value={{ permissions, permissionsReady, canAccess }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export const usePermissions = () => useContext(PermissionsContext);
