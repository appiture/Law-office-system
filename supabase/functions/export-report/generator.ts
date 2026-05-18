import JSZip from "jszip";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

// ---------------------------------------------------------------------------
// Types & Helpers
// ---------------------------------------------------------------------------

export type ExportFormat = "pdf" | "xlsx" | "csv" | "docx";
export type ExportType = "dashboard" | "clients" | "cases" | "payments" | "hearings" | "documents" | "tasks" | "team" | "platform";

export interface ExportRequest {
  format: ExportFormat;
  type: ExportType;
  dateRange?: { start: string; end: string };
  filters?: Record<string, any>;
  includeSections?: string[];
  selectedIds?: string[];
  emailTo?: string;
}

export type Row = (string | number | null | undefined)[];
export type Sheet = { name: string; headers: string[]; rows: Row[] };

/** Escape cell value for XML (XLSX/DOCX) */
const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const detailValue = (row: any, ...keys: string[]) => {
  const details = row?.details || {};
  for (const key of keys) {
    const value = details?.[key] ?? details?.[key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
};

// ---------------------------------------------------------------------------
// Data Collectors
// ---------------------------------------------------------------------------

export async function fetchData(db: any, orgId: string, req: ExportRequest) {
  const { type, dateRange, filters, selectedIds } = req;
  const start = dateRange?.start;
  const end = dateRange?.end;

  let query: any;
  const dateFieldForType = (value: string) =>
    value === "payments" ? "payment_date" :
    value === "hearings" ? "date" :
    "created_at";

  // Use selected IDs if provided, otherwise apply filters
  const applyFilters = (q: any) => {
    if (selectedIds && selectedIds.length > 0) {
      return q.in("id", selectedIds);
    }
    let res = q.eq("organization_id", orgId);
    if (start) {
      res = res.gte(dateFieldForType(type), start);
    }
    if (end) {
      res = res.lte(dateFieldForType(type), end);
    }
    return res;
  };

  switch (type) {
    case "clients":
      query = db.from("clients").select(`
        id, name, phone, email, address, notes, details, created_at, created_by
      `).is("deleted_at", null);
      query = applyFilters(query);
      if (filters?.searchTerm) query = query.ilike("name", `%${filters.searchTerm}%`);
      const { data: clients } = await query.order("created_at", { ascending: false });
      return { clients: clients || [] };

    case "cases":
      query = db.from("cases").select(`
        id, case_number, case_type, status, court_name,
        lawyer_name, details, created_at, updated_at,
        client:clients(id, name, phone, email)
      `).is("deleted_at", null);
      query = applyFilters(query);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.caseType) query = query.eq("case_type", filters.caseType);
      if (filters?.searchTerm) query = query.or(`case_number.ilike.%${filters.searchTerm}%,case_type.ilike.%${filters.searchTerm}%,court_name.ilike.%${filters.searchTerm}%`);
      const { data: cases } = await query.order("created_at", { ascending: false });
      return { cases: cases || [] };

    case "payments":
      query = db.from("payment_history").select(`
        id, organization_id, amount_paid, payment_date, timestamp, payment_mode, payment_reference, charge_name, created_by,
        payment_charge:payment_charges(
          id, name,
          case:cases(id, case_number, client:clients(id, name))
        )
      `).eq("organization_id", orgId);
      {
        const { data: payments } = await query
          .order("payment_date", { ascending: false })
          .limit(2000);
        const normalized = (payments || []).map((p: any) => ({
          ...p,
          charge_name: p.charge_name || p.payment_charge?.name || "",
          payment_date: p.payment_date || p.timestamp,
          case: p.payment_charge?.case || null,
          client: p.payment_charge?.case?.client || null,
        })).filter((p: any) => p.case != null);
        return { payments: normalized };
      }

    case "hearings":
      query = db.from("hearings").select(`
        id, type, title, status, notes, date, scheduled_at, postponed_to, created_at, created_by,
        case:cases(id, case_number, client:clients(id, name))
      `);
      query = applyFilters(query);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.type) query = query.eq("type", filters.type);
      if (filters?.searchTerm) query = query.ilike("title", `%${filters.searchTerm}%`);
      const { data: hearings } = await query.order("date", { ascending: false });
      return { hearings: hearings || [] };

    case "documents":
      query = db.from("documents").select(`
        id, file_name, category, description, uploaded_by, created_at,
        case:cases(id, case_number, client:clients(id, name))
      `).is("deleted_at", null);
      query = applyFilters(query);
      if (filters?.category) query = query.eq("category", filters.category);
      if (filters?.searchTerm) query = query.ilike("file_name", `%${filters.searchTerm}%`);
      const { data: documents } = await query.order("created_at", { ascending: false });
      return { documents: documents || [] };

    case "tasks":
      query = db.from("tasks").select(`
        id, title, priority, status, due_date, assigned_to, created_by, created_at
      `).is("deleted_at", null);
      query = applyFilters(query);
      if (filters?.priority) query = query.eq("priority", filters.priority);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.searchTerm) query = query.ilike("title", `%${filters.searchTerm}%`);
      const { data: tasks } = await query.order("created_at", { ascending: false });
      return { tasks: tasks || [] };

    case "team":
      const [members, invites] = await Promise.all([
        db.from("users").select("id, email, full_name, role, status, created_at").eq("organization_id", orgId).is("deleted_at", null).order("created_at", { ascending: false }),
        db.from("organization_invites").select("id, email, role, status, invite_type, sent_at, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }),
      ]);
      return { members: members.data || [], invites: invites.data || [] };

    case "platform":
      const [orgs, totalUsers, newRegs, alerts] = await Promise.all([
        db.from("organizations").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
        db.from("users").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
        db.from("users").select("id", { count: "exact", head: true }).gte("created_at", start || "2000-01-01").lte("created_at", end || "2100-01-01"),
        db.from("audit_events").select("id, severity, action, metadata, created_at").in("severity", ["WARN", "ERROR", "SECURITY"]).gte("created_at", start || "2000-01-01").lte("created_at", end || "2100-01-01"),
      ]);
      return { active_organizations: orgs.count || 0, active_users: totalUsers.count || 0, new_registrations: newRegs.count || 0, security_alerts: alerts.data || [] };

    case "dashboard":
    default:
      const [c, cs, p, f, d, t, m, i] = await Promise.all([
        db.from("clients").select("id, name, phone, email, address, details, created_at").eq("organization_id", orgId).is("deleted_at", null).gte("created_at", start || "2000-01-01").lte("created_at", end || "2100-01-01"),
        db.from("cases").select("id, case_number, case_type, status, court_name, lawyer_name, details, created_at, client:clients(id, name)").eq("organization_id", orgId).is("deleted_at", null).gte("created_at", start || "2000-01-01").lte("created_at", end || "2100-01-01"),
        db.from("payment_history").select("id, amount_paid, payment_date, timestamp, payment_mode, payment_reference, charge_name, payment_charge:payment_charges(id, name, case:cases(id, case_number, client:clients(id, name)))").eq("organization_id", orgId).gte("payment_date", start || "2000-01-01").lte("payment_date", end || "2100-01-01").limit(500),
        db.from("hearings").select("id, type, title, status, notes, date, scheduled_at, created_at, case:cases(id, case_number, client:clients(id, name))").eq("organization_id", orgId).gte("date", start || "2000-01-01").lte("date", end || "2100-01-01"),
        db.from("documents").select("id, file_name, category, description, uploaded_by, created_at, case:cases(id, case_number)").eq("organization_id", orgId).is("deleted_at", null).gte("created_at", start || "2000-01-01").lte("created_at", end || "2100-01-01"),
        db.from("tasks").select("id, title, priority, status, due_date, assigned_to, created_by, created_at").eq("organization_id", orgId).is("deleted_at", null).gte("created_at", start || "2000-01-01").lte("created_at", end || "2100-01-01"),
        db.from("users").select("id, email, full_name, role, status, created_at").eq("organization_id", orgId).is("deleted_at", null),
        db.from("organization_invites").select("id, email, role, status, created_at").eq("organization_id", orgId),
      ]);
      const rawPayments = (p.data || []).map((pay: any) => ({
        ...pay,
        charge_name: pay.charge_name || pay.payment_charge?.name || "",
        payment_date: pay.payment_date || pay.timestamp,
        case: pay.payment_charge?.case || null,
        client: pay.payment_charge?.case?.client || null,
      }));
      return {
        clients: c.data || [],
        cases: cs.data || [],
        payments: rawPayments,
        hearings: f.data || [],
        documents: d.data || [],
        tasks: t.data || [],
        members: m.data || [],
        invites: i.data || [],
      };
  }
}

