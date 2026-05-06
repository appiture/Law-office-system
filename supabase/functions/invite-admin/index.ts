import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import {
  assertPlatformAdmin,
  checkRateLimit,
  getActorContext,
  recordAuditEvent,
} from "../_shared/auth.ts";
import {
  generateTemporaryPassword,
  requireEmail,
  requireText,
} from "../_shared/validation.ts";
import { inviteEmail, passwordSetupRedirectUrl, sendEmail } from "../_shared/email.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const adminClient = createAdminClient();
  let organizationId: string | null = null;
  let createdUserId: string | null = null;

  try {
    const actor = await getActorContext(request);
    assertPlatformAdmin(actor);
    await checkRateLimit(actor.user.id, "invite-admin", actor.ipAddress, 5, 300);

    const body = await request.json().catch(() => ({}));
    const organizationName = requireText(body.organizationName || body.orgName, "Organization name", 160);
    const adminEmail = requireEmail(body.adminEmail, "admin email");
    const plan = requireText(body.plan || "STANDARD", "Plan", 40).toUpperCase();

    const { data: existingUser, error: existingUserError } = await adminClient
      .from("users")
      .select("id,email")
      .eq("email", adminEmail)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingUserError) throw existingUserError;
    if (existingUser) throw new Error("A user with that email already exists.");

    const { data: organization, error: organizationError } = await adminClient
      .from("organizations")
      .insert({
        name: organizationName,
        status: "ACTIVE",
        requested_owner_email: adminEmail,
        created_by: actor.user.id,
        created_by_superadmin: true,
        approved_by: actor.user.id,
        approved_at: new Date().toISOString(),
        billing_status: plan,
        is_demo: false,
      })
      .select("id,name")
      .single();
    if (organizationError) throw organizationError;
    organizationId = organization.id;

    const temporaryPassword = generateTemporaryPassword();
    const passwordExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        role: "ADMIN",
        organization: organizationName,
        must_reset_password: true,
      },
      app_metadata: {
        role: "ADMIN",
        organization_id: organizationId,
      },
    });
    if (createUserError || !createdUser.user) {
      throw createUserError || new Error("Supabase Auth did not return a user.");
    }
    createdUserId = createdUser.user.id;

    const { error: profileError } = await adminClient
      .from("users")
      .upsert({
        id: createdUserId,
        email: adminEmail,
        full_name: "",
        role: "ADMIN",
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
        email: adminEmail,
        role: "ADMIN",
        status: "PENDING",
        invited_by: actor.user.id,
        auth_user_id: createdUserId,
        invite_type: "ADMIN",
        temporary_password_expires_at: passwordExpiresAt,
        metadata: { source: "edge:invite-admin" },
      }, { onConflict: "organization_id,email" })
      .select("id")
      .single();
    if (inviteError) throw inviteError;

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: adminEmail,
      options: { redirectTo: passwordSetupRedirectUrl() },
    });
    if (linkError) throw linkError;

    const actionLink = linkData?.properties?.action_link || passwordSetupRedirectUrl();
    const email = inviteEmail({
      recipientEmail: adminEmail,
      invitedByEmail: actor.user.email || actor.profile?.email || "platform administrator",
      role: "ADMIN",
      organizationName,
      temporaryPassword,
      setupUrl: actionLink,
      expiresAt: passwordExpiresAt,
    });

    let emailSent = true;
    let providerMessageId: string | null = null;
    try {
      const delivery = await sendEmail({
        to: adminEmail,
        subject: email.subject,
        html: email.html,
        organizationId,
        inviteId: invite.id,
        emailType: "ADMIN_INVITE",
        metadata: { role: "ADMIN" },
      });
      providerMessageId = delivery.id;
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
            source: "edge:invite-admin",
            email_error: emailError instanceof Error ? emailError.message : String(emailError),
          },
        })
        .eq("id", invite.id);
    }

    await recordAuditEvent({
      organizationId,
      actorId: actor.user.id,
      actorEmail: actor.user.email || actor.profile?.email || "",
      action: "ADMIN_INVITED",
      targetType: "user",
      targetId: createdUserId,
      targetEmail: adminEmail,
      severity: emailSent ? "INFO" : "WARN",
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { emailSent, providerMessageId },
    });

    return jsonResponse({
      success: true,
      emailSent,
      organizationId,
      adminUserId: createdUserId,
      adminEmail,
      message: emailSent
        ? "Organization and admin account created. The invite email was sent."
        : "Organization and admin account created, but the invite email failed. Check Resend configuration and email_events.",
    });
  } catch (error) {
    if (organizationId && !createdUserId) {
      await adminClient.from("organizations").delete().eq("id", organizationId);
    }

    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});

