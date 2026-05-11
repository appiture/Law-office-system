
import { getWorkspaceContext, resetWorkspaceContextCache } from "../repositories/supabaseRepository";
import { supabase } from "./supabaseClient";
// import { clearAllActionLocks } from "../lib/rateLimiter"; // Removed per Item 19

const SESSION_CACHE_KEY = "lawoffice.session";
const REMEMBERED_EMAIL_KEY = "lawoffice.rememberedEmail";
const REMEMBERED_ORGANIZATION_KEY = "lawoffice.organization";
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
        // Source of truth for role/org comes from the auth-utils edge function
        // which reads the DB directly, bypassing stale JWT claims.
        const { data: authUtils, error: authUtilsError } = await supabase.functions.invoke("auth-utils");
        
        if (!authUtilsError && authUtils?.authenticated) {
          workspace = {
            userId: authUtils.userId,
            email: authUtils.email,
            role: authUtils.role,
            organizationId: authUtils.organizationId,
            canAccessWorkspace: Boolean(authUtils.organizationId),
            mustResetPassword: Boolean(authUtils.mustResetPassword),
            // We still want the rich profile data from the RPC if available
            ...(await getWorkspaceContext({ force: shouldRefreshWorkspace, providedUser: session?.user }).catch(() => ({})))
          };
          // Override with auth-utils truth
          workspace.role = authUtils.role || workspace.role;
          workspace.organizationId = authUtils.organizationId || workspace.organizationId;
        } else {
          workspace = await withTimeout(
            getWorkspaceContext({ force: shouldRefreshWorkspace, providedUser: session?.user }),
            WORKSPACE_TIMEOUT_MS,
            "Supabase signed you in, but the workspace profile check timed out. Confirm public.users and public.organizations are readable and active."
          );
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
          localStorage.getItem(REMEMBERED_ORGANIZATION_KEY) ||
          "Law Office",
        organizationLogoUrl: workspace?.organizationLogoUrl || previousCache.organizationLogoUrl || "",
        organizationLogoPath: workspace?.organizationLogoPath || previousCache.organizationLogoPath || "",
        mustResetPassword: hasWorkspaceResult
          ? Boolean(workspace.mustResetPassword)
          : Boolean(previousCache.mustResetPassword || false),
        canAccessWorkspace: hasWorkspaceResult ? Boolean(workspace.canAccessWorkspace) : (previousCache.canAccessWorkspace || false),
        workspaceAccessMessage: workspace?.workspaceAccessMessage || workspaceAccessMessage || previousCache.workspaceAccessMessage || "",
      };

      // Detect organization change and flush data caches
      if (previousCache.organizationId && previousCache.organizationId !== cached.organizationId) {
        resetWorkspaceContextCache();
        // clearAllActionLocks();
      }

      writeSessionCache(cached);
      window.dispatchEvent(new Event("sessionUpdated"));
      return cached;
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
  localStorage.getItem(REMEMBERED_ORGANIZATION_KEY) ||
  "Law Office";

export const getOrganizationLogoUrl = () => readSessionCache().organizationLogoUrl || "";

export const canAccessWorkspace = () => Boolean(readSessionCache().canAccessWorkspace);

export const getWorkspaceAccessMessage = () => readSessionCache().workspaceAccessMessage || "";

export const mustResetPassword = () => Boolean(readSessionCache().mustResetPassword);

/**
 * Explicitly check the auth state via the auth-utils edge function.
 * Used during login flow to determine if a password reset is required.
 */
export const checkAuthState = async (session) => {
  if (!session?.access_token) return { mustReset: false };
  
  try {
    const { data, error } = await supabase.functions.invoke("auth-utils");
    if (error) throw error;
    
    if (data?.mustResetPassword) {
      return { mustReset: true, ...data };
    }
    return { mustReset: false, ...data };
  } catch (err) {
    console.error("checkAuthState failed:", err);
    return { mustReset: false };
  }
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
  window.location.href = "/login";
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

export const getRememberedOrganization = () => localStorage.getItem(REMEMBERED_ORGANIZATION_KEY) || "";

export const setRememberedEmail = (email, enabled) => {
  if (!enabled) {
    localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    return;
  }
  localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
};

export const setRememberedOrganization = (organization) => {
  const value = String(organization || "").trim();
  if (!value) {
    localStorage.removeItem(REMEMBERED_ORGANIZATION_KEY);
    return;
  }
  localStorage.setItem(REMEMBERED_ORGANIZATION_KEY, value);
};

export const isRememberEmailEnabled = () => Boolean(localStorage.getItem(REMEMBERED_EMAIL_KEY));




