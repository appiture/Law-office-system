/**
 * admin.js
 *
 * Lightweight admin utilities that work alongside auth.js.
 * All reads are synchronous from the session cache.
 * The async `checkAdminStatus()` enriches the cache once per session.
 */

import { supabase } from "./supabaseClient";
import { getUserRole, getUserId } from "./authService";
import { getCache, setCache } from "../lib/cache";
import { EXPORT_FORMATS } from "../constants/exportFormats";
import { successResponse, errorResponse } from "../utils/apiResponse";

/**
 * Extracts a human-readable error message from a Supabase functions.invoke() call.
 */
async function fnError(error, data) {
  if (data?.error) return new Error(data.error);
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return new Error(body.error);
    if (body?.message) return new Error(body.message);
  } catch { /* ignore parse errors */ }
  return new Error(error?.message || "Edge function call failed.");
}

const ADMIN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/* ------------------------------------------------------------------ */
/*  Synchronous reads (safe for render, returns last-known value)      */
/* ------------------------------------------------------------------ */

/** True if this user is a platform-level super admin. */
export const isPlatformAdmin = () => {
  const userId = getUserId();
  if (!userId) return false;
  const cached = getCache(`adminStatus:${userId}`);
  return cached === true;
};

/** True if this user is an org-level ADMIN (from workspace role). */
export const isOrgAdmin = () => getUserRole() === "ADMIN";

/** True if this user has any elevated privileges. */
export const hasAdminAccess = () => isPlatformAdmin() || isOrgAdmin();

/* ------------------------------------------------------------------ */
/*  Async: fetch platform-admin status from Supabase                   */
/* ------------------------------------------------------------------ */

let _pendingCheckPromise = null;

/**
 * Fetches whether the current user is a platform admin from Supabase.
 * Dedupes concurrent calls. Returns { isPlatformAdmin: boolean }.
 */
export const checkAdminStatus = async ({ force = false } = {}) => {
  const userId = getUserId();
  if (!userId || !supabase) {
    return errorResponse("User ID not found");
  }

  const cacheKey = `adminStatus:${userId}`;
  const cached = getCache(cacheKey);

  if (!force && cached !== null && cached !== undefined) {
    return successResponse({ isPlatformAdmin: Boolean(cached) });
  }

  if (_pendingCheckPromise && !force) return _pendingCheckPromise;

  _pendingCheckPromise = (async () => {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("is_platform_admin");
      if (!rpcError) {
        const isAdmin = Boolean(rpcData);
        setCache(cacheKey, isAdmin, ADMIN_CACHE_TTL);
        return successResponse({ isPlatformAdmin: isAdmin });
      }

      const { data, error } = await supabase
        .from("platform_admins")
        .select("id")
        .maybeSingle();

      const isAdmin = Boolean(!error && data);
      setCache(cacheKey, isAdmin, ADMIN_CACHE_TTL);
      return successResponse({ isPlatformAdmin: isAdmin });
    } catch (err) {
      console.warn("Failed to verify admin status:", err);
      return errorResponse(err.message || "Failed to verify admin status");
    } finally {
      _pendingCheckPromise = null;
    }
  })();

  return _pendingCheckPromise;
};

/* ------------------------------------------------------------------ */
/*  Supabase RPC wrappers for admin operations                         */
/* ------------------------------------------------------------------ */

export const adminListOrganizations = async (filterStatus = null) => {
  const { data, error } = await supabase.rpc("admin_list_organizations", {
    filter_status: filterStatus === "ALL" ? null : filterStatus,
  });
  if (error) return errorResponse(error.message);
  return successResponse(data || []);
};

export const adminReviewOrganization = async (orgId, action, adminEmail = null) => {
  const { data, error } = await supabase.rpc("admin_review_organization", {
    target_org_id: orgId,
    action,
    assigned_admin_email: adminEmail,
  });
  if (error) return errorResponse(error.message);
  return successResponse(data, `${action} completed successfully`);
};

