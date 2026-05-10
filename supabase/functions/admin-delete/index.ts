import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import {
  assertPlatformAdmin,
  checkRateLimit,
  getActorContext,
  recordAuditEvent,
} from "../_shared/auth.ts";

const DOCUMENT_BUCKET = "case-documents";
const CLIENT_ASSET_BUCKET = "client-assets";

type DeleteRequest = {
  targetType?: string;
  organizationId?: string;
  userId?: string;
};

const requireUuid = (value: unknown, label: string) => {
  const text = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error(`${label} is required.`);
  }
  return text;
};

const uniquePaths = (values: unknown[]) => {
  const paths = new Set<string>();
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) paths.add(text);
  }
  return [...paths];
};

const removeStorageObjects = async (
  adminClient: ReturnType<typeof createAdminClient>,
  bucket: string,
  paths: string[],
) => {
  const cleanPaths = uniquePaths(paths);
  for (let index = 0; index < cleanPaths.length; index += 100) {
    const chunk = cleanPaths.slice(index, index + 100);
    const { error } = await adminClient.storage.from(bucket).remove(chunk);
    if (error) {
      console.warn(`[admin-delete] Failed to remove ${bucket} objects:`, error.message);
    }
  }
};

const deleteAuthUser = async (
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
) => {
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error && !/not found/i.test(error.message || "")) {
    throw error;
  }
};

const deleteOrganization = async (
  adminClient: ReturnType<typeof createAdminClient>,
  organizationId: string,
  actorId: string,
) => {
  const { data: organization, error: orgError } = await adminClient
    .from("organizations")
    .select("id,name")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError) throw orgError;
  if (!organization) throw new Error("Organization not found.");

  const { data: users, error: usersError } = await adminClient
    .from("users")
    .select("id,email")
    .eq("organization_id", organizationId);
  if (usersError) throw usersError;

  if ((users || []).some((user) => user.id === actorId)) {
    throw new Error("You cannot delete an organization that contains your own user account.");
  }

  const { data: documents, error: documentsError } = await adminClient
    .from("documents")
    .select("file_path")
    .eq("organization_id", organizationId);
  if (documentsError) throw documentsError;

  const { data: clients, error: clientsError } = await adminClient
    .from("clients")
    .select("photo_path,id_proof")
    .eq("organization_id", organizationId);
  if (clientsError) throw clientsError;

  await removeStorageObjects(
    adminClient,
    DOCUMENT_BUCKET,
    uniquePaths((documents || []).map((document) => document.file_path)),
  );

  await removeStorageObjects(
    adminClient,
    CLIENT_ASSET_BUCKET,
    uniquePaths((clients || []).flatMap((client) => [
      client.photo_path,
      client.id_proof?.file_path,
    ])),
  );

  const userIds = (users || []).map((user) => user.id);

  await adminClient
    .from("organization_invites")
    .delete()
    .eq("organization_id", organizationId);

  if (userIds.length > 0) {
    await adminClient
      .from("users")
      .update({ invited_by: null })
      .in("invited_by", userIds);

    await adminClient
      .from("platform_admins")
      .update({ created_by: null })
      .in("created_by", userIds);
  }

  for (const table of [
    "payment_history",
    "documents",
    "followups",
    "payment_charges",
    "payments",
    "cases",
    "clients",
  ]) {
    const { error } = await adminClient
      .from(table)
      .delete()
      .eq("organization_id", organizationId);
    if (error) throw error;
  }

  const { error: deleteProfilesError } = await adminClient
    .from("users")
    .delete()
    .eq("organization_id", organizationId);
  if (deleteProfilesError) throw deleteProfilesError;

  const { error: deleteOrgError } = await adminClient
    .from("organizations")
    .delete()
    .eq("id", organizationId);
  if (deleteOrgError) throw deleteOrgError;

  for (const user of users || []) {
    await adminClient
      .from("platform_admins")
      .delete()
      .eq("user_id", user.id);
    await adminClient
      .from("platform_admins")
      .delete()
      .eq("email", String(user.email || "").toLowerCase());
    await deleteAuthUser(adminClient, user.id);
  }

  return {
    organization,
    deletedUsers: users?.length || 0,
    deletedDocuments: documents?.length || 0,
  };
};

