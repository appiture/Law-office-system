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

type AdminClient = ReturnType<typeof createAdminClient>;

async function sendAdminSetupEmail({
  adminClient,
  actor,
  organizationId,
  organizationName,
  adminEmail,
  adminUserId,
  temporaryPassword,
  passwordExpiresAt,
  reusedExistingAccount = false,
}: {
  adminClient: AdminClient;
  actor: Awaited<ReturnType<typeof getActorContext>>;
  organizationId: string;
  organizationName: string;
  adminEmail: string;
  adminUserId: string;
  temporaryPassword: string;
  passwordExpiresAt: string;
  reusedExistingAccount?: boolean;
}) {
  const { data: invite, error: inviteError } = await adminClient
    .from("organization_invites")
    .upsert({
      organization_id: organizationId,
      email: adminEmail,
      role: "ADMIN",
      status: "PENDING",
      invited_by: actor.user.id,
      auth_user_id: adminUserId,
      invite_type: "ADMIN",
      temporary_password_expires_at: passwordExpiresAt,
      metadata: { source: "edge:invite-admin", reusedExistingAccount },
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
      templateName: "invite-admin",
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
          source: "edge:invite-admin",
          reusedExistingAccount,
          email_error: emailError instanceof Error ? emailError.message : String(emailError),
        },
      })
      .eq("id", invite.id);
  }

  await recordAuditEvent({
    organizationId,
    actorId: actor.user.id,
    actorEmail: actor.user.email || actor.profile?.email || "",
    action: reusedExistingAccount ? "ADMIN_INVITE_RESENT" : "ADMIN_INVITED",
    targetType: "user",
    targetId: adminUserId,
    targetEmail: adminEmail,
    severity: emailSent ? "INFO" : "WARN",
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { emailSent, providerMessageId, reusedExistingAccount },
  });

  return { emailSent, providerMessageId };
}

Deno.serve(async (request: Request): Promise<Response> => {
  try {
    console.log("INVITE ADMIN START");
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
        .select("id,email,role,organization_id")
        .eq("email", adminEmail)
        .is("deleted_at", null)
        .maybeSingle();
      if (existingUserError) throw existingUserError;
      if (existingUser) {
        const { data: existingOrganization, error: existingOrganizationError } = await adminClient
          .from("organizations")
          .select("id,name,status")
          .eq("id", existingUser.organization_id)
          .maybeSingle();
        if (existingOrganizationError) throw existingOrganizationError;

        const sameOrganization = existingOrganization
          && existingUser.role === "ADMIN"
          && existingOrganization.name.trim().toLowerCase() === organizationName.trim().toLowerCase();
        if (!sameOrganization) throw new Error("A user with that email already exists.");

        const temporaryPassword = generateTemporaryPassword();
        const passwordExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const { error: updateUserError } = await adminClient.auth.admin.updateUserById(existingUser.id, {
          email: adminEmail,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: {
            role: "ADMIN",
            organization: existingOrganization.name,
            must_reset_password: true,
          },
          app_metadata: {
            role: "ADMIN",
            organization_id: existingOrganization.id,
          },
        });
        if (updateUserError) throw updateUserError;

        const { error: profileError } = await adminClient
          .from("users")
          .update({
            status: "ACTIVE",
            role: "ADMIN",
            must_reset_password: true,
            invite_status: "PENDING",
            invited_by: actor.user.id,
          })
          .eq("id", existingUser.id);
        if (profileError) throw profileError;

        const delivery = await sendAdminSetupEmail({
          adminClient,
          actor,
          organizationId: existingOrganization.id,
          organizationName: existingOrganization.name,
          adminEmail,
          adminUserId: existingUser.id,
          temporaryPassword,
          passwordExpiresAt,
          reusedExistingAccount: true,
        });

        return jsonResponse({
          success: true,
          emailSent: delivery.emailSent,
          organizationId: existingOrganization.id,
          adminUserId: existingUser.id,
          adminEmail,
          reusedExistingAccount: true,
          message: delivery.emailSent
            ? "Admin account already existed, so a new setup email was sent."
            : "Admin account already existed, but the setup email failed. Check Resend configuration and email_events.",
        });
      }

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

      const delivery = await sendAdminSetupEmail({
        adminClient,
        actor,
        organizationId,
        organizationName,
        adminEmail,
        adminUserId: createdUserId,
        temporaryPassword,
        passwordExpiresAt,
      });

      return jsonResponse({
        success: true,
        emailSent: delivery.emailSent,
        organizationId,
        adminUserId: createdUserId,
        adminEmail,
        message: delivery.emailSent
          ? "Organization and admin account created. The invite email was sent."
          : "Organization and admin account created, but the invite email failed. Check Resend configuration and email_events.",
      });
    } catch (error) {
      // Full rollback: remove org and orphan auth user if they were partially created
      if (organizationId) {
        await adminClient.from("organization_invites")
          .delete()
          .eq("organization_id", organizationId)
          .catch(() => {});
        await adminClient.from("organizations")
          .delete()
          .eq("id", organizationId)
          .catch(() => {});
      }
      if (createdUserId) {
        await adminClient.auth.admin.deleteUser(createdUserId).catch(() => {});
      }

      throw error; // Rethrow to global catch
    }
  } catch (error) {
    console.error("INVITE_ADMIN_ERROR:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    }, 400);
  }
});
