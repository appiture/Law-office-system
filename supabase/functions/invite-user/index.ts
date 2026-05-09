import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import {
  assertOrganizationAdmin,
  checkRateLimit,
  getActorContext,
  recordAuditEvent,
} from "../_shared/auth.ts";
import {
  generateTemporaryPassword,
  requireEmail,
  requireRole,
} from "../_shared/validation.ts";
import { inviteEmail, passwordSetupRedirectUrl, sendEmail } from "../_shared/email.ts";

Deno.serve(async (request: Request): Promise<Response> => {
  const options = handleOptions(request);
  if (options) return options;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const adminClient = createAdminClient();
  let createdUserId: string | null = null;

  try {
    const actor = await getActorContext(request);
    assertOrganizationAdmin(actor);
    await checkRateLimit(actor.user.id, "invite-user", actor.ipAddress, 10, 300);

    const organizationId = actor.profile?.organization_id as string;
    const body = await request.json().catch(() => ({}));
    const emailAddress = requireEmail(body.email || body.inviteEmail);
    const role = requireRole(body.role || "USER", ["USER", "LAWYER", "STAFF", "ADMIN"]);

    const { data: organization, error: organizationError } = await adminClient
      .from("organizations")
      .select("id,name,status")
      .eq("id", organizationId)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (organizationError) throw organizationError;
    if (!organization) throw new Error("Your organization is not active.");

    const { data: existingUser, error: existingUserError } = await adminClient
      .from("users")
      .select("id,email,organization_id,deleted_at")
      .eq("email", emailAddress)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingUserError) throw existingUserError;
    if (existingUser) throw new Error("A user with that email already exists.");

    const { data: pendingInvite, error: pendingInviteError } = await adminClient
      .from("organization_invites")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("email", emailAddress)
      .eq("status", "PENDING")
      .maybeSingle();
    if (pendingInviteError) throw pendingInviteError;
    if (pendingInvite) throw new Error("There is already a pending invite for this email.");

    const temporaryPassword = generateTemporaryPassword();
    const passwordExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: emailAddress,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        role,
        organization: organization.name,
        must_reset_password: true,
      },
      app_metadata: {
        role,
        organization_id: organizationId,
      },
    });
    if (createUserError || !createdUser.user) {
      throw createUserError || new Error("Supabase Auth did not return a user.");
    }

    createdUserId = createdUser.user.id;
    const userId = createdUserId;
    const { error: profileError } = await adminClient.from("users").upsert({
      id: userId,
      email: emailAddress,
      full_name: "",
      role,
      status: "ACTIVE",
      organization_id: organizationId,
      must_reset_password: true,
      invited_by: actor.user.id,
    }, { onConflict: "id" });
    if (profileError) throw profileError;

    const { data: invite, error: inviteError } = await adminClient
      .from("organization_invites")
      .upsert({
        organization_id: organizationId,
        email: emailAddress,
        role,
        status: "PENDING",
        invited_by: actor.user.id,
        auth_user_id: userId,
        invite_type: "USER",
        temporary_password_expires_at: passwordExpiresAt,
        metadata: { source: "edge:invite-user" },
      }, { onConflict: "organization_id,email" })
      .select("id")
      .single();
    if (inviteError) throw inviteError;

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: emailAddress,
      options: { redirectTo: passwordSetupRedirectUrl() },
    });
    if (linkError) throw linkError;

    const actionLink = linkData?.properties?.action_link || passwordSetupRedirectUrl();
    const email = inviteEmail({
      recipientEmail: emailAddress,
      invitedByEmail: actor.profile?.email || actor.user.email || "organization admin",
      role,
      organizationName: organization.name,
      temporaryPassword,
      setupUrl: actionLink,
      expiresAt: passwordExpiresAt,
    });

    let emailSent = true;
    let providerMessageId: string | null = null;
    try {
      const delivery = await sendEmail({
        to: emailAddress,
        subject: email.subject,
        html: email.html,
        organizationId,
        inviteId: invite.id,
        templateName: "invite-user",
      });
      providerMessageId = delivery?.id || null;
      await adminClient
        .from("organization_invites")
        .update({
          delivery_status: "SENT",
          provider_message_id: providerMessageId,
          sent_at: new Date().toISOString(),
          last_sent_at: new Date().toISOString(),
          send_count: 1,
        })
        .eq("id", invite.id);
    } catch (emailError) {
      emailSent = false;
      await adminClient
        .from("organization_invites")
        .update({
          delivery_status: "FAILED",
          metadata: {
            source: "edge:invite-user",
            email_error: emailError instanceof Error ? emailError.message : String(emailError),
          },
        })
        .eq("id", invite.id);
    }

    await recordAuditEvent({
      organizationId,
      actorId: actor.user.id,
      actorEmail: actor.profile?.email || actor.user.email || "",
      action: "USER_INVITED",
      targetType: "user",
      targetId: userId,
      targetEmail: emailAddress,
      severity: emailSent ? "INFO" : "WARN",
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { role, emailSent, providerMessageId },
    });

    return jsonResponse({
      success: true,
      emailSent,
      userId,
      email: emailAddress,
      role,
      organizationId,
      message: emailSent
        ? "Team member account created and invite email sent."
        : "Team member account created, but the invite email failed. Check Resend configuration and email_events.",
    });
  } catch (error) {
    // Rollback orphaned Supabase Auth user
    if (createdUserId) {
      console.warn(`[invite-user] Rolling back orphaned auth user ${createdUserId} due to error:`, error);
      await adminClient.auth.admin.deleteUser(createdUserId).catch((e) => {
        console.error(`[invite-user] FAILED TO ROLLBACK AUTH USER ${createdUserId}:`, e);
      });
    }

    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});

