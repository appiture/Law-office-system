import { ROUTES } from "../constants/routes";
import { getWorkspaceContext, resetWorkspaceContextCache } from "../repositories/supabaseRepository";
import { supabase } from "./supabaseClient";
import { successResponse, errorResponse } from "../utils/apiResponse";
// import { clearAllActionLocks } from "../lib/rateLimiter"; // Removed per Item 19

const SESSION_CACHE_KEY = "lawoffice.session";
const REMEMBERED_EMAIL_KEY = "lawoffice.rememberedEmail";
const SESSION_TIMEOUT_MS = 30000;
const WORKSPACE_TIMEOUT_MS = 60000;

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

const readSessionCache = () => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
};

const writeSessionCache = (value) => {
  localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(value));
};

const clearSessionCache = () => {
  localStorage.removeItem(SESSION_CACHE_KEY);
};

const normalizeRole = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || "LAWYER";
};

const withTimeout = (promise, timeoutMs, message) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([
    promise.then((res) => {
      window.clearTimeout(timeoutId);
      return res;
    }),
    timeoutPromise,
  ]);
};

/* ------------------------------------------------------------------ */
/*  Session synchronization                                            */
/* ------------------------------------------------------------------ */

let _syncPromise = null;

/**
 * Synchronizes the Supabase auth session and workspace context into
 * a local cache object for fast synchronous reads by UI components.
 *
 * This is the ONLY function that writes identity data to localStorage.
 * All identity is derived from supabase.auth.getSession() + the
 * workspace context query (users → organizations join).
 */
export const syncSupabaseSession = async (providedSession = null, options = {}) => {
  if (!supabase) {
    clearSessionCache();
    return {};
  }

  const force = options.force || false;

  // Dedupe concurrent sync requests (unless forcing)
  if (_syncPromise && !providedSession && !force) return _syncPromise;

  _syncPromise = (async () => {
    try {
      let session = providedSession;

      if (!session) {
        // We use the internal Supabase getSession which handles its own timeouts.
        // Artificial timeouts here can cause deadlocks during initialization.
        const { data } = await supabase.auth.getSession();
        session = data?.session || null;
      }

      if (!session) {
        clearSessionCache();
        return {};
      }

      // Detect user change and flush all caches to prevent cross-user leakage
      const previousCache = readSessionCache();
      if (previousCache.userId && previousCache.userId !== session.user?.id) {
        resetWorkspaceContextCache();
        // clearAllActionLocks();
        clearSessionCache();
      }

      let workspace = null;
      let workspaceAccessMessage = "";
      const shouldRefreshWorkspace =
        force ||
        Boolean(providedSession) ||
        previousCache.userId !== session.user?.id ||
        !previousCache.canAccessWorkspace;

      try {
        // Source of truth for role/org comes from auth-utils, which reads the
        // DB directly. Branding/profile details still come from the workspace
        // RPC because it signs private storage paths for logos and avatars.
        const { data: authUtils, error: authUtilsError } = await supabase.functions.invoke("auth-utils");

        const loadWorkspaceDetails = async () => withTimeout(
          getWorkspaceContext({ force: shouldRefreshWorkspace, providedUser: session?.user }),
          WORKSPACE_TIMEOUT_MS,
          "Supabase signed you in, but the workspace profile check timed out. Confirm public.users and public.organizations are readable and active."
        );

        if (!authUtilsError && authUtils?.authenticated) {
          let workspaceDetails = null;
          if (authUtils.organizationId || !authUtils.isPlatformAdmin) {
            try {
              workspaceDetails = await loadWorkspaceDetails();
            } catch (detailsError) {
              workspaceAccessMessage =
                detailsError?.message || "Supabase signed you in, but the workspace profile could not be loaded.";
            }
          }

          workspace = {
            ...(workspaceDetails || {}),
            userId: authUtils.userId || workspaceDetails?.userId,
            email: authUtils.email || workspaceDetails?.email,
            fullName: workspaceDetails?.fullName || authUtils.fullName || "",
            avatarUrl: workspaceDetails?.avatarUrl || authUtils.avatarUrl || "",
            avatarPath: workspaceDetails?.avatarPath || authUtils.avatarPath || "",
            role: authUtils.role || workspaceDetails?.role,
            organizationId: authUtils.organizationId || workspaceDetails?.organizationId,
            organizationName: workspaceDetails?.organizationName || authUtils.organizationName || "Law Office",
            organizationLogoUrl: workspaceDetails?.organizationLogoUrl || authUtils.organizationLogoUrl || "",
            organizationLogoPath: workspaceDetails?.organizationLogoPath || authUtils.organizationLogoPath || "",
            organizationAddress: workspaceDetails?.organizationAddress || authUtils.organizationAddress || "",
            organizationPhone: workspaceDetails?.organizationPhone || authUtils.organizationPhone || "",
            organizationEmail: workspaceDetails?.organizationEmail || authUtils.organizationEmail || "",
            organizationWebsite: workspaceDetails?.organizationWebsite || authUtils.organizationWebsite || "",
            canAccessWorkspace: Boolean(authUtils.organizationId || workspaceDetails?.organizationId),
            mustResetPassword: Boolean(authUtils.mustResetPassword),
            isDemoWorkspace: Boolean(authUtils.isDemo),
            demoExpiresAt: authUtils.demoExpiresAt || workspaceDetails?.demoExpiresAt || null,
            subscriptionStatus: authUtils.subscriptionStatus || workspaceDetails?.subscriptionStatus || "ACTIVE",
          };
        } else {
          workspace = await loadWorkspaceDetails();
        }
      } catch (error) {
        workspaceAccessMessage =
          error?.message || "Supabase signed you in, but the workspace profile could not be loaded.";
      }

      const hasWorkspaceResult = Boolean(workspace);
      const cached = {
        authenticated: true,
        userId: workspace?.userId || session.user?.id || previousCache.userId || "",
        email: workspace?.email || session.user?.email || previousCache.email || "",
        fullName: workspace?.fullName || previousCache.fullName || "",
        avatarUrl: workspace?.avatarUrl || previousCache.avatarUrl || "",
        avatarPath: workspace?.avatarPath || previousCache.avatarPath || "",
        role: normalizeRole(workspace?.role || session.user?.user_metadata?.role || previousCache.role),
        organizationId: workspace?.organizationId || previousCache.organizationId || "",
        organizationName:
          workspace?.organizationName ||
          session.user?.user_metadata?.organization ||
          previousCache.organizationName ||
          "Law Office",
        organizationLogoUrl: workspace?.organizationLogoUrl || previousCache.organizationLogoUrl || "",
        organizationLogoPath: workspace?.organizationLogoPath || previousCache.organizationLogoPath || "",
        organizationAddress: workspace?.organizationAddress || previousCache.organizationAddress || "",
        organizationPhone: workspace?.organizationPhone || previousCache.organizationPhone || "",
        organizationEmail: workspace?.organizationEmail || previousCache.organizationEmail || "",
        organizationWebsite: workspace?.organizationWebsite || previousCache.organizationWebsite || "",
        mustResetPassword: hasWorkspaceResult
          ? Boolean(workspace.mustResetPassword)
          : Boolean(previousCache.mustResetPassword || false),
        canAccessWorkspace: hasWorkspaceResult ? Boolean(workspace.canAccessWorkspace) : (previousCache.canAccessWorkspace || false),
        isDemo: hasWorkspaceResult ? Boolean(workspace.isDemoWorkspace) : (previousCache.isDemo || false),
        demoExpiresAt: workspace?.demoExpiresAt || previousCache.demoExpiresAt || null,
        subscriptionStatus: workspace?.subscriptionStatus || previousCache.subscriptionStatus || "ACTIVE",
        workspaceAccessMessage: workspace?.workspaceAccessMessage || workspaceAccessMessage || previousCache.workspaceAccessMessage || "",
      };

      // Detect organization change and flush data caches
      if (previousCache.organizationId && previousCache.organizationId !== cached.organizationId) {
        resetWorkspaceContextCache();
        // clearAllActionLocks();
      }

      writeSessionCache(cached);
      window.dispatchEvent(new Event("sessionUpdated"));
      return successResponse(cached);
    } catch (err) {
      return errorResponse(err.message);
    } finally {
      _syncPromise = null;
    }
  })();

  return _syncPromise;
};

