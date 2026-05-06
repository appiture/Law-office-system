import { appBaseUrl, emailFrom, env, requiredEnv, supportEmail } from "./config.ts";
import { createAdminClient } from "./supabase.ts";

type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  organizationId?: string | null;
  inviteId?: string | null;
  emailType: string;
  metadata?: Record<string, unknown>;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const button = (href: string, label: string) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;background:#C9A34E;color:#0B1F3A;text-decoration:none;font-weight:800;border-radius:10px;padding:13px 20px">${escapeHtml(label)}</a>`;

export const renderLayout = ({
  preview,
  title,
  body,
  organizationName,
}: {
  preview: string;
  title: string;
  body: string;
  organizationName?: string;
}) => {
  const support = supportEmail();
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;background:#f6f8fb;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preview)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fb;padding:28px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden">
          <tr>
            <td style="background:#0B1F3A;padding:24px 28px;color:#ffffff">
              <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#C9A34E;font-weight:800">Law Office Platform</div>
              <div style="font-size:24px;font-weight:850;margin-top:6px;line-height:1.25">${escapeHtml(title)}</div>
              ${organizationName ? `<div style="font-size:13px;color:#cbd5e1;margin-top:6px">${escapeHtml(organizationName)}</div>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:28px;color:#182235;font-size:15px;line-height:1.65">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px;line-height:1.55">
              This message was sent by Law Office Platform. If you were not expecting it, contact
              <a href="mailto:${escapeHtml(support)}" style="color:#0B1F3A">${escapeHtml(support)}</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export const inviteEmail = ({
  recipientEmail,
  invitedByEmail,
  role,
  organizationName,
  temporaryPassword,
  setupUrl,
  expiresAt,
}: {
  recipientEmail: string;
  invitedByEmail: string;
  role: string;
  organizationName: string;
  temporaryPassword: string;
  setupUrl: string;
  expiresAt?: string | null;
}) => {
  const title = role === "ADMIN" ? "You have been invited as an organization admin" : "You have been invited to your workspace";
  const body = `
    <p>Hello,</p>
    <p><strong>${escapeHtml(invitedByEmail)}</strong> invited you to join <strong>${escapeHtml(organizationName)}</strong> as <strong>${escapeHtml(role)}</strong>.</p>
    <p>${button(setupUrl, "Set up password")}</p>
    <p style="margin-top:22px">You can also sign in with this temporary password and will be required to change it immediately:</p>
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:800;letter-spacing:.08em;color:#9a3412">${escapeHtml(temporaryPassword)}</div>
    <p style="color:#64748b;font-size:13px">For security, do not forward this email. The setup link and temporary password expire${expiresAt ? ` on ${escapeHtml(new Date(expiresAt).toLocaleString("en-IN"))}` : " soon"}.</p>
    <p>Use <strong>${escapeHtml(recipientEmail)}</strong> as your login email.</p>
  `;
  return {
    subject: `${organizationName}: workspace invitation`,
    html: renderLayout({
      preview: `Invitation to ${organizationName}`,
      title,
      organizationName,
      body,
    }),
  };
};

export const passwordResetEmail = ({
  recipientEmail,
  resetUrl,
  organizationName,
}: {
  recipientEmail: string;
  resetUrl: string;
  organizationName?: string;
}) => ({
  subject: "Reset your Law Office Platform password",
  html: renderLayout({
    preview: "Reset your password",
    title: "Password reset requested",
    organizationName,
    body: `
      <p>We received a request to reset the password for <strong>${escapeHtml(recipientEmail)}</strong>.</p>
      <p>${button(resetUrl, "Reset password")}</p>
      <p style="color:#64748b;font-size:13px">If you did not request this, you can ignore this email.</p>
    `,
  }),
});

export const monthlyReportEmail = ({
  title,
  organizationName,
  metrics,
}: {
  title: string;
  organizationName?: string;
  metrics: Record<string, unknown>;
}) => {
  const rows = Object.entries(metrics)
    .map(
      ([key, value]) =>
        `<tr><td style="padding:10px 0;color:#64748b">${escapeHtml(key.replaceAll("_", " "))}</td><td style="padding:10px 0;text-align:right;font-weight:800">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  return {
    subject: title,
    html: renderLayout({
      preview: title,
      title,
      organizationName,
      body: `
        <p>Here is the monthly operating summary.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">${rows}</table>
        <p style="color:#64748b;font-size:13px">Generated automatically by Law Office Platform.</p>
      `,
    }),
  };
};

export const sendEmail = async (payload: EmailPayload) => {
  const adminClient = createAdminClient();
  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];

  const { data: event, error: eventError } = await adminClient
    .from("email_events")
    .insert({
      organization_id: payload.organizationId || null,
      invite_id: payload.inviteId || null,
      recipient_email: recipients.join(","),
      email_type: payload.emailType,
      subject: payload.subject,
      metadata: payload.metadata || {},
    })
    .select("id")
    .single();

  if (eventError) throw eventError;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom(),
        to: recipients,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        reply_to: env("EMAIL_REPLY_TO", supportEmail()),
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result?.message || `Resend failed with status ${response.status}`);
    }

    await adminClient
      .from("email_events")
      .update({
        status: "SENT",
        provider_message_id: result?.id || null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", event.id);

    return { id: result?.id || null, emailEventId: event.id };
  } catch (error) {
    await adminClient
      .from("email_events")
      .update({
        status: "FAILED",
        error_message: error instanceof Error ? error.message : String(error),
      })
      .eq("id", event.id);
    throw error;
  }
};

export const passwordSetupRedirectUrl = () => `${appBaseUrl()}/reset-password`;

