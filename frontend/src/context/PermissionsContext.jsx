import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { isAuthenticated } from "../services/authService";

const ALL_SECTIONS = ["dashboard", "clients", "cases", "payments", "documents", "followups", "settings", "team"];

const PermissionsContext = createContext({ permissions: {}, canAccess: () => true });

export function PermissionsProvider({ children }) {
  const [permissions, setPermissions] = useState({});

  useEffect(() => {
    const fetchPermissions = async () => {
      if (!isAuthenticated() || !supabase) return;
      try {
        const { data, error } = await supabase.rpc("get_my_permissions");
        if (data) {
          setPermissions(data);
        }
      } catch (err) {
        console.error("Error fetching permissions:", err);
      }
    };

    fetchPermissions();
  }, []);

  const canAccess = (section) => {
    // If permissions object is empty (e.g. not loaded yet), default to true or handle accordingly
    // Given the prompt: default allow if section not in permissions
    if (!(section in permissions)) return true; 
    return Boolean(permissions[section]);
  };

  return (
    <PermissionsContext.Provider value={{ permissions, canAccess }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export const usePermissions = () => useContext(PermissionsContext);
