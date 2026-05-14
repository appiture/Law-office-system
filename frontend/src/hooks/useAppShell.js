import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { 
  getOrganizationName, 
  getOrganizationLogoUrl,
  getOrganizationId,
  getUserEmail, 
  getUserRole,
  getUserFullName,
  getUserAvatarUrl
} from "../services/authService";
import { checkAdminStatus, isPlatformAdmin } from "../services/adminService";
import { supabase } from "../services/supabaseClient";
import { ROUTES } from "../constants/routes";

export function useAppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth > 980);
  const navigate = useNavigate();
  const location = useLocation();
  
  const [organizationName, setOrganizationName] = useState(getOrganizationName());
  const [organizationLogo, setOrganizationLogo] = useState(getOrganizationLogoUrl());
  const [userName, setUserName] = useState(getUserFullName() || getUserEmail());
  const [userAvatar, setUserAvatar] = useState(getUserAvatarUrl());
  const [userRole, setUserRole] = useState(getUserRole());
  const [userEmail, setUserEmailState] = useState(getUserEmail());
  const [superAdmin, setSuperAdmin] = useState(isPlatformAdmin());
  const [pendingTaskCount, setPendingTaskCount] = useState(0);

  useEffect(() => {
    checkAdminStatus({ force: true }).then(({ isPlatformAdmin: isAdmin }) => setSuperAdmin(isAdmin)).catch(() => {});

    const handleResize = () => {
      const desktop = window.innerWidth > 980;
      setIsDesktop(desktop);
      if (desktop) setSidebarOpen(false);
    };

    const handleSessionUpdate = () => {
      setOrganizationName(getOrganizationName());
      setOrganizationLogo(getOrganizationLogoUrl());
      setUserName(getUserFullName() || getUserEmail());
      setUserAvatar(getUserAvatarUrl());
      setUserRole(getUserRole());
      setUserEmailState(getUserEmail());
    };

    const handleStorageEvent = (e) => {
      if (e.key === "lawoffice.session") handleSessionUpdate();
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("sessionUpdated", handleSessionUpdate);
    window.addEventListener("storage", handleStorageEvent);

    const refreshPendingTasks = async () => {
      try {
        const orgId = getOrganizationId();
        if (!orgId) return setPendingTaskCount(0);

        const { count, error } = await supabase
          .from("tasks")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .in("status", ["PENDING", "IN_PROGRESS"]);

        if (error) throw error;
        setPendingTaskCount(count || 0);
      } catch (err) {
        console.error("Failed to fetch pending tasks", err);
        setPendingTaskCount(0);
      }
    };

    refreshPendingTasks();
    window.addEventListener("tasksUpdated", refreshPendingTasks);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("sessionUpdated", handleSessionUpdate);
      window.removeEventListener("storage", handleStorageEvent);
      window.removeEventListener("tasksUpdated", refreshPendingTasks);
    };
  }, []);

  const getInitials = (name) => {
    if (!name) return "LO";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const isCaseDetail = location.pathname.startsWith("/cases/") && location.pathname !== "/cases";
  const isClientDetail = location.pathname.startsWith("/clients/") && location.pathname !== "/clients";
  const defaultRoute = superAdmin ? ROUTES.SUPER_ADMIN_DASHBOARD : ROUTES.DASHBOARD;
  const canGoBack = location.pathname !== defaultRoute;

  const handleBack = () => {
    if (window.history.length > 1 && canGoBack) {
      navigate(-1);
    } else {
      navigate(defaultRoute);
    }
  };

  return {
    sidebarOpen,
    setSidebarOpen,
    isDesktop,
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
  };
}
