import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getActorContext } from "../_shared/auth.ts";
import { createAdminClient } from "../_shared/supabase.ts";

Deno.serve(async (request: Request): Promise<Response> => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const actor = await getActorContext(request);
    const adminClient = createAdminClient();

    const { data: profile } = await adminClient
      .from("users")
      .select("must_reset_password, organization_id")
      .eq("id", actor.user.id)
      .maybeSingle();

    let organization = null;
    if (profile?.organization_id) {
      const { data: orgData } = await adminClient
        .from("organizations")
        .select("is_demo, demo_expires_at, subscription_status")
        .eq("id", profile.organization_id)
        .maybeSingle();
      organization = orgData;
    }

    return jsonResponse({
      authenticated: true,
      userId: actor.user.id,
      email: actor.profile?.email || actor.user.email || "",
      role: actor.profile?.role || null,
      organizationId: actor.profile?.organization_id || null,
      isPlatformAdmin: actor.isPlatformAdmin,
      mustResetPassword: Boolean(profile?.must_reset_password),
      isDemo: Boolean(organization?.is_demo),
      demoExpiresAt: organization?.demo_expires_at || null,
      subscriptionStatus: organization?.subscription_status || "ACTIVE",
    });
  } catch (error) {
    return jsonResponse({
      authenticated: false,
      error: error instanceof Error ? error.message : String(error),
    }, 401);
  }
});

