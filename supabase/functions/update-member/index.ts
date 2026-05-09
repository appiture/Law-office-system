import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import {
  assertOrganizationAdmin,
  checkRateLimit,
  getActorContext,
  recordAuditEvent,
} from "../_shared/auth.ts";
import { requireRole } from "../_shared/validation.ts";

Deno.serve(async (request: Request): Promise<Response> => {
  const options = handleOptions(request);
  if (options) return options;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const adminClient = createAdminClient();

  try {
    const actor = await getActorContext(request);
    assertOrganizationAdmin(actor);
    await checkRateLimit(actor.user.id, "update-member", actor.ipAddress, 20, 300);

    const organizationId = actor.profile?.organization_id as string;
    const body = await request.json().catch(() => ({}));
    const { targetUserId, role, status } = body;

    if (!targetUserId) throw new Error("targetUserId is required.");

    // 1. Verify target user belongs to the same organization
    const { data: targetUser, error: targetError } = await adminClient
      .from("users")
      .select("id, organization_id, email, role, status")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!targetUser) throw new Error("Target user not found.");
    if (targetUser.organization_id !== organizationId) {
      throw new Error("You can only manage members of your own organization.");
    }
    if (targetUser.id === actor.user.id) {
      throw new Error("You cannot modify your own account settings here.");
    }

    const updates: any = {};
    const appMetadata: any = {};

    if (role) {
      updates.role = requireRole(role, ["USER", "LAWYER", "STAFF", "ADMIN"]);
      appMetadata.role = updates.role;
    }
    if (status) {
      if (!["ACTIVE", "INACTIVE", "SUSPENDED", "INVITED"].includes(status)) {
        throw new Error("Invalid status.");
      }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return jsonResponse({ success: true, message: "No changes requested." });
    }

    // 2. Update public.users table
    const { error: updateDbError } = await adminClient
      .from("users")
      .update(updates)
      .eq("id", targetUserId);
    if (updateDbError) throw updateDbError;

    // 3. Update Supabase Auth app_metadata if role changed
    if (appMetadata.role) {
      const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(
        targetUserId,
        { app_metadata: appMetadata }
      );
      if (updateAuthError) {
        console.error("[update-member] Auth metadata update failed:", updateAuthError);
        // We don't throw here to avoid desync if DB succeeded, but we log it.
      }
    }

    await recordAuditEvent({
      organizationId,
      actorId: actor.user.id,
      actorEmail: actor.profile?.email || actor.user.email || "",
      action: "USER_UPDATED",
      targetType: "user",
      targetId: targetUserId,
      targetEmail: targetUser.email,
      severity: "INFO",
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { updates },
    });

    return jsonResponse({
      success: true,
      message: "Member updated successfully.",
      userId: targetUserId,
      updates,
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});
