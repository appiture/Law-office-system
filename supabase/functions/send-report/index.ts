import JSZip from "jszip";
import { sendEmail } from "../_shared/email.ts";
import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { appBaseUrl, emailFrom, requiredEnv, supportEmail } from "../_shared/config.ts";
import {
  assertOrganizationAdmin,
  checkRateLimit,
  getActorContext,
  recordAuditEvent,
} from "../_shared/auth.ts";

// ---------------------------------------------------------------------------
// Minimal XLSX builder (no external lib needed — pure Office Open XML)
// Produces a valid multi-sheet .xlsx binary using JSZip-style zip encoding.
// We use a simple approach: base64-encoded preset zip parts + dynamic XML.
// ---------------------------------------------------------------------------

/** Escape cell value for XML */
const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

type Row = (string | number | null | undefined)[];
type Sheet = { name: string; headers: string[]; rows: Row[] };

/** Build a minimal xlsx ArrayBuffer with multiple sheets */
async function buildXlsx(sheets: Sheet[]): Promise<Uint8Array> {
  const zip = new JSZip();

  const sharedStrings: string[] = [];
  const strIndex: Map<string, number> = new Map();

  const si = (val: string): number => {
    if (strIndex.has(val)) return strIndex.get(val)!;
    const idx = sharedStrings.length;
    sharedStrings.push(val);
    strIndex.set(val, idx);
    return idx;
  };

  const colLetter = (n: number) => {
    let s = "";
    while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
    return s;
  };

  const sheetXmls: string[] = [];

  for (const sheet of sheets) {
    const allRows: Row[] = [sheet.headers, ...sheet.rows];
    let rowsXml = "";
    allRows.forEach((row, rIdx) => {
      let cellsXml = "";
      row.forEach((val, cIdx) => {
        const ref = `${colLetter(cIdx)}${rIdx + 1}`;
        if (val === null || val === undefined || val === "") {
          cellsXml += `<c r="${ref}"/>`;
        } else if (typeof val === "number") {
          cellsXml += `<c r="${ref}" t="n"><v>${val}</v></c>`;
        } else {
          cellsXml += `<c r="${ref}" t="s"><v>${si(String(val))}</v></c>`;
        }
      });
      rowsXml += `<row r="${rIdx + 1}">${cellsXml}</row>`;
    });
    sheetXmls.push(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`
    );
  }

  // [Content_Types].xml
  let ctParts = sheets
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join("");
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>${ctParts}</Types>`);

  // _rels/.rels
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);

  // xl/_rels/workbook.xml.rels
  let wbRels = sheets
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join("");
  wbRels += `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`;
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels}</Relationships>`);

  // xl/workbook.xml
  const sheetsTag = sheets
    .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetsTag}</sheets></workbook>`);

  // xl/sharedStrings.xml
  const ssXml = sharedStrings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("");
  zip.file("xl/sharedStrings.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${ssXml}</sst>`);

  // Worksheets
  sheets.forEach((_, i) => {
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXmls[i]);
  });

  return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

// ---------------------------------------------------------------------------
// Data collectors
// ---------------------------------------------------------------------------