/* ------------------------------------------------------------------ */
/*  Synchronous read helpers (for UI display only)                     */
/* ------------------------------------------------------------------ */

export const isAuthenticated = () => Boolean(readSessionCache().authenticated);

export const getUserEmail = () => readSessionCache().email || "";

export const getUserFullName = () => readSessionCache().fullName || "";

export const getUserAvatarUrl = () => readSessionCache().avatarUrl || "";

export const getUserId = () => readSessionCache().userId || "";

export const getUserRole = () => readSessionCache().role || "LAWYER";

export const getOrganizationId = () => readSessionCache().organizationId || "";

export const getOrganizationName = () =>
  readSessionCache().organizationName ||
  "Law Office";

export const getOrganizationLogoUrl = () => readSessionCache().organizationLogoUrl || "";
export const getOrganizationAddress = () => readSessionCache().organizationAddress || "";
export const getOrganizationPhone = () => readSessionCache().organizationPhone || "";
export const getOrganizationEmail = () => readSessionCache().organizationEmail || "";
export const getOrganizationWebsite = () => readSessionCache().organizationWebsite || "";

export const canAccessWorkspace = () => Boolean(readSessionCache().canAccessWorkspace);

export const getWorkspaceAccessMessage = () => readSessionCache().workspaceAccessMessage || "";

export const mustResetPassword = () => Boolean(readSessionCache().mustResetPassword);

export const isDemo = () => Boolean(readSessionCache().isDemo);

export const getDemoExpiresAt = () => readSessionCache().demoExpiresAt;

export const isDemoExpired = () => {
  if (!isDemo()) return false;
  const expiry = getDemoExpiresAt();
  if (!expiry) return false;
  return new Date(expiry) < new Date();
};



/* ------------------------------------------------------------------ */
/*  Logout                                                             */
/* ------------------------------------------------------------------ */

export const fullLogout = async () => {
  // Clear all application caches BEFORE signing out
  resetWorkspaceContextCache();
  // clearAllActionLocks();
  clearSessionCache();

  if (supabase) {
    await supabase.auth.signOut();
  }
  window.location.href = ROUTES.LOGIN;
};

export const clearAuthData = () => {
  resetWorkspaceContextCache();
  clearSessionCache();
  // clearAllActionLocks();
};

/* ------------------------------------------------------------------ */
/*  "Remember me" helpers (cosmetic — never used for auth decisions)    */
/* ------------------------------------------------------------------ */

export const getRememberedEmail = () => localStorage.getItem(REMEMBERED_EMAIL_KEY) || "";

export const setRememberedEmail = (email, enabled) => {
  if (!enabled) {
    localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    return;
  }
  localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
};




