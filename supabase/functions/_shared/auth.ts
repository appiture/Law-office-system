import { createAdminClient, createUserClient } from "./supabase.ts";

export type ActorContext = {
  user: {
    id: string;
    email?: string;
  };
  profile: {
    id: string;
    email: string;
    role: string;
    organization_id: string | null;
    status: string;
  } | null;
  isPlatformAdmin: boolean;
  ipAddress: string;
  userAgent: string;
};

export const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    throw new Error("Missing bearer token.");
  }
  return authorization;
};

export const getActorContext = async (request: Request): Promise<ActorContext> => {
  const authorization = getBearerToken(request);
  const userClient = createUserClient(authorization);
  const adminClient = createAdminClient();

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    throw new Error("Invalid or expired Supabase session.");
  }

  const user = {
    id: userData.user.id,
    email: userData.user.email || "",
  };

  const { data: profile, error: profileError } = await adminClient
    .from("users")
    .select("id,email,role,organization_id,status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  const normalizedEmail = String(user.email || profile?.email || "").toLowerCase();
  const { data: platformAdmin, error: adminError } = await adminClient
    .from("platform_admins")
    .select("id")
    .or(`user_id.eq.${user.id},email.eq.${normalizedEmail}`)
    .maybeSingle();

  if (adminError && adminError.code !== "PGRST116") throw adminError;

  return {
    user,
    profile: profile || null,
    isPlatformAdmin: Boolean(platformAdmin),
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("cf-connecting-ip") ||
      "",
    userAgent: request.headers.get("user-agent") || "",
  };
};

export const assertPlatformAdmin = (context: ActorContext) => {
  if (!context.isPlatformAdmin) {
    throw new Error("Only platform administrators can perform this action.");
  }
};

export const assertOrganizationAdmin = (context: ActorContext) => {
  if (context.profile?.role !== "ADMIN" || context.profile?.status !== "ACTIVE") {
    throw new Error("Only active organization administrators can perform this action.");
  }
  if (!context.profile.organization_id) {
    throw new Error("Your account is not linked to an organization.");
  }
};

export const checkRateLimit = async (
  actorId: string,
  actionKey: string,
  ipAddress: string,
  maxRequests = 5,
  windowSeconds = 60,
) => {
  // Rate limiting is best-effort — if the RPC doesn't exist or errors we
  // log and continue rather than returning a cryptic 400 to the caller.
  try {
    const adminClient = createAdminClient();
    const { error } = await adminClient.rpc("edge_check_rate_limit", {
      actor_id: actorId,
      action_key: actionKey,
      max_requests: maxRequests,
      window_seconds: windowSeconds,
      ip_address: ipAddress,
    });
    if (error) {
      // PGRST202 = function not found — treat as non-blocking
      if (error.code === "PGRST202" || error.message?.includes("function") || error.message?.includes("does not exist")) {
        console.warn("[checkRateLimit] RPC not found — skipping rate limit check:", error.message);
        return;
      }
      // Rate limit actually exceeded — re-throw so caller gets a proper 429-style 400
      throw error;
    }
  } catch (e) {
    // Only re-throw if it looks like a genuine rate-limit violation
    if (e instanceof Error && e.message?.toLowerCase().includes("rate limit")) throw e;
    console.warn("[checkRateLimit] Non-critical error — skipping:", e instanceof Error ? e.message : e);
  }
};

export const recordAuditEvent = async (params: {
  organizationId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetEmail?: string | null;
  severity?: "INFO" | "WARN" | "ERROR" | "SECURITY";
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  // Audit recording is best-effort — never block the main response if it fails.
  try {
    const adminClient = createAdminClient();
    const { error } = await adminClient.rpc("record_audit_event", {
      organization_id: params.organizationId || null,
      actor_id: params.actorId || null,
      actor_email: params.actorEmail || null,
      action: params.action,
      target_type: params.targetType || null,
      target_id: params.targetId || null,
      target_email: params.targetEmail || null,
      severity: params.severity || "INFO",
      ip_address: params.ipAddress || null,
      user_agent: params.userAgent || null,
      metadata: params.metadata || {},
    });
    if (error) {
      console.warn("[recordAuditEvent] RPC error (non-critical):", error.code, error.message);
    }
  } catch (e) {
    console.warn("[recordAuditEvent] Exception (non-critical):", e instanceof Error ? e.message : e);
  }
};

