import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { supabase } from "./services/supabaseClient";
import { clearAuthData, syncSupabaseSession } from "./services/authService";
import { isPlatformAdmin } from "./services/adminService";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import ExportModal from "./components/ExportModal";
import "./styles/designSystem.css";
import "./styles/themeOverrides.css";
import "./App.css";
import { setUser, clearUser } from "./store/sessionStore";
import { ROUTES } from "./constants/routes";

const routePreloaders = [
  () => import("./pages/Login"),
  () => import("./pages/Dashboard"),
  () => import("./pages/Clients"),
  () => import("./pages/Cases"),
  () => import("./pages/Payments"),
  () => import("./pages/Documents"),
  () => import("./pages/Hearings"),
  () => import("./pages/CaseDetails"),
  () => import("./pages/ClientDetails"),
  () => import("./pages/Settings"),
  () => import("./pages/SuperAdminDashboard"),
  () => import("./pages/TeamManagement"),
  () => import("./pages/ResetPassword"),
  () => import("./pages/SuperAdminLogin"),
  () => import("./pages/SystemAuditLogs"),
  () => import("./pages/Tasks"),
];

// Code splitting, with idle preloading so first section visits feel immediate.
const Login = lazy(routePreloaders[0]);
const Dashboard = lazy(routePreloaders[1]);
const Clients = lazy(routePreloaders[2]);
const Cases = lazy(routePreloaders[3]);
const Payments = lazy(routePreloaders[4]);
const Documents = lazy(routePreloaders[5]);
const Hearings = lazy(routePreloaders[6]);
const CaseDetails = lazy(routePreloaders[7]);
const ClientDetails = lazy(routePreloaders[8]);
const Settings = lazy(routePreloaders[9]);
const SuperAdminDashboard = lazy(routePreloaders[10]);
const TeamManagement = lazy(routePreloaders[11]);
const ResetPassword = lazy(routePreloaders[12]);
const SuperAdminLogin = lazy(routePreloaders[13]);
const SystemAuditLogs = lazy(routePreloaders[14]);
const Tasks = lazy(routePreloaders[15]);

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return null;
}

function App() {
  useEffect(() => {
    if (!supabase) return;

    const deferredAuthTasks = new Set();
    const deferAuthTask = (task) => {
      const taskId = window.setTimeout(() => {
        deferredAuthTasks.delete(taskId);
        void task();
      }, 0);
      deferredAuthTasks.add(taskId);
    };

    let userChannel = null;

    // Keep this callback synchronous. Supabase holds an auth lock while
    // emitting events, so API calls are deferred until after the lock exits.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
        deferAuthTask(() => syncSupabaseSession(session));
        
        // Listen to role changes in realtime
        if (!userChannel || userChannel.topic !== `realtime:user_${session.user.id}`) {
          if (userChannel) supabase.removeChannel(userChannel);
          userChannel = supabase.channel(`user_${session.user.id}`)
            .on(
              "postgres_changes",
              { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${session.user.id}` },
              () => {
                syncSupabaseSession(null, { force: true });
              }
            )
            .subscribe();
        }
        return;
      }

      if (event === "SIGNED_OUT") {
        if (userChannel) {
          supabase.removeChannel(userChannel);
          userChannel = null;
        }
        // Read admin flag BEFORE caches are cleared so redirect is correct
        const wasPlatformAdmin = isPlatformAdmin();
        clearUser();
        clearAuthData();
        const redirectTo = wasPlatformAdmin ? ROUTES.SUPER_ADMIN_LOGIN : ROUTES.LOGIN;
        window.isLoggingOut = true;
        // Avoid full window reload if already on that page, otherwise use standard react-router flows (though onStateChange is global)
        if (window.location.pathname !== redirectTo) {
          window.location.href = redirectTo;
        }
      }
    });

    return () => {
      deferredAuthTasks.forEach((taskId) => window.clearTimeout(taskId));
      subscription.unsubscribe();
      if (userChannel) supabase.removeChannel(userChannel);
    };
  }, []);

  useEffect(() => {
    const preloadRoutes = () => {
      const criticalRoutes = [
        routePreloaders[0], // Login
        routePreloaders[1], // Dashboard
        routePreloaders[2], // Clients
      ];
      criticalRoutes.forEach((preload) => {
        preload().catch(() => {});
      });
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preloadRoutes);
      return () => window.cancelIdleCallback(idleId);
    }

    const timerId = window.setTimeout(preloadRoutes, 500);
    return () => window.clearTimeout(timerId);
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ScrollToTop />
        <Suspense
          fallback={
            <div className="premium-loader" style={{ height: "100vh", display: "grid", placeItems: "center", background: "var(--color-bg)", color: "var(--color-text)" }}>
              <div className="loader-content">
                <div className="spinner" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }}></div>
                <p>Loading your workspace...</p>
              </div>
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Navigate to={isPlatformAdmin() ? ROUTES.SUPER_ADMIN_DASHBOARD : ROUTES.DASHBOARD} replace />} />
            <Route path={ROUTES.LOGIN} element={<Login />} />
            {/* ── Super Admin dedicated entry point (no case/workspace context) ── */}
            <Route path={ROUTES.SUPER_ADMIN_LOGIN} element={<SuperAdminLogin />} />
            <Route
              path={ROUTES.DASHBOARD}
              element={
                <ProtectedRoute section="dashboard">
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.CLIENTS}
              element={
                <ProtectedRoute section="clients">
                  <Clients />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.CASES}
              element={
                <ProtectedRoute section="cases">
                  <Cases />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.CLIENT_DETAILS}
              element={
                <ProtectedRoute section="clients">
                  <ClientDetails />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.PAYMENTS}
              element={
                <ProtectedRoute section="payments">
                  <Payments />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.DOCUMENTS}
              element={
                <ProtectedRoute section="documents">
                  <Documents />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.HEARINGS}
              element={
                <ProtectedRoute section="hearings">
                  <Hearings />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.HEARING_DETAILS}
              element={
                <ProtectedRoute section="hearings">
                  <Hearings />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.TASKS}
              element={
                <ProtectedRoute section="tasks">
                  <Tasks />
                </ProtectedRoute>
              }
            />
            <Route path="/put-up-dates" element={<Navigate to={ROUTES.HEARINGS} replace />} />
            <Route
              path={ROUTES.CASE_DETAILS}
              element={
                <ProtectedRoute section="cases">
                  <CaseDetails />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.SETTINGS}
              element={
                <ProtectedRoute section="settings">
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.SUPER_ADMIN_DASHBOARD}
              element={
                <ProtectedRoute requirePlatformAdmin={true}>
                  <SuperAdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.SYSTEM_AUDIT}
              element={
                <ProtectedRoute requirePlatformAdmin={true}>
                  <SystemAuditLogs />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.TEAM}
              element={
                <ProtectedRoute section="team">
                  <TeamManagement />
                </ProtectedRoute>
              }
            />
            <Route path={ROUTES.RESET_PASSWORD} element={<ResetPassword />} />
            <Route path="*" element={<Navigate to={isPlatformAdmin() ? ROUTES.SUPER_ADMIN_DASHBOARD : ROUTES.DASHBOARD} replace />} />
          </Routes>
        </Suspense>
        <ExportModal />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;