// ---------------------------------------------------------------------------
// Format Transformers
// ---------------------------------------------------------------------------

export function formatData(type: string, data: any): Sheet[] {
  switch (type) {
    case "clients":
      return [{
        name: "Clients",
        headers: ["ID", "Name", "Phone", "Email", "Address", "City", "Occupation", "Joined At"],
        rows: (data.clients || []).map((c: any) => [c.id, c.name, c.phone, c.email, c.address, detailValue(c, "city"), detailValue(c, "occupation"), c.created_at])
      }];
    case "cases":
      return [{
        name: "Cases",
        headers: ["Case No", "Title", "Type", "Status", "Client", "Court", "Lawyer", "Next Hearing", "Created At"],
        rows: (data.cases || []).map((c: any) => [c.case_number, detailValue(c, "title", "caseTitle"), c.case_type, c.status, c.client?.name, c.court_name, c.lawyer_name, detailValue(c, "nextHearingDate", "next_hearing_date"), c.created_at])
      }];
    case "payments":
      return [{
        name: "Payments",
        headers: ["ID", "Amount", "Date", "Mode", "Reference", "Status", "Charge", "Case No", "Client"],
        rows: (data.payments || []).map((p: any) => [p.id, p.amount_paid, p.payment_date || p.timestamp, p.payment_mode, p.payment_reference, "", p.charge_name, p.case?.case_number, p.client?.name])
      }];
    case "hearings":
      return [{
        name: "Hearings",
        headers: ["ID", "Type", "Title", "Status", "Date", "Case No", "Client"],
        rows: (data.hearings || []).map((h: any) => [h.id, h.type, h.title, h.status, h.date || h.scheduled_at, h.case?.case_number, h.case?.client?.name])
      }];
    case "documents":
      return [{
        name: "Documents",
        headers: ["ID", "File Name", "Category", "Description", "Uploaded At", "Case No"],
        rows: (data.documents || []).map((d: any) => [d.id, d.file_name, d.category, d.description, d.created_at, d.case?.case_number])
      }];
    case "tasks":
      return [{
        name: "Tasks",
        headers: ["ID", "Title", "Priority", "Status", "Due Date", "Created At"],
        rows: (data.tasks || []).map((t: any) => [t.id, t.title, t.priority, t.status, t.due_date, t.created_at])
      }];
    case "team":
      return [
        {
          name: "Members",
          headers: ["ID", "Email", "Full Name", "Role", "Status", "Created At"],
          rows: (data.members || []).map((m: any) => [m.id, m.email, m.full_name, m.role, m.status, m.created_at])
        },
        {
          name: "Invites",
          headers: ["ID", "Email", "Role", "Status", "Sent At"],
          rows: (data.invites || []).map((v: any) => [v.id, v.email, v.role, v.status, v.sent_at])
        }
      ];
    case "platform":
      return [
        {
          name: "Security Alerts",
          headers: ["ID", "Severity", "Action", "Date", "Details"],
          rows: (data.security_alerts || []).map((a: any) => [a.id, a.severity, a.action, a.created_at, JSON.stringify(a.metadata)])
        }
      ];
    case "dashboard":
    default:
      return [
        {
          name: "Summary",
          headers: ["Metric", "Value"],
          rows: [
            ["Total Clients", data.clients?.length ?? 0],
            ["Total Cases", data.cases?.length ?? 0],
            ["Total Payments", data.payments?.length ?? 0],
            ["Total Hearings", data.hearings?.length ?? 0],
            ["Total Documents", data.documents?.length ?? 0],
            ["Total Tasks", data.tasks?.length ?? 0],
            ["Team Members", data.members?.length ?? 0],
            ["Pending Invites", data.invites?.length ?? 0],
            ["Total Revenue (₹)", (data.payments || []).reduce((sum: number, p: any) => sum + Number(p.amount_paid || 0), 0)],
          ]
        },
        {
          name: "Clients",
          headers: ["ID", "Name", "Phone", "Email", "Address", "City", "Occupation", "Registered"],
          rows: (data.clients || []).map((c: any) => [
            c.id, c.name, c.phone, c.email, c.address,
            detailValue(c, "city"), detailValue(c, "occupation"), c.created_at
          ])
        },
        {
          name: "Cases",
          headers: ["Case No", "Client", "Type", "Status", "Court", "Lawyer", "Next Hearing", "Created At"],
          rows: (data.cases || []).map((c: any) => [
            c.case_number, c.client?.name,
            c.case_type, c.status, c.court_name, c.lawyer_name,
            detailValue(c, "nextHearingDate", "next_hearing_date"), c.created_at
          ])
        },
        {
          name: "Payments",
          headers: ["Amount (₹)", "Date", "Mode", "Reference", "Charge", "Case No", "Client"],
          rows: (data.payments || []).map((p: any) => [
            p.amount_paid, p.payment_date || p.timestamp,
            p.payment_mode, p.payment_reference,
            p.charge_name, p.case?.case_number, p.client?.name
          ])
        },
        {
          name: "Hearings",
          headers: ["Date", "Type", "Title", "Status", "Notes", "Case No", "Client"],
          rows: (data.hearings || []).map((h: any) => [
            h.date || h.scheduled_at, h.type, h.title,
            h.status, (h.notes || "").slice(0, 60),
            h.case?.case_number, h.case?.client?.name
          ])
        },
        {
          name: "Documents",
          headers: ["File Name", "Category", "Description", "Uploaded", "Case No"],
          rows: (data.documents || []).map((d: any) => [
            d.file_name, d.category, d.description, d.created_at, d.case?.case_number
          ])
        },
        {
          name: "Tasks",
          headers: ["Title", "Priority", "Status", "Due Date", "Created At"],
          rows: (data.tasks || []).map((t: any) => [
            t.title, t.priority, t.status, t.due_date, t.created_at
          ])
        },
        {
          name: "Team",
          headers: ["Name", "Email", "Role", "Status", "Joined"],
          rows: (data.members || []).map((m: any) => [
            m.full_name, m.email, m.role, m.status, m.created_at
          ])
        },
      ];
  }
}

