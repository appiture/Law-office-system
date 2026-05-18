import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import {
  assertOrganizationAdmin,
  getActorContext,
  recordAuditEvent,
} from "../_shared/auth.ts";
import { sendEmail, renderLayout } from "../_shared/email.ts";
import {
  fetchData,
  formatData,
  generateXLSX,
  generatePDF,
  generateCSV,
  generateDOCX,
  ExportRequest,
} from "./generator.ts";

import { processQueuedExports } from "./worker.ts";

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  const url = new URL(req.url);

  // ── Internal worker trigger ────────────────────────────────────────────────
  if (url.pathname.endsWith("/worker")) {
    const authHeader = req.headers.get("Authorization");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (authHeader !== `Bearer ${serviceKey}`) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    await processQueuedExports();
    return jsonResponse({ success: true, message: "Worker cycle completed" });
  }

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const db = createAdminClient();

  try {
    const actor = await getActorContext(req);
    const body: ExportRequest = await req.json();
    const { format, type, dateRange } = body;

    // ── Authorization ─────────────────────────────────────────────────────────
    // Platform reports  → must be platform admin
    // Dashboard reports → must be org admin
    // All other modules → any authenticated user with an org_id (ADMIN/LAWYER/STAFF)
    const isPlatformReport = type === "platform" && actor.isPlatformAdmin;

    if (!isPlatformReport) {
      if (type === "dashboard") {
        assertOrganizationAdmin(actor);
      } else if (!actor.profile?.organization_id) {
        throw new Error("Your account is not linked to an organization.");
      }
    }

    const orgId = (actor.profile?.organization_id ?? "") as string;
    const actorEmail = actor.profile?.email ?? actor.user?.email ?? "";

    // ── Organisation branding ─────────────────────────────────────────────────
    let orgName = "Law Office";
    let orgBranding = null;

    if (!isPlatformReport && orgId) {
      const { data: org } = await db
        .from("organizations")
        .select("name,address,phone,email,website,logo_url")
        .eq("id", orgId)
        .single();
      orgName = org?.name || "Law Office";
      orgBranding = org
        ? {
            address: org.address,
            phone: org.phone,
            email: org.email,
            website: org.website,
            logoUrl: org.logo_url,
          }
        : null;
    } else if (isPlatformReport) {
      orgName = "PLATFORM ADMINISTRATION";
    }

    // ── File naming ────────────────────────────────────────────────────────────
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const monthNames = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December",
    ];
    const monthLabel = dateRange?.start
      ? monthNames[new Date(dateRange.start).getMonth()]
      : "";
    const yearLabel = dateRange?.start
      ? new Date(dateRange.start).getFullYear()
      : "";

    let fileName = `${type.charAt(0).toUpperCase() + type.slice(1)}_Report_${dateStr}.${format}`;
    if (type === "payments" && monthLabel) {
      fileName = `Payments_Report_${monthLabel}_${yearLabel}.${format}`;
    } else if (type === "cases" && !dateRange?.start) {
      fileName = `Cases_Report_Full_${dateStr}.${format}`;
    }

    // ── Background queue (explicit only — never auto-triggered) ────────────────
    if (body.useQueue === true) {
      await db.from("export_logs").insert({
        organization_id: orgId,
        actor_id: actor.user.id,
        actor_email: actorEmail,
        format,
        export_type: type,
        scope: body.selectedIds?.length ? "selected" : "large_batch",
        filters: { ...body.filters, dateRange },
        status: "PROCESSING_QUEUED",
        file_name: fileName,
        metadata: {},
      });
      return jsonResponse(
        {
          message:
            "Your report is being processed in the background. You will receive an email when it's ready.",
          isBackground: true,
        },
        202
      );
    }

    // ── Synchronous generation ─────────────────────────────────────────────────
    // Use frontend data when supplied (preferred) — skips DB fetch entirely.
    // Falls back to fetchData only for dashboard or when no frontend data is sent.
    let data: any;
    if (body.allData !== undefined && body.allData !== null && type !== "dashboard") {
      if (Array.isArray(body.allData)) {
        // Flat arrays: clients, cases, hearings, documents, tasks, team
        data = { [type]: body.allData };
      } else {
        // Structured objects: payments → { paymentCases: [...] }
        data = body.allData;
      }
    } else {
      data = await fetchData(db, orgId, body);
    }
    data.orgBranding = orgBranding;

    const sheets = formatData(type, data);
    let result: Uint8Array | string;
    let contentType: string;

    switch (format) {
      case "csv":
        result = generateCSV(sheets);
        contentType = "text/csv";
        break;
      case "xlsx":
        result = await generateXLSX(sheets);
        contentType =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        break;
      case "pdf":
        result = generatePDF(sheets, `${orgName} Report`);
        contentType = "application/pdf";
        break;
      case "docx":
        result = await generateDOCX(sheets, `${orgName} Report`);
        contentType =
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    // ── Email delivery ─────────────────────────────────────────────────────────
    if (body.emailTo) {
      const b64 = btoa(
        result instanceof Uint8Array
          ? Array.from(result)
              .map((b) => String.fromCharCode(b))
              .join("")
          : result
      );

      const subject = `${orgName} Report: ${
        type.charAt(0).toUpperCase() + type.slice(1)
      }`;
      const delivery = await sendEmail({
        to: body.emailTo,
        subject,
        html: renderLayout({
          preview: `Your professional report for ${orgName}`,
          title: subject,
          organizationName: orgName,
          body: `
            <p>Your requested report has been generated successfully.</p>
            <p><strong>Module:</strong> ${type.charAt(0).toUpperCase() + type.slice(1)}</p>
            <p><strong>Format:</strong> ${format.toUpperCase()}</p>
            <p>Please find the report attached to this email.</p>
          `,
        }),
        organizationId: orgId,
        templateName: `export-${type}`,
        attachments: [{ filename: fileName, content: b64 }],
      });

      await db.from("export_logs").insert({
        organization_id: orgId,
        actor_id: actor.user.id,
        actor_email: actorEmail,
        format,
        export_type: type,
        scope: body.selectedIds?.length ? "selected" : "filtered",
        filters: body.filters || {},
        file_name: fileName,
        status: "COMPLETED",
        metadata: { emailedTo: body.emailTo, messageId: delivery?.id },
      });

      return jsonResponse({
        success: true,
        message: `Report has been emailed to ${body.emailTo}`,
      });
    }

    // ── Log direct download ────────────────────────────────────────────────────
    await db.from("export_logs").insert({
      organization_id: orgId,
      actor_id: actor.user.id,
      actor_email: actorEmail,
      format,
      export_type: type,
      scope: body.selectedIds?.length ? "selected" : "filtered",
      filters: body.filters || {},
      file_name: fileName,
      status: "COMPLETED",
    });

    await recordAuditEvent({
      organizationId: orgId,
      actorId: actor.user.id,
      actorEmail: actorEmail,
      action: `DATA_EXPORT_${format.toUpperCase()}`,
      targetType: "report",
      metadata: { type, format },
    });

    return new Response(result, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: any) {
    console.error("[export-report] Error:", error.message);
    return jsonResponse({ error: error.message }, 400);
  }
});
