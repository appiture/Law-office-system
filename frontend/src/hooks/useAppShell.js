import { useEffect, useState, useCallback } from "react";
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
import { usePermissions } from "../context/PermissionsContext";
import { getCache, setCache } from "../lib/cache";

const baseNavItems = [
  { to: ROUTES.DASHBOARD, label: "Dashboard", shortLabel: "DB", detail: "Practice overview" },
  { to: ROUTES.CLIENTS, label: "Clients", shortLabel: "CL", detail: "Profiles and contact records" },
  { to: ROUTES.CASES, label: "Cases", shortLabel: "CS", detail: "Case management" },
  { to: ROUTES.PAYMENTS, label: "Payments", shortLabel: "PY", detail: "Billing and collections" },
  { to: ROUTES.DOCUMENTS, label: "Documents", shortLabel: "DC", detail: "Evidence and filings" },
  { to: ROUTES.HEARINGS, label: "Hearings", shortLabel: "HR", detail: "Court Dates and Events" },
  { to: ROUTES.TASKS, label: "Tasks", shortLabel: "TK", detail: "Team action items & deadlines" },
  { to: ROUTES.SETTINGS, label: "Settings", shortLabel: "ST", detail: "App and profile config" },
];

const TASK_COUNT_CACHE_TTL = 60 * 1000; // 1 minute

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

  const refreshPendingTasks = useCallback(async (force = false) => {
    try {
      const orgId = getOrganizationId();
      if (!orgId) return setPendingTaskCount(0);

      const cacheKey = `pendingTasksCount:${orgId}`;
      const cached = getCache(cacheKey);
      if (cached !== null && cached !== undefined && !force) {
        setPendingTaskCount(cached);
        return;
      }

      const { count, error } = await supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .in("status", ["PENDING", "IN_PROGRESS"]);

      if (error) throw error;
      const finalCount = count || 0;
      setPendingTaskCount(finalCount);
      setCache(cacheKey, finalCount, TASK_COUNT_CACHE_TTL);
    } catch (err) {
      console.error("Failed to fetch pending tasks", err);
      setPendingTaskCount(0);
    }
  }, []);

  useEffect(() => {
    checkAdminStatus({ force: true }).then((res) => {
      if (res.success) setSuperAdmin(res.data.isPlatformAdmin);
    }).catch(() => {});

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

    refreshPendingTasks();
    const handleRefreshEvent = () => refreshPendingTasks(true);
    window.addEventListener("tasksUpdated", handleRefreshEvent);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("sessionUpdated", handleSessionUpdate);
      window.removeEventListener("storage", handleStorageEvent);
      window.removeEventListener("tasksUpdated", handleRefreshEvent);
    };
  }, [refreshPendingTasks]);

  const getInitials = (name) => {
    if (!name) return "LO";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const isCaseDetail = location.pathname.startsWith(ROUTES.CASES + "/") && location.pathname !== ROUTES.CASES;
  const isClientDetail = location.pathname.startsWith(ROUTES.CLIENTS + "/") && location.pathname !== ROUTES.CLIENTS;
  const defaultRoute = superAdmin ? ROUTES.SUPER_ADMIN_DASHBOARD : ROUTES.DASHBOARD;
  const canGoBack = location.pathname !== defaultRoute;

  const { canAccess } = usePermissions();

  const filteredBaseNavItems = baseNavItems.filter(item => {
    const sectionKey = item.to.split("/")[1]; 
    return canAccess(sectionKey);
  });

  const navItems = superAdmin
    ? [
        { to: ROUTES.SUPER_ADMIN_DASHBOARD, label: "Platform Admin", shortLabel: "PA", detail: "Super admin controls" },
        { to: ROUTES.SYSTEM_AUDIT, label: "Audit Logs", shortLabel: "AL", detail: "System history" }
      ]
    : [
        ...filteredBaseNavItems,
        ...(getUserRole() === "ADMIN" && canAccess("team")
          ? [{ to: ROUTES.TEAM, label: "Team", shortLabel: "TM", detail: "Manage organization members" }]
          : []),
      ];

  const getSubItems = (to) => {
    if (to === ROUTES.CASES && isCaseDetail) {
      return [
        canAccess("cases") ? { hash: "#case-card", label: "Overview" } : null,
        canAccess("payments") ? { hash: "#payment-card", label: "Payments" } : null,
        canAccess("hearings") ? { hash: "#hearings-card", label: "Hearings" } : null,
        canAccess("documents") ? { hash: "#documents-card", label: "Documents" } : null,
      ].filter(Boolean);
    }
    if (to === ROUTES.CLIENTS && isClientDetail) {
      return [
        canAccess("clients") ? { hash: "#client-info", label: "Identity" } : null,
        canAccess("cases") ? { hash: "#case-card", label: "Cases" } : null,
        canAccess("payments") ? { hash: "#payment-card", label: "Payments" } : null,
        canAccess("hearings") ? { hash: "#hearings-card", label: "Hearings" } : null,
        canAccess("documents") ? { hash: "#documents-card", label: "Documents" } : null,
      ].filter(Boolean);
    }
    return [];
  };

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
    navItems,
    getSubItems,
    isCaseDetail,
    isClientDetail,
    canGoBack,
    handleBack,
    location,
  };
}
