import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { isAuthenticated } from "../services/authService";

const PermissionsContext = createContext({ permissions: {}, canAccess: () => true });

export function PermissionsProvider({ children }) {
  const [permissions, setPermissions] = useState({});

  useEffect(() => {
    const fetchPermissions = async () => {
      if (!isAuthenticated() || !supabase) return;
      try {
        const { data, error } = await supabase.rpc("get_my_permissions");
        if (error) console.error("Permissions fetch failed:", error);
        if (data) setPermissions(data);
      } catch (err) {
        console.error("Error fetching permissions:", err);
      }
    };

    fetchPermissions();
  }, []);

  const canAccess = (section) => {
    // Core sections always accessible
    if (section === "dashboard" || section === "settings") return true;

    // Fail-closed: If permission is not defined or is false, deny access.
    return Boolean(permissions[section]);
  };

  return (
    <PermissionsContext.Provider value={{ permissions, canAccess }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export const usePermissions = () => useContext(PermissionsContext);
