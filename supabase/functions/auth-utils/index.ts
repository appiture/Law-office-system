import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getActorContext } from "../_shared/auth.ts";
import { createAdminClient } from "../_shared/supabase.ts";

Deno.serve(async (request: Request): Promise<Response> => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const actor = await getActorContext(request);
    const adminClient = createAdminClient();
    const { data: mustReset } = await adminClient
      .from("users")
      .select("must_reset_password")
      .eq("id", actor.user.id)
      .maybeSingle();

    return jsonResponse({
      authenticated: true,
      userId: actor.user.id,
      email: actor.profile?.email || actor.user.email || "",
      role: actor.profile?.role || null,
      organizationId: actor.profile?.organization_id || null,
      isPlatformAdmin: actor.isPlatformAdmin,
      mustResetPassword: Boolean(mustReset?.must_reset_password),
    });
  } catch (error) {
    return jsonResponse({
      authenticated: false,
      error: error instanceof Error ? error.message : String(error),
    }, 401);
  }
});