async function collectOrgData(organizationId: string) {
  const db = createAdminClient();

  const [clients, cases, payments, followups, documents, members, invites] = await Promise.all([
    db.from("clients").select("id,name,email,phone,created_at,status").eq("organization_id", organizationId).is("deleted_at", null).order("created_at", { ascending: false }),
    db.from("cases").select("id,case_number,title,status,stage,created_at,client_id").eq("organization_id", organizationId).is("deleted_at", null).order("created_at", { ascending: false }),
    db.from("payment_history").select("id,amount_paid,payment_date,charge_label,case_id,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    db.from("followups").select("id,title,type,status,scheduled_at,postponed_to,case_id,created_at").eq("organization_id", organizationId).order("scheduled_at", { ascending: true }),
    db.from("documents").select("id,file_name,file_type,uploaded_at,case_id").eq("organization_id", organizationId).is("deleted_at", null).order("uploaded_at", { ascending: false }),
    db.from("users").select("id,email,full_name,role,status,created_at").eq("organization_id", organizationId).is("deleted_at", null).order("created_at", { ascending: false }),
    db.from("organization_invites").select("id,email,role,status,invite_type,sent_at,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
  ]);

  return {
    clients: clients.data || [],
    cases: cases.data || [],
    payments: payments.data || [],
    followups: followups.data || [],
    documents: documents.data || [],
    members: members.data || [],
    invites: invites.data || [],
  };
}

function buildSheets(data: Awaited<ReturnType<typeof collectOrgData>>, orgName: string, reportMonth: string): Sheet[] {
  return [
    {
      name: "Summary",
      headers: ["Section", "Count / Value"],
      rows: [
        ["Report Month", reportMonth],
        ["Organization", orgName],
        ["Total Clients", data.clients.length],
        ["Total Cases", data.cases.length],
        ["Total Payments Recorded", data.payments.length],
        ["Total Revenue (₹)", data.payments.reduce((s, p) => s + Number(p.amount_paid || 0), 0).toFixed(2)],
        ["Total Follow-Ups", data.followups.length],
        ["Total Documents", data.documents.length],
        ["Team Members", data.members.length],
        ["Pending Invites", data.invites.filter((i) => i.status === "PENDING").length],
      ],
    },
    {
      name: "Clients",
      headers: ["Name", "Email", "Phone", "Status", "Created"],
      rows: data.clients.map((c) => [c.name, c.email, c.phone, c.status, c.created_at?.slice(0, 10)]),
    },
    {
      name: "Cases",
      headers: ["Case Number", "Title", "Status", "Stage", "Client ID", "Created"],
      rows: data.cases.map((c) => [c.case_number, c.title, c.status, c.stage, c.client_id, c.created_at?.slice(0, 10)]),
    },
    {
      name: "Payments",
      headers: ["Amount (₹)", "Date", "Charge Label", "Case ID"],
      rows: data.payments.map((p) => [Number(p.amount_paid || 0), p.payment_date?.slice(0, 10) || p.created_at?.slice(0, 10), p.charge_label, p.case_id]),
    },
    {
      name: "Follow-Ups",
      headers: ["Title", "Type", "Status", "Scheduled", "Case ID"],
      rows: data.followups.map((f) => [f.title, f.type, f.status, (f.scheduled_at || f.postponed_to)?.slice(0, 10), f.case_id]),
    },
    {
      name: "Documents",
      headers: ["File Name", "Type", "Uploaded", "Case ID"],
      rows: data.documents.map((d) => [d.file_name, d.file_type, d.uploaded_at?.slice(0, 10), d.case_id]),
    },
    {
      name: "Team",
      headers: ["Full Name", "Email", "Role", "Status", "Joined"],
      rows: data.members.map((m) => [m.full_name, m.email, m.role, m.status, m.created_at?.slice(0, 10)]),
    },
  ];
}

// ---------------------------------------------------------------------------
// Send via Resend with XLSX attachment
// ---------------------------------------------------------------------------



async function sendReportEmail(opts: {
  to: string;
  orgName: string;
  reportMonth: string;
  xlsxBytes: Uint8Array;
  organizationId: string;
}) {
  const [year, monthNum] = opts.reportMonth.split("-");
  const monthName = new Date(Number(year), Number(monthNum) - 1).toLocaleString("en-IN", { month: "long", year: "numeric" });

  const subject = `Monthly Operating Report: ${monthName}`;
  
  const html = `
    <div style="margin-bottom:24px">
      <p>Hello,</p>
      <p>Please find the monthly operating report for <strong>${opts.orgName}</strong> covering <strong>${monthName}</strong>. The full detailed report is attached as an Excel (.xlsx) file.</p>
    </div>
    
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin-bottom:24px">
      <h3 style="margin-top:0;color:#0B1F3A;font-size:16px">Report Highlights</h3>
      <ul style="padding-left:20px;margin-bottom:0;color:#334155;line-height:1.6">
        <li><strong>Detailed Analytics</strong>: Complete breakdown of cases, clients, and financials.</li>
        <li><strong>Payment History</strong>: Audit trail of all fees collected and pending.</li>
        <li><strong>Practice Health</strong>: Trends across documents, follow-ups, and team activity.</li>
      </ul>
    </div>

    <p>This report was generated on ${new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}.</p>
    <p style="color:#64748b;font-size:13px;margin-top:32px">Law Office Platform automation.</p>
  `;

  const fullHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <table width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:40px 12px">
    <tr>
      <td align="center">
        <table width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1)">
          <tr>
            <td style="background:#0B1F3A;padding:32px;color:#ffffff">
              <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#C9A34E;font-weight:800;margin-bottom:8px">Operational Intelligence</div>
              <div style="font-size:24px;font-weight:800;line-height:1.2">${subject}</div>
              <div style="font-size:14px;color:#94a3b8;margin-top:8px">${opts.orgName}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;font-size:15px;line-height:1.6;color:#1e293b">
              ${html}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px">
              This is an automated administrative report. If you have any questions, please contact support.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  let binary = "";
  opts.xlsxBytes.forEach((b) => { binary += String.fromCharCode(b); });
  const b64 = btoa(binary);

  const delivery = await sendEmail({
    to: opts.to,
    subject,
    html: fullHtml,
    organizationId: opts.organizationId,
    templateName: "monthly-report-manual",
    attachments: [
      {
        filename: `${opts.orgName.replaceAll(" ", "_")}_Report_${opts.reportMonth}.xlsx`,
        content: b64,
      },
    ],
  });

  return delivery?.id;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (request: Request): Promise<Response> => {
  // Handle preflight
  const options = handleOptions(request);
  if (options) return options;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const db = createAdminClient();

  try {
    const actor = await getActorContext(request);
    assertOrganizationAdmin(actor);
    await checkRateLimit(actor.user.id, "send-report", actor.ipAddress, 5, 300);

    const organizationId = actor.profile!.organization_id as string;
    const body = await request.json().catch(() => ({}));
    const now = new Date();
    const reportMonth = body.reportMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const isDownload = body.download === true;

    // Fetch org details
    const { data: org, error: orgError } = await db.from("organizations").select("id,name").eq("id", organizationId).single();
    if (orgError || !org) throw new Error("Organization not found.");

    const adminEmail = actor.profile!.email || actor.user.email;
    if (!adminEmail) throw new Error("Admin email not available.");

    // Collect all org data
    const data = await collectOrgData(organizationId);

    // Build XLSX
    const sheets = buildSheets(data, org.name, reportMonth);
    const xlsxBytes = await buildXlsx(sheets);

    if (isDownload) {
      // Record download event
      await recordAuditEvent({
        organizationId,
        actorId: actor.user.id,
        actorEmail: adminEmail,
        action: "MONTHLY_REPORT_DOWNLOADED",
        targetType: "report",
        severity: "INFO",
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { reportMonth },
      });

      return new Response(xlsxBytes, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="LawOffice_Report_${reportMonth}.xlsx"`,
          "Content-Length": xlsxBytes.byteLength.toString(),
        },
      });
    }

    // Send email with attachment
    const messageId = await sendReportEmail({
      to: adminEmail,
      orgName: org.name,
      reportMonth,
      xlsxBytes,
      organizationId,
    });

    await recordAuditEvent({
      organizationId,
      actorId: actor.user.id,
      actorEmail: adminEmail,
      action: "MONTHLY_REPORT_SENT",
      targetType: "report",
      severity: "INFO",
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { reportMonth, messageId, recipientEmail: adminEmail },
    });

    return jsonResponse({
      success: true,
      reportMonth,
      sentTo: adminEmail,
      message: `Report sent to ${adminEmail}`,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errName = error instanceof Error ? error.name : "UnknownError";
    console.error("[send-report] ERROR", errName + ":", errMsg);
    if (error instanceof Error && error.stack) console.error(error.stack);
    return jsonResponse({
      success: false,
      error: errMsg,
    }, 400);
  }
});