export const adminUpdateOrganization = async (orgId, updates) => {
  const { data, error } = await supabase
    .from("organizations")
    .update(updates)
    .eq("id", orgId);
  if (error) return errorResponse(error.message);
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.rpc("log_observability_event", {
      payload: {
        message: "Updated organization subscription",
        category: "admin",
        detail: {
          orgId,
          userEmail: user?.email,
          updates
        },
        timestamp: new Date().toISOString(),
        isCritical: false,
        url: window.location.href,
        userAgent: navigator.userAgent
      }
    });
  } catch (err) {
    console.warn("Audit logging failed:", err);
  }

  return successResponse(data, "Organization updated successfully");
};

export const adminListAllUsers = async (filterOrgId = null, filterStatus = null) => {
  const { data, error } = await supabase.rpc("admin_list_all_users", {
    filter_org_id: filterOrgId,
    filter_status: filterStatus === "ALL" ? null : filterStatus,
  });
  if (error) return errorResponse(error.message);
  return successResponse(data || []);
};

export const adminListPlatformAdmins = async () => {
  const { data, error } = await supabase.rpc("admin_list_platform_admins");
  if (error) return errorResponse(error.message);
  return successResponse(data || []);
};

export const adminAddPlatformAdmin = async (email) => {
  const { data, error } = await supabase.rpc("admin_add_platform_admin", {
    target_email: email,
  });
  if (error) return errorResponse(error.message);
  return successResponse(data, "Platform admin added successfully");
};

export const adminRemovePlatformAdmin = async (email) => {
  const { data, error } = await supabase.rpc("admin_remove_platform_admin", {
    target_email: email,
  });
  if (error) return errorResponse(error.message);
  return successResponse(data, "Platform admin removed successfully");
};

export const adminUpdateUser = async (userId, newRole = null, newStatus = null) => {
  const { data, error } = await supabase.rpc("admin_update_user", {
    target_user_id: userId,
    new_role: newRole,
    new_status: newStatus,
  });
  if (error) return errorResponse(error.message);
  return successResponse(data, "User updated successfully");
};

export const adminGetActivityLog = async (limit = 100) => {
  const { data, error } = await supabase.rpc("admin_get_activity_log", {
    row_limit: limit,
  });
  if (error) return errorResponse(error.message);
  return successResponse(data || []);
};

export const listOrganizationMembers = async () => {
  const { data, error } = await supabase.rpc("list_organization_members");
  if (error) return errorResponse(error.message);
  return successResponse(data || []);
};

export const inviteUserToOrganization = async (email, role) => {
  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: {
      email: email.trim().toLowerCase(),
      role,
    },
  });
  if (error) return errorResponse((await fnError(error, data)).message);
  if (data?.error) return errorResponse(data.error);
  return successResponse(data, "User invited successfully");
};

export const updateOrganizationMember = async (userId, newRole = null, newStatus = null) => {
  const { data, error } = await supabase.functions.invoke("update-member", {
    body: {
      targetUserId: userId,
      role: newRole,
      status: newStatus,
    },
  });
  if (error) return errorResponse((await fnError(error, data)).message);
  if (data?.error) return errorResponse(data.error);
  return successResponse(data, "Member updated successfully");
};

export const removeOrganizationMember = async (userId) => {
  const { data, error } = await supabase.rpc("remove_organization_member", {
    target_user_id: userId,
  });
  if (error) return errorResponse(error.message);
  return successResponse(data, "Member removed successfully");
};

/* ------------------------------------------------------------------ */
/*  Super-admin: create organization + admin user                       */
/* ------------------------------------------------------------------ */

/**
 * Creates a new organization and admin user through the invite-admin Edge Function.
 * Temporary credentials are sent by server-side email and are never returned to the browser.
 */
export const adminCreateOrganization = async ({ orgName, adminEmail, orgPlan = "STANDARD", sendInviteEmail = true }) => {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "admin_create_organization",
    { org_name: orgName.trim(), admin_email: adminEmail.trim().toLowerCase(), org_plan: orgPlan }
  );
  if (!rpcError) return successResponse(rpcData, "Organization and admin created successfully");

  if (rpcError.code !== "42883" && rpcError.code !== "PGRST202") {
    return errorResponse(rpcError.message);
  }
  const { data, error } = await supabase.functions.invoke("invite-admin", {
    body: { organizationName: orgName.trim(), adminEmail: adminEmail.trim().toLowerCase(), plan: orgPlan, sendInviteEmail },
  });
  if (error) return errorResponse(error.message);
  if (data?.error) return errorResponse(data.error);
  return successResponse(data, "Organization and admin created successfully");
};

