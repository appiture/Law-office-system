/**
 * admin.js
 *
 * Lightweight admin utilities that work alongside auth.js.
 * All reads are synchronous from the session cache.
 * The async `checkAdminStatus()` enriches the cache once per session.
 */

import { supabase } from "./supabaseClient";
import { getUserRole } from "./authService";

/**
 * Extracts a human-readable error message from a Supabase functions.invoke() call.
 * The Supabase client sets error.message to a generic string for non-2xx responses;
 * the real reason lives in the parsed response body.
 */
async function fnError(error, data) {
  // data may already contain the parsed body (Supabase JS v2 returns it on errors)
  if (data?.error) return new Error(data.error);
  // Try to extract from the raw response object attached to the error
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return new Error(body.error);
    if (body?.message) return new Error(body.message);
  } catch { /* ignore parse errors */ }
  return new Error(error?.message || "Edge function call failed.");
}

const ADMIN_CACHE_KEY = "lawoffice.adminStatus";

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

const readAdminCache = () => {
  try {
    return JSON.parse(sessionStorage.getItem(ADMIN_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
};

const writeAdminCache = (value) => {
  sessionStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify(value));
};

export const clearAdminCache = () => {
  sessionStorage.removeItem(ADMIN_CACHE_KEY);
};

/* ------------------------------------------------------------------ */
/*  Synchronous reads (safe for render, returns last-known value)      */
/* ------------------------------------------------------------------ */

/** True if this user is a platform-level super admin. */
export const isPlatformAdmin = () => Boolean(readAdminCache().isPlatformAdmin);

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
  if (!supabase) {
    writeAdminCache({ isPlatformAdmin: false });
    return { isPlatformAdmin: false };
  }

  // Return cached value unless forced
  const cached = readAdminCache();
  if (!force && cached.checkedAt && Date.now() - cached.checkedAt < 5 * 60 * 1000) {
    return { isPlatformAdmin: Boolean(cached.isPlatformAdmin) };
  }

  if (_pendingCheckPromise && !force) return _pendingCheckPromise;

  _pendingCheckPromise = (async () => {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("is_platform_admin");
      if (!rpcError) {
        const result = { isPlatformAdmin: Boolean(rpcData) };
        writeAdminCache({ ...result, checkedAt: Date.now() });
        return result;
      }

      const { data, error } = await supabase
        .from("platform_admins")
        .select("id")
        .maybeSingle();

      const result = { isPlatformAdmin: !error && Boolean(data) };
      writeAdminCache({ ...result, checkedAt: Date.now() });
      return result;
    } catch {
      writeAdminCache({ isPlatformAdmin: false, checkedAt: Date.now() });
      return { isPlatformAdmin: false };
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
  if (error) throw new Error(error.message);
  return data || [];
};

export const adminReviewOrganization = async (orgId, action, adminEmail = null) => {
  const { data, error } = await supabase.rpc("admin_review_organization", {
    target_org_id: orgId,
    action,
    assigned_admin_email: adminEmail,
  });
  if (error) throw new Error(error.message);
  return data;
};

export const adminListAllUsers = async (filterOrgId = null, filterStatus = null) => {
  const { data, error } = await supabase.rpc("admin_list_all_users", {
    filter_org_id: filterOrgId,
    filter_status: filterStatus === "ALL" ? null : filterStatus,
  });
  if (error) throw new Error(error.message);
  return data || [];
};

export const adminListPlatformAdmins = async () => {
  const { data, error } = await supabase.rpc("admin_list_platform_admins");
  if (error) throw new Error(error.message);
  return data || [];
};

export const adminAddPlatformAdmin = async (email) => {
  const { data, error } = await supabase.rpc("admin_add_platform_admin", {
    target_email: email,
  });
  if (error) throw new Error(error.message);
  return data;
};

export const adminRemovePlatformAdmin = async (email) => {
  const { data, error } = await supabase.rpc("admin_remove_platform_admin", {
    target_email: email,
  });
  if (error) throw new Error(error.message);
  return data;
};

export const adminUpdateUser = async (userId, newRole = null, newStatus = null) => {
  const { data, error } = await supabase.rpc("admin_update_user", {
    target_user_id: userId,
    new_role: newRole,
    new_status: newStatus,
  });
  if (error) throw new Error(error.message);
  return data;
};

export const adminGetActivityLog = async (limit = 100) => {
  const { data, error } = await supabase.rpc("admin_get_activity_log", {
    limit_rows: limit,
  });
  if (error) throw new Error(error.message);
  return data || [];
};

export const listOrganizationMembers = async () => {
  const { data, error } = await supabase.rpc("list_organization_members");
  if (error) throw new Error(error.message);
  return data || [];
};

export const inviteUserToOrganization = async (email, role) => {
  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: {
      email: email.trim().toLowerCase(),
      role,
    },
  });
  if (error) throw await fnError(error, data);
  if (data?.error) throw new Error(data.error);
  return data;
};

export const updateOrganizationMember = async (userId, newRole = null, newStatus = null) => {
  const { data, error } = await supabase.functions.invoke("update-member", {
    body: {
      targetUserId: userId,
      role: newRole,
      status: newStatus,
    },
  });
  if (error) throw await fnError(error, data);
  if (data?.error) throw new Error(data.error);
  return data;
};

export const removeOrganizationMember = async (userId) => {
  const { data, error } = await supabase.rpc("remove_organization_member", {
    target_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return data;
};

/* ------------------------------------------------------------------ */
/*  Super-admin: create organization + admin user                       */
/* ------------------------------------------------------------------ */

/**
 * Creates a new organization and admin user through the invite-admin Edge Function.
 * Temporary credentials are sent by server-side email and are never returned to the browser.
 */
export const adminCreateOrganization = async ({
  orgName,
  adminEmail,
  orgPlan = "STANDARD",
  sendInviteEmail = true,
}) => {
  const { data, error } = await supabase.functions.invoke("invite-admin", {
    body: {
      organizationName: orgName.trim(),
      adminEmail: adminEmail.trim().toLowerCase(),
      plan: orgPlan,
      sendInviteEmail,
    },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
};

/* ------------------------------------------------------------------ */
/*  Password-reset helpers (for first-login forced reset flow)          */
/* ------------------------------------------------------------------ */

/** Returns true if the current user must reset their password. */
export const checkMustResetPassword = async () => {
  try {
    const { data, error } = await supabase.functions.invoke("auth-utils");
    if (error) return false;
    return Boolean(data?.mustResetPassword);
  } catch {
    return false;
  }
};

/** Clears the must_reset_password flag after a successful reset. */
export const completePasswordReset = async () => {
  const { error } = await supabase.rpc("complete_password_reset");
  if (error) throw new Error(error.message);
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
  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: {
      email: email.trim().toLowerCase(),
      role,
    },
  });
  if (error) throw await fnError(error, data);
  if (data?.error) throw new Error(data.error);
  return data;
};

/* ------------------------------------------------------------------ */
/*  Monthly report — sends XLSX to admin email via Edge Function        */
/* ------------------------------------------------------------------ */

/**
 * Triggers the send-report Edge Function which compiles all org data
 * into an Excel file and emails it to the calling admin's own email.
 * Rate limited: 3 requests per 5 minutes.
 */
export const sendMonthlyReport = async (reportMonth = null, download = false) => {
  const month = reportMonth || new Date().toISOString().slice(0, 7);

  if (download) {
    const { data, error } = await supabase.functions.invoke("send-report", {
      body: { reportMonth: month, download: true },
    });

    if (error) {
      const err = await fnError(error, data);
      throw err;
    }

    // In Supabase JS v2, if the response is binary, 'data' is already a Blob
    if (!(data instanceof Blob)) {
      throw new Error("Failed to download report: Response was not a binary file.");
    }

    return { blob: data, fileName: `Report_${month}.xlsx` };
  }

  const { data, error } = await supabase.functions.invoke("send-report", {
    body: { reportMonth: month },
  });

  if (error) throw await fnError(error, data);
  if (data?.error) throw new Error(data.error);
  return data;
};

export const adminDeleteOrganization = async (orgId) => {
  const { data, error } = await supabase.functions.invoke("admin-delete", {
    body: {
      targetType: "organization",
      organizationId: orgId,
    },
  });
  if (error) throw await fnError(error, data);
  if (data?.error) throw new Error(data.error);
  return data;
};

export const adminDeleteUser = async (userId) => {
  const { data, error } = await supabase.functions.invoke("admin-delete", {
    body: {
      targetType: "user",
      userId,
    },
  });
  if (error) throw await fnError(error, data);
  if (data?.error) throw new Error(data.error);
  return data;
};




