import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  assertOrganizationAdmin,
  assertPlatformAdmin,
  checkRateLimit,
  getActorContext,
  recordAuditEvent,
} from "../_shared/auth.ts";
import { requireEmail, requireText } from "../_shared/validation.ts";
import { monthlyReportEmail, passwordResetEmail, sendEmail } from "../_shared/email.ts";

const allowedTypes = new Set(["PASSWORD_RESET", "MONTHLY_REPORT", "NOTIFICATION"]);

Deno.serve(async (request: Request): Promise<Response> => {
  const options = handleOptions(request);
  if (options) return options;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const actor = await getActorContext(request);
    await checkRateLimit(actor.user.id, "send-email", actor.ipAddress, 20, 300);

    const body = await request.json().catch(() => ({}));
    const emailType = requireText(body.emailType, "Email type", 60).toUpperCase();
    if (!allowedTypes.has(emailType)) throw new Error("Unsupported email type.");

    const recipientEmail = requireEmail(body.to, "recipient email");
    const organizationId = actor.profile?.organization_id || null;

    if (emailType === "MONTHLY_REPORT") {
      assertOrganizationAdmin(actor);
    } else if (!actor.isPlatformAdmin) {
      assertOrganizationAdmin(actor);
    } else {
      assertPlatformAdmin(actor);
    }

    const organizationName = body.organizationName
      ? String(body.organizationName).trim()
      : undefined;

    let subject = "";
    let html = "";
    if (emailType === "PASSWORD_RESET") {
      const resetUrl = requireText(body.resetUrl, "Reset URL", 1000);
      const rendered = passwordResetEmail({ recipientEmail, resetUrl, organizationName });
      subject = rendered.subject;
      html = rendered.html;
    } else if (emailType === "MONTHLY_REPORT") {
      const rendered = monthlyReportEmail({
        title: requireText(body.subject || "Monthly report", "Subject", 180),
        organizationName,
        metrics: body.metrics || {},
      });
      subject = rendered.subject;
      html = rendered.html;
    } else {
      subject = requireText(body.subject, "Subject", 180);
      html = requireText(body.html, "HTML body", 50000);
    }

    const attachments = [];
    if (Array.isArray(body.attachments)) {
      for (const att of body.attachments) {
        if (!att.filename || !att.content || !att.contentType) {
          throw new Error("Invalid attachment structure. Must have filename, content, and contentType.");
        }
        
        const validMimes = [
          "application/pdf",
          "text/csv",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ];
        
        if (!validMimes.includes(att.contentType)) {
          throw new Error(`Invalid attachment MIME type: ${att.contentType}`);
        }
        
        attachments.push({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType
        });
      }
    }

    const delivery = await sendEmail({
      to: recipientEmail,
      subject,
      html,
      organizationId,
      templateName: emailType.toLowerCase(),
      attachments,
    });

    const providerMessageId = delivery?.id || null;

    await recordAuditEvent({
      organizationId,
      actorId: actor.user.id,
      actorEmail: actor.profile?.email || actor.user.email || "",
      action: "EMAIL_SENT",
      targetType: "email",
      targetEmail: recipientEmail,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { emailType, providerMessageId },
    });

    return jsonResponse({ success: true, providerMessageId });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});