/* ------------------------------------------------------------------ */
/*  Password-reset helpers (for first-login forced reset flow)          */
/* ------------------------------------------------------------------ */

/** Returns true if the current user must reset their password. */
export const checkMustResetPassword = async () => {
  try {
    const { data, error } = await supabase.functions.invoke("auth-utils");
    if (error) return errorResponse(error.message);
    return successResponse(Boolean(data?.mustResetPassword));
  } catch (err) {
    return errorResponse(err.message || "Failed to check password reset status");
  }
};

/** Clears the must_reset_password flag after a successful reset. */
export const completePasswordReset = async () => {
  const { error } = await supabase.rpc("complete_password_reset");
  if (error) return errorResponse(error.message);
  return successResponse(true, "Password reset successfully.");
};

/* ------------------------------------------------------------------ */
/*  Org admin: invite team member with auto-created auth account        */
/* ------------------------------------------------------------------ */

/**
 * Creates an auth user + public.users row for a user-level member
 * through the invite-user Edge Function.
 * Temporary credentials are sent by server-side email and are never returned to the browser.
 */
export const adminInviteTeamMember = async ({ email, role }) => {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "admin_invite_team_member",
    { invite_email: email.trim().toLowerCase(), invite_role: role }
  );
  if (!rpcError) return successResponse(rpcData, "Team member invited successfully");

  if (rpcError.code !== "42883" && rpcError.code !== "PGRST202") {
    return errorResponse(rpcError.message);
  }
  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: { email: email.trim().toLowerCase(), role },
  });
  if (error) return errorResponse((await fnError(error, data)).message);
  if (data?.error) return errorResponse(data.error);
  return successResponse(data, "Team member invited successfully");
};

/* ------------------------------------------------------------------ */
/*  Monthly report — sends XLSX to admin email via Edge Function        */
/* ------------------------------------------------------------------ */

/**
 * Triggers the export-report Edge Function which compiles all org data
 * into an Excel file and emails it to the calling admin's own email.
 */
export const sendMonthlyReport = async (options = {}) => {
  // Handle both (month) and (optionsObject) signatures
  let reportMonth, type, format, filters, sections;
  
  if (typeof options === "string" || options === null) {
    reportMonth = options;
    type = "platform";
    format = EXPORT_FORMATS.XLSX;
  } else {
    ({ 
      reportMonth = null, 
      type = "platform", 
      format = EXPORT_FORMATS.XLSX,
      filters = {},
      sections = []
    } = options);
  }

  const month = reportMonth || new Date().toISOString().slice(0, 7);
  const start = `${month}-01`;
  const lastDay = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0);
  const end = lastDay.toISOString().slice(0, 10);

  const { data, error } = await supabase.functions.invoke("export-report", {
    body: { 
      type, 
      format, 
      dateRange: { start, end },
      filters,
      sections
    },
  });

  if (error) return errorResponse((await fnError(error, data)).message);

  return successResponse(data, "Report generated successfully.");
};

export const adminDeleteOrganization = async (orgId) => {
  const { data, error } = await supabase.functions.invoke("admin-delete", {
    body: {
      targetType: "organization",
      organizationId: orgId,
    },
  });
  if (error) return errorResponse((await fnError(error, data)).message);
  if (data?.error) return errorResponse(data.error);
  return successResponse(data, "Organization deleted successfully");
};

export const adminDeleteUser = async (userId) => {
  const { data, error } = await supabase.functions.invoke("admin-delete", {
    body: {
      targetType: "user",
      userId,
    },
  });
  if (error) return errorResponse((await fnError(error, data)).message);
  if (data?.error) return errorResponse(data.error);
  return successResponse(data, "User deleted successfully");
};




