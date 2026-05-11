import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { supabase } from "./services/supabaseClient";
import { clearAuthData, syncSupabaseSession } from "./services/authService";
import { isPlatformAdmin } from "./services/adminService";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import "./App.css";
import { setUser, clearUser } from "./store/sessionStore";

const routePreloaders = [
  () => import("./pages/Login"),
  () => import("./pages/Dashboard"),
  () => import("./pages/Clients"),
  () => import("./pages/Cases"),
  () => import("./pages/Payments"),
  () => import("./pages/Documents"),
  () => import("./pages/FollowUps"),
  () => import("./pages/CaseDetails"),
  () => import("./pages/Settings"),
  () => import("./pages/SuperAdminDashboard"),
  () => import("./pages/TeamManagement"),
  () => import("./pages/ResetPassword"),
  () => import("./pages/SuperAdminLogin"),
];

// Code splitting, with idle preloading so first section visits feel immediate.
const Login = lazy(routePreloaders[0]);
const Dashboard = lazy(routePreloaders[1]);
const Clients = lazy(routePreloaders[2]);
const Cases = lazy(routePreloaders[3]);
const Payments = lazy(routePreloaders[4]);
const Documents = lazy(routePreloaders[5]);
const FollowUps = lazy(routePreloaders[6]);
const CaseDetails = lazy(routePreloaders[7]);
const Settings = lazy(routePreloaders[8]);
const SuperAdminDashboard = lazy(routePreloaders[9]);
const TeamManagement = lazy(routePreloaders[10]);
const ResetPassword = lazy(routePreloaders[11]);
const SuperAdminLogin = lazy(routePreloaders[12]);

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

    // Keep this callback synchronous. Supabase holds an auth lock while
    // emitting events, so API calls are deferred until after the lock exits.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
        deferAuthTask(() => syncSupabaseSession(session));
        return;
      }

      if (event === "SIGNED_OUT") {
        // Read admin flag BEFORE caches are cleared so redirect is correct
        const wasPlatformAdmin = isPlatformAdmin();
        clearUser();
        clearAuthData();
        const redirectTo = wasPlatformAdmin ? "/super-admin-login" : "/login";
        if (window.location.pathname !== redirectTo) {
          window.location.href = redirectTo;
        }
      }
    });

    return () => {
      deferredAuthTasks.forEach((taskId) => window.clearTimeout(taskId));
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const preloadRoutes = () => {
      routePreloaders.forEach((preload) => {
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
      <BrowserRouter>
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
            <Route path="/" element={<Navigate to={isPlatformAdmin() ? "/platform-admin" : "/dashboard"} replace />} />
            <Route path="/login" element={<Login />} />
            {/* ── Super Admin dedicated entry point (no case/workspace context) ── */}
            <Route path="/super-admin-login" element={<SuperAdminLogin />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute section="dashboard">
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/clients"
              element={
                <ProtectedRoute section="clients">
                  <Clients />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cases"
              element={
                <ProtectedRoute section="cases">
                  <Cases />
                </ProtectedRoute>
              }
            />
            <Route
              path="/clients/:clientId"
              element={
                <ProtectedRoute section="clients">
                  <CaseDetails />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payments"
              element={
                <ProtectedRoute section="payments">
                  <Payments />
                </ProtectedRoute>
              }
            />
            <Route
              path="/documents"
              element={
                <ProtectedRoute section="documents">
                  <Documents />
                </ProtectedRoute>
              }
            />
            <Route
              path="/followups"
              element={
                <ProtectedRoute section="followups">
                  <FollowUps />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tasks"
              element={
                <ProtectedRoute section="followups">
                  <FollowUps />
                </ProtectedRoute>
              }
            />
            <Route
              path="/put-up-dates"
              element={
                <ProtectedRoute section="followups">
                  <FollowUps />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cases/:caseId"
              element={
                <ProtectedRoute section="cases">
                  <CaseDetails />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute section="settings">
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/platform-admin"
              element={
                <ProtectedRoute>
                  <SuperAdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team"
              element={
                <ProtectedRoute section="team">
                  <TeamManagement />
                </ProtectedRoute>
              }
            />
            <Route path="/reset-password" element={<ProtectedRoute><ResetPassword /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to={isPlatformAdmin() ? "/platform-admin" : "/dashboard"} replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;




