import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { env, requiredEnv } from "../_shared/config.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { monthlyReportEmail, sendEmail } from "../_shared/email.ts";
import { recordAuditEvent } from "../_shared/auth.ts";

type CountResult = {
  count: number | null;
  error: Error | null;
};

type PaymentRow = {
  amount_paid: number | string | null;
};

const assertSchedulerAuth = (request: Request) => {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const serviceRole = requiredEnv("SERVICE_ROLE_KEY");
  const monthlySecret = env("MONTHLY_REPORT_SECRET");
  if (token !== serviceRole && (!monthlySecret || token !== monthlySecret)) {
    throw new Error("Unauthorized scheduler request.");
  }
};

const monthBounds = (input?: string) => {
  const now = input ? new Date(`${input}T00:00:00.000Z`) : new Date();
  const firstOfCurrentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = input
    ? firstOfCurrentMonth
    : new Date(Date.UTC(firstOfCurrentMonth.getUTCFullYear(), firstOfCurrentMonth.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return {
    reportMonth: start.toISOString().slice(0, 10),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label: start.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
};

const countRows = async (table: string, filters: Record<string, string | null>, startIso?: string, endIso?: string) => {
  let query = createAdminClient().from(table).select("id", { count: "exact", head: true });
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null) query = query.eq(key, value);
  });
  if (startIso) query = query.gte("created_at", startIso);
  if (endIso) query = query.lt("created_at", endIso);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
};

const orgMetrics = async (organizationId: string, startIso: string, endIso: string) => {
  const adminClient = createAdminClient();
  const [activeUsers, registrations, clients, cases, documents, followups, securityAlerts] = await Promise.all([
    countRows("users", { organization_id: organizationId, status: "ACTIVE" }),
    countRows("users", { organization_id: organizationId }, startIso, endIso),
    countRows("clients", { organization_id: organizationId }, startIso, endIso),
    countRows("cases", { organization_id: organizationId }, startIso, endIso),
    countRows("documents", { organization_id: organizationId }, startIso, endIso),
    countRows("followups", { organization_id: organizationId }, startIso, endIso),
    adminClient
      .from("audit_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("severity", ["WARN", "ERROR", "SECURITY"])
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .then(({ count, error }: CountResult) => {
        if (error) throw error;
        return count || 0;
      }),
  ]);

  const { data: payments, error: paymentsError } = await adminClient
    .from("payment_history")
    .select("amount_paid")
    .eq("organization_id", organizationId)
    .gte("timestamp", startIso)
    .lt("timestamp", endIso);
  if (paymentsError) throw paymentsError;

  const revenue = ((payments || []) as PaymentRow[]).reduce(
    (sum: number, row: PaymentRow) => sum + Number(row.amount_paid || 0),
    0,
  );

  return {
    active_users: activeUsers,
    new_registrations: registrations,
    new_clients: clients,
    new_cases: cases,
    uploaded_documents: documents,
    scheduled_followups: followups,
    revenue_recorded: revenue.toFixed(2),
    security_alerts: securityAlerts,
  };
};

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const adminClient = createAdminClient();

  try {
    assertSchedulerAuth(request);
    const body = await request.json().catch(() => ({}));
    const bounds = monthBounds(body.reportMonth);

    const { data: orgs, error: orgError } = await adminClient
      .from("organizations")
      .select("id,name,status,monthly_revenue")
      .eq("status", "ACTIVE")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (orgError) throw orgError;

    const { data: platformAdmins, error: platformError } = await adminClient
      .from("platform_admins")
      .select("email")
      .not("email", "is", null);
    if (platformError) throw platformError;

    const platformMetrics = {
      active_organizations: orgs?.length || 0,
      active_users: await countRows("users", { status: "ACTIVE" }),
      new_registrations: await countRows("users", {}, bounds.startIso, bounds.endIso),
      revenue_recorded: "See organization reports",
      security_alerts: await adminClient
        .from("audit_events")
        .select("id", { count: "exact", head: true })
        .in("severity", ["WARN", "ERROR", "SECURITY"])
        .gte("created_at", bounds.startIso)
        .lt("created_at", bounds.endIso)
        .then(({ count, error }: CountResult) => {
          if (error) throw error;
          return count || 0;
        }),
    };

    let sent = 0;
    let failed = 0;

    for (const admin of platformAdmins || []) {
      if (!admin.email) continue;
      const rendered = monthlyReportEmail({
        title: `Platform monthly report: ${bounds.label}`,
        metrics: platformMetrics,
      });
      try {
        const delivery = await sendEmail({
          to: admin.email,
          subject: rendered.subject,
          html: rendered.html,
          templateName: "monthly-report-platform",
        });
        await adminClient.from("monthly_report_runs").upsert({
          report_month: bounds.reportMonth,
          organization_id: null,
          recipient_email: admin.email,
          recipient_role: "SUPER_ADMIN",
          status: "SENT",
          provider_message_id: delivery?.id || null,
          metrics: platformMetrics,
          sent_at: new Date().toISOString(),
        }, { onConflict: "report_month,organization_id,recipient_email" });
        sent += 1;
      } catch (error) {
        failed += 1;
      }
    }

    for (const org of orgs || []) {
      const { data: admins, error: adminsError } = await adminClient
        .from("users")
        .select("email")
        .eq("organization_id", org.id)
        .eq("role", "ADMIN")
        .eq("status", "ACTIVE")
        .is("deleted_at", null);
      if (adminsError) throw adminsError;

      const metrics = await orgMetrics(org.id, bounds.startIso, bounds.endIso);
      for (const admin of admins || []) {
        if (!admin.email) continue;
        const rendered = monthlyReportEmail({
          title: `${org.name} monthly report: ${bounds.label}`,
          organizationName: org.name,
          metrics,
        });
        try {
          const delivery = await sendEmail({
            to: admin.email,
            subject: rendered.subject,
            html: rendered.html,
            organizationId: org.id,
            templateName: "monthly-report-org",
          });
          await adminClient.from("monthly_report_runs").upsert({
            report_month: bounds.reportMonth,
            organization_id: org.id,
            recipient_email: admin.email,
            recipient_role: "ADMIN",
            status: "SENT",
            provider_message_id: delivery?.id || null,
            metrics,
            sent_at: new Date().toISOString(),
          }, { onConflict: "report_month,organization_id,recipient_email" });
          sent += 1;
        } catch (error) {
          failed += 1;
          await adminClient.from("monthly_report_runs").upsert({
            report_month: bounds.reportMonth,
            organization_id: org.id,
            recipient_email: admin.email,
            recipient_role: "ADMIN",
            status: "FAILED",
            error_message: error instanceof Error ? error.message : String(error),
            metrics,
          }, { onConflict: "report_month,organization_id,recipient_email" });
        }
      }
    }

    await recordAuditEvent({
      action: "MONTHLY_REPORT_RUN",
      targetType: "monthly_report",
      severity: failed ? "WARN" : "INFO",
      metadata: { reportMonth: bounds.reportMonth, sent, failed },
    });

    return jsonResponse({ success: true, reportMonth: bounds.reportMonth, sent, failed });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});
