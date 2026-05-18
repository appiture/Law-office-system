/**
 * EXPORT WORKER
 * 
 * Purpose: Processes reports that were queued due to size or user request.
 * Runs independently of the request-response cycle.
 */

import { createAdminClient } from "../_shared/supabase.ts";
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

export async function processQueuedExports() {
  const db = createAdminClient();
  
  // 1. Fetch queued exports
  const { data: queuedLogs, error } = await db
    .from("export_logs")
    .select("*")
    .eq("status", "PROCESSING_QUEUED")
    .order("created_at", { ascending: true })
    .limit(5); // Process small batches to avoid timeouts

  if (error) {
    console.error("[Worker] Failed to fetch queued exports", error);
    return;
  }

  for (const log of (queuedLogs || [])) {
    try {
      // 2. Mark as processing
      await db.from("export_logs").update({ status: "PROCESSING", updated_at: new Date() }).eq("id", log.id);
      console.log(`[Worker] Processing ${log.id} (${log.export_type}) for ${log.actor_email}`);

      // 3. Reconstruct request from log
      const req: ExportRequest = {
        type: log.export_type as any,
        format: log.format as any,
        filters: log.filters || {},
        dateRange: (log.filters as any)?.dateRange, // Usually stored in filters
      };

      // 4. Fetch data
      const data = await fetchData(db, log.organization_id, req);
      
      // Fetch org name for header
      const { data: org } = await db.from("organizations").select("name").eq("id", log.organization_id).single();
      const orgName = org?.name || "Law Office";

      // 5. Generate file
      // formatData logic in generator.ts now correctly maps based on log.export_type
      const sheets = formatData(log.export_type, data);
      let result: Uint8Array | string;
      let contentType: string;

      switch (log.format) {
        case "xlsx":
          result = await generateXLSX(sheets);
          contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          break;
        case "pdf":
          result = generatePDF(sheets, `${orgName} Report`);
          contentType = "application/pdf";
          break;
        case "csv":
          result = generateCSV(sheets);
          contentType = "text/csv";
          break;
        case "docx":
          result = await generateDOCX(sheets, `${orgName} Report`);
          contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          break;
        default:
          throw new Error(`Unsupported format: ${log.format}`);
      }

      // 6. Upload to Storage
      const fileName = log.file_name || `${log.export_type}_${log.id.slice(0,8)}.${log.format}`;
      const filePath = `${log.organization_id}/${fileName}`;
      
      const { error: uploadError } = await db.storage
        .from("exports")
        .upload(filePath, result, {
          contentType,
          upsert: true
        });

      if (uploadError) throw uploadError;

      // 7. Get Public URL (or signed URL)
      const { data: { publicUrl } } = db.storage.from("exports").getPublicUrl(filePath);

      // 8. Update log
      await db.from("export_logs").update({
        status: "COMPLETED",
        file_name: fileName,
        metadata: { ...log.metadata, downloadUrl: publicUrl },
        updated_at: new Date()
      }).eq("id", log.id);

      // 9. Send Email Notification
      await sendEmail({
        to: log.actor_email,
        subject: `Your ${log.export_type} report is ready`,
        html: renderLayout({
          title: "Report Ready",
          organizationName: orgName,
          body: `
            <p>The ${log.export_type} report you requested has been generated successfully.</p>
            <p><strong>Format:</strong> ${log.format.toUpperCase()}</p>
            <p>You can download it using the link below:</p>
            <p><a href="${publicUrl}" style="padding: 10px 20px; background: #C9A34E; color: white; text-decoration: none; border-radius: 5px;">Download Report</a></p>
            <p>Or visit your dashboard notifications.</p>
          `
        }),
        organizationId: log.organization_id,
        templateName: "export_ready"
      });

      // 10. Trigger a notification in the system (optional but good)
      await db.from("notifications").insert({
        user_id: log.actor_id,
        organization_id: log.organization_id,
        type: "EXPORT_READY",
        message: `Your ${log.export_type} report is ready for download.`,
        payload: { downloadUrl: publicUrl, logId: log.id }
      });

      console.log(`[Worker] Completed ${log.id}`);

    } catch (err) {
      console.error(`[Worker] Failed ${log.id}:`, err.message);
      await db.from("export_logs").update({ 
        status: "FAILED", 
        metadata: { ...log.metadata, error: err.message },
        updated_at: new Date() 
      }).eq("id", log.id);
    }
  }
}
