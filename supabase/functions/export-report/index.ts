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
  ExportRequest 
} from "./generator.ts";

import { processQueuedExports } from "./worker.ts";

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  const url = new URL(req.url);
  
  // Worker Trigger (Internal)
  if (url.pathname.endsWith("/worker")) {
    const authHeader = req.headers.get("Authorization");
    // Use the service role key as a secret for internal triggers
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

    // Platform admins can run platform reports without organization restriction.
    const isPlatformReport = type === "platform" && actor.isPlatformAdmin;
    
    // Dashboard reports require org admin. Module reports (cases, clients, etc.) allow any authenticated user.
    const requiresAdminRole = isPlatformReport || type === "dashboard";
    if (requiresAdminRole && !isPlatformReport) {
      assertOrganizationAdmin(actor);
    } else if (!isPlatformReport && !actor.profile?.organization_id) {
      // Still need an org context for module exports
      assertOrganizationAdmin(actor);
    }
    
    const orgId = (actor.profile?.organization_id || "") as string;

    let orgName = "Law Office";
    let orgBranding = null;

    if (!isPlatformReport) {
      const { data: org } = await db.from("organizations").select("*").eq("id", orgId).single();
      orgName = org?.name || "Law Office";
      orgBranding = org ? {
        address: org.address,
        phone: org.phone,
        email: org.email,
        website: org.website,
        logoUrl: org.logo_url
      } : null;
    } else {
      orgName = "PLATFORM ADMINISTRATION";
    }

    // Task 12: Professional File Naming
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthLabel = dateRange?.start ? monthNames[new Date(dateRange.start).getMonth()] : "";
    const yearLabel = dateRange?.start ? new Date(dateRange.start).getFullYear() : "";
    
    let fileName = `${type.charAt(0).toUpperCase() + type.slice(1)}_Report_${dateStr}.${format}`;
    if (type === "payments" && monthLabel) {
      fileName = `Payments_Report_${monthLabel}_${yearLabel}.${format}`;
    } else if (type === "cases" && !dateRange?.start) {
      fileName = `Cases_Report_Full_${dateStr}.${format}`;
    }

    // Step 1: Check for Background Queueing Need
    // We queue if: 
    // 1. Explicitly requested (body.useQueue)
    // 2. High volume expected (based on simple query count)
    // 3. Complex multi-sheet dashboard report
    
    const countTable =
      type === "dashboard" ? "cases" :
      type === "payments" ? "payment_history" :
      type === "team" ? "users" :
      type === "platform" ? "organizations" :
      type;

    let countQuery = db.from(countTable).select("id", { count: "exact", head: true });
    if (!isPlatformReport) {
      countQuery = countQuery.eq("organization_id", orgId);
    }
    const { count } = await countQuery;

    if (body.useQueue || (count && count > 500)) {
      await db.from("export_logs").insert({
        organization_id: orgId,
        actor_id: actor.user.id,
        actor_email: actor.profile!.email,
        format,
        export_type: type,
        scope: body.selectedIds?.length ? "selected" : (count && count > 500 ? "large_batch" : "filtered"),
        filters: { ...body.filters, dateRange },
        status: "PROCESSING_QUEUED",
        file_name: fileName,
        metadata: { estimatedRecords: count }
      });

      return jsonResponse({ 
        message: "Your report is being processed in the background. You will receive an email and notification when it's ready.",
        isBackground: true,
        estimatedRecords: count
      }, 202);
    }

    // Step 2: Synchronous Processing for smaller reports
    const data = await fetchData(db, orgId, body);
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
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        break;
      case "pdf":
        result = generatePDF(sheets, `${orgName} Report`);
        contentType = "application/pdf";
        break;
      case "docx":
        result = await generateDOCX(sheets, `${orgName} Report`);
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    // Task 12: Handle Email Delivery
    if (body.emailTo) {
      const b64 = btoa(result instanceof Uint8Array ? 
        Array.from(result).map(b => String.fromCharCode(b)).join("") : 
        result
      );

      const subject = `${orgName} Report: ${type.charAt(0).toUpperCase() + type.slice(1)}`;
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
          `
        }),
        organizationId: orgId,
        templateName: `export-${type}`,
        attachments: [
          {
            filename: fileName,
            content: b64,
          }
        ]
      });

      await db.from("export_logs").insert({
        organization_id: orgId,
        actor_id: actor.user.id,
        actor_email: actor.profile!.email,
        format,
        export_type: type,
        scope: body.selectedIds?.length ? "selected" : "filtered",
        filters: body.filters || {},
        file_name: fileName,
        status: "COMPLETED",
        metadata: { emailedTo: body.emailTo, messageId: delivery?.id }
      });

      return jsonResponse({
        success: true,
        message: `Report has been emailed to ${body.emailTo}`
      });
    }

    // Log the export (Task 14)
    await db.from("export_logs").insert({
      organization_id: orgId,
      actor_id: actor.user.id,
      actor_email: actor.profile!.email,
      format,
      export_type: type,
      scope: body.selectedIds?.length ? "selected" : "filtered",
      filters: body.filters || {},
      file_name: fileName,
      status: "COMPLETED"
    });

    await recordAuditEvent({
      organizationId: orgId,
      actorId: actor.user.id,
      actorEmail: actor.profile!.email,
      action: `DATA_EXPORT_${format.toUpperCase()}`,
      targetType: "report",
      metadata: { type, format, records: count },
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