const deleteUser = async (
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  actorId: string,
) => {
  if (userId === actorId) {
    throw new Error("You cannot delete your own platform admin account.");
  }

  const { data: user, error: userError } = await adminClient
    .from("users")
    .select("id,email,organization_id")
    .eq("id", userId)
    .maybeSingle();
  if (userError) throw userError;
  if (!user) throw new Error("User not found.");

  await adminClient
    .from("organization_invites")
    .delete()
    .eq("auth_user_id", userId);

  await adminClient
    .from("organization_invites")
    .delete()
    .eq("accepted_by", userId);

  await adminClient
    .from("organization_invites")
    .delete()
    .eq("email", String(user.email || "").toLowerCase());

  await adminClient
    .from("organization_invites")
    .update({ invited_by: null })
    .eq("invited_by", userId);

  await adminClient
    .from("users")
    .update({ invited_by: null })
    .eq("invited_by", userId);

  await adminClient
    .from("platform_admins")
    .delete()
    .eq("user_id", userId);

  await adminClient
    .from("platform_admins")
    .delete()
    .eq("email", String(user.email || "").toLowerCase());

  await adminClient
    .from("platform_admins")
    .update({ created_by: null })
    .eq("created_by", userId);

  const { error: profileDeleteError } = await adminClient
    .from("users")
    .delete()
    .eq("id", userId);
  if (profileDeleteError) throw profileDeleteError;

  await deleteAuthUser(adminClient, userId);

  return { user };
};

Deno.serve(async (request: Request): Promise<Response> => {
  const options = handleOptions(request);
  if (options) return options;

  if (request.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const adminClient = createAdminClient();

  try {
    const actor = await getActorContext(request);
    assertPlatformAdmin(actor);
    await checkRateLimit(actor.user.id, "admin-delete", actor.ipAddress, 20, 300);

    const body = await request.json().catch(() => ({})) as DeleteRequest;
    const targetType = String(body.targetType || "").trim();

    if (targetType === "organization") {
      const organizationId = requireUuid(body.organizationId, "Organization ID");
      const result = await deleteOrganization(adminClient, organizationId, actor.user.id);

      await recordAuditEvent({
        organizationId,
        actorId: actor.user.id,
        actorEmail: actor.profile?.email || actor.user.email || "",
        action: "ORGANIZATION_DELETED",
        targetType: "organization",
        targetId: organizationId,
        severity: "SECURITY",
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          organizationName: result.organization.name,
          deletedUsers: result.deletedUsers,
          deletedDocuments: result.deletedDocuments,
        },
      });

      const { error: activityLogError } = await adminClient.from("admin_activity_log").insert({
        actor_email: actor.profile?.email || actor.user.email || "platform administrator",
        action: "DELETE_ORGANIZATION",
        target_type: "organization",
        target_id: organizationId,
        target_label: result.organization.name,
        details: {
          deletedUsers: result.deletedUsers,
          deletedDocuments: result.deletedDocuments,
        },
      });
      if (activityLogError) {
        console.warn("[admin-delete] Failed to write admin activity log:", activityLogError.message);
      }

      return jsonResponse({
        success: true,
        message: "Organization and its users were permanently deleted.",
        organizationId,
        deletedUsers: result.deletedUsers,
      });
    }

    if (targetType === "user") {
      const userId = requireUuid(body.userId, "User ID");
      const result = await deleteUser(adminClient, userId, actor.user.id);

      await recordAuditEvent({
        organizationId: result.user.organization_id,
        actorId: actor.user.id,
        actorEmail: actor.profile?.email || actor.user.email || "",
        action: "USER_DELETED",
        targetType: "user",
        targetId: userId,
        targetEmail: result.user.email,
        severity: "SECURITY",
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      const { error: activityLogError } = await adminClient.from("admin_activity_log").insert({
        actor_email: actor.profile?.email || actor.user.email || "platform administrator",
        action: "DELETE_USER",
        target_type: "user",
        target_id: userId,
        target_label: result.user.email,
      });
      if (activityLogError) {
        console.warn("[admin-delete] Failed to write admin activity log:", activityLogError.message);
      }

      return jsonResponse({
        success: true,
        message: "User was permanently deleted.",
        userId,
      });
    }

    throw new Error("targetType must be either organization or user.");
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});