// ---------------------------------------------------------------------------
// File Generators
// ---------------------------------------------------------------------------

export function generateCSV(sheets: Sheet[]): string {
  // Export ALL sheets separated by section headers for complete data
  return sheets.map(s => {
    const sectionHeader = `"=== ${s.name.toUpperCase()} ==="`;
    const headerRow = s.headers.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
    const dataRows = s.rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    return [sectionHeader, headerRow, ...dataRows].join("\n");
  }).join("\n\n");
}

export async function generateXLSX(sheets: Sheet[]): Promise<Uint8Array> {
  const zip = new JSZip();
  // Minimalistic XLSX implementation
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`);

  sheets.forEach((s, i) => {
    let sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`;
    // Header row
    sheetXml += `<row r="1">` + s.headers.map((h, hi) => `<c r="${String.fromCharCode(65 + hi)}1" s="1" t="inlineStr"><is><t>${esc(h)}</t></is></c>`).join("") + `</row>`;
    // Data rows
    s.rows.forEach((r, ri) => {
      sheetXml += `<row r="${ri + 2}">` + r.map((v, ci) => `<c r="${String.fromCharCode(65 + ci)}${ri + 2}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join("") + `</row>`;
    });
    sheetXml += `</sheetData></worksheet>`;
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml);
  });

  return await zip.generateAsync({ type: "uint8array" });
}

export function generatePDF(sheets: Sheet[], title: string): Uint8Array {
  const doc = new jsPDF() as any;
  const dateStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  sheets.forEach((s, i) => {
    if (i > 0) doc.addPage();

    // Header bar
    doc.setFillColor(26, 35, 126);
    doc.rect(0, 0, 210, 22, "F");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text(title, 14, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(dateStr, 196, 14, { align: "right" });

    // Section title
    doc.setTextColor(26, 35, 126);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Section: ${s.name}`, 14, 32);

    doc.setTextColor(0, 0, 0);
    doc.autoTable({
      head: [s.headers],
      body: s.rows.map(r => r.map(v => String(v ?? ""))),
      startY: 37,
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 3 },
      headStyles: { fillColor: [26, 35, 126], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      margin: { left: 14, right: 14 },
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i + 1} of ${sheets.length} sections`, 14, 290);
    doc.text("Law Office Management System — Confidential", 196, 290, { align: "right" });
  });

  // Must return Uint8Array (not ArrayBuffer) for consistent Response building
  const arrBuf = doc.output("arraybuffer") as ArrayBuffer;
  return new Uint8Array(arrBuf);
}

export async function generateDOCX(sheets: Sheet[], title: string): Promise<Uint8Array> {
  const zip = new JSZip();
  const dateStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  // Required DOCX package files
  zip.file("[Content_Types].xml", [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
    `<Default Extension="xml" ContentType="application/xml"/>`,
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`,
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`,
    `</Types>`
  ].join(""));

  zip.file("_rels/.rels", [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`,
    `</Relationships>`
  ].join(""));

  // REQUIRED: word/_rels/document.xml.rels (without this DOCX is broken/unreadable)
  zip.file("word/_rels/document.xml.rels", [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    `</Relationships>`
  ].join(""));

  // Minimal styles.xml for proper heading rendering
  zip.file("word/styles.xml", [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`,
    `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>`,
    `<w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="1A237E"/></w:rPr></w:style>`,
    `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>`,
    `<w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="37474F"/></w:rPr></w:style>`,
    `</w:styles>`
  ].join(""));

  // Build document body
  let docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
  docXml += `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`;

  // Title block
  docXml += `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>`;
  docXml += `<w:r><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="1A237E"/></w:rPr><w:t>${esc(title)}</w:t></w:r></w:p>`;
  docXml += `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>`;
  docXml += `<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="888888"/></w:rPr><w:t>Generated: ${esc(dateStr)} | Law Office Management System</w:t></w:r></w:p>`;
  docXml += `<w:p/>`;

  sheets.forEach((s, idx) => {
    // Section heading
    docXml += `<w:p><w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="1A237E"/></w:rPr>`;
    docXml += `<w:t>${idx + 1}. ${esc(s.name)} (${s.rows.length} record${s.rows.length !== 1 ? "s" : ""})</w:t></w:r></w:p>`;

    // Table with borders
    docXml += `<w:tbl><w:tblPr>`;
    docXml += `<w:tblW w:w="9360" w:type="dxa"/>`;
    docXml += `<w:tblBorders>`;
    docXml += `<w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/>`;
    docXml += `<w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/>`;
    docXml += `<w:insideH w:val="single" w:sz="2"/><w:insideV w:val="single" w:sz="2"/>`;
    docXml += `</w:tblBorders></w:tblPr>`;

    // Header row (bold + shaded)
    docXml += `<w:tr>`;
    docXml += s.headers.map(h =>
      `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="1A237E"/></w:tcPr>` +
      `<w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="16"/></w:rPr>` +
      `<w:t>${esc(h)}</w:t></w:r></w:p></w:tc>`
    ).join("");
    docXml += `</w:tr>`;

    // Data rows (alternate shading)
    s.rows.forEach((r, ri) => {
      const fill = ri % 2 === 0 ? "F5F7FF" : "FFFFFF";
      docXml += `<w:tr>`;
      docXml += r.map(v =>
        `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:tcPr>` +
        `<w:p><w:r><w:rPr><w:sz w:val="16"/></w:rPr>` +
        `<w:t>${esc(v)}</w:t></w:r></w:p></w:tc>`
      ).join("");
      docXml += `</w:tr>`;
    });

    docXml += `</w:tbl><w:p/>`;
  });

  // Footer paragraph
  docXml += `<w:p><w:r><w:rPr><w:sz w:val="14"/><w:color w:val="AAAAAA"/></w:rPr>`;
  docXml += `<w:t>Law Office Management — Internal Confidential Document</w:t></w:r></w:p>`;
  docXml += `</w:body></w:document>`;

  zip.file("word/document.xml", docXml);
  return await zip.generateAsync({ type: "uint8array" });
}
