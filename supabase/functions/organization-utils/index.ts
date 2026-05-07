import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { assertOrganizationAdmin, getActorContext } from "../_shared/auth.ts";
import { createAdminClient } from "../_shared/supabase.ts";

const countForOrg = async (table: string, organizationId: string) => {
  const { count, error } = await createAdminClient()
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (error) throw error;
  return count || 0;
};

Deno.serve(async (request: Request): Promise<Response> => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const actor = await getActorContext(request);
    assertOrganizationAdmin(actor);
    const organizationId = actor.profile?.organization_id as string;
    const adminClient = createAdminClient();

    const { data: organization, error: organizationError } = await adminClient
      .from("organizations")
      .select("id,name,status,billing_status,monthly_revenue,created_at")
      .eq("id", organizationId)
      .single();
    if (organizationError) throw organizationError;

    const [users, clients, cases, documents, followups] = await Promise.all([
      countForOrg("users", organizationId),
      countForOrg("clients", organizationId),
      countForOrg("cases", organizationId),
      countForOrg("documents", organizationId),
      countForOrg("followups", organizationId),
    ]);

    return jsonResponse({
      organization,
      metrics: { users, clients, cases, documents, followups },
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});

