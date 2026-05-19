import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { isAuthenticated, getUserRole } from "../services/authService";

const CORE_SECTIONS = new Set(["dashboard", "settings"]);
const ALL_SECTIONS = ["dashboard","clients","cases","payments","documents","hearings","tasks","settings","team"];

const PermissionsContext = createContext({
  permissions: {},
  permissionsReady: false,
  canAccess: () => false,
  refetchPermissions: () => {},
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

    // ADMIN role always gets full access — no DB round-trip needed
    const role = getUserRole();
    if (role === "ADMIN") {
      const allTrue = Object.fromEntries(ALL_SECTIONS.map(s => [s, true]));
      setPermissions(allTrue);
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
    // Fired by TeamManagement after saving member permissions
    window.addEventListener("permissionsChanged", fetchPermissions);
    return () => {
      window.removeEventListener("sessionUpdated", fetchPermissions);
      window.removeEventListener("permissionsChanged", fetchPermissions);
    };
  }, [fetchPermissions]);

  const canAccess = (section) => {
    if (CORE_SECTIONS.has(section)) return true;
    // Fail-closed: deny if not explicitly true
    return Boolean(permissions[section]);
  };

  return (
    <PermissionsContext.Provider value={{ permissions, permissionsReady, canAccess, refetchPermissions: fetchPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export const usePermissions = () => useContext(PermissionsContext);
