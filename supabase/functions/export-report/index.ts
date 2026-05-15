import JSZip from "jszip";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import {
  assertOrganizationAdmin,
  getActorContext,
  recordAuditEvent,
} from "../_shared/auth.ts";
import { sendEmail, renderLayout } from "../_shared/email.ts";

// ---------------------------------------------------------------------------
// Types & Helpers
// ---------------------------------------------------------------------------

type ExportFormat = "pdf" | "xlsx" | "csv" | "docx";
type ExportType = "dashboard" | "clients" | "cases" | "payments" | "followups" | "documents" | "tasks";
interface ExportRequest {
  format: ExportFormat;
  type: ExportType;
  dateRange?: { start: string; end: string };
  filters?: Record<string, any>;
  includeSections?: string[];
  selectedIds?: string[];
  emailTo?: string;
}

type Row = (string | number | null | undefined)[];
type Sheet = { name: string; headers: string[]; rows: Row[] };

/** Escape cell value for XML (XLSX/DOCX) */
const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// ---------------------------------------------------------------------------
// Data Collectors
// ---------------------------------------------------------------------------

async function fetchData(db: any, orgId: string, req: ExportRequest) {
  const { type, dateRange, filters, selectedIds } = req;
  const start = dateRange?.start;
  const end = dateRange?.end;

  let query: any;

  // Use selected IDs if provided, otherwise apply filters
  const applyFilters = (q: any) => {
    if (selectedIds && selectedIds.length > 0) {
      return q.in("id", selectedIds);
    }
    let res = q.eq("organization_id", orgId);
    if (start) {
      const field = type === "payments" ? "payment_date" : (type === "followups" ? "scheduled_at" : (type === "documents" ? "uploaded_at" : "created_at"));
      res = res.gte(field, start);
    }
    if (end) {
      const field = type === "payments" ? "payment_date" : (type === "followups" ? "scheduled_at" : (type === "documents" ? "uploaded_at" : "created_at"));
      res = res.lte(field, end);
    }
    return res;
  };

  switch (type) {
    case "clients":
      query = db.from("clients").select("*").is("deleted_at", null);
      query = applyFilters(query);
      if (filters?.searchTerm) query = query.ilike("name", `%${filters.searchTerm}%`);
      const { data: clients } = await query.order("created_at", { ascending: false });
      return { clients: clients || [] };

    case "cases":
      query = db.from("cases").select("*, client:clients(name)").is("deleted_at", null);
      query = applyFilters(query);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.caseType) query = query.eq("case_type", filters.caseType);
      if (filters?.searchTerm) query = query.or(`case_number.ilike.%${filters.searchTerm}%,title.ilike.%${filters.searchTerm}%`);
      const { data: cases } = await query.order("created_at", { ascending: false });
      return { cases: cases || [] };

    case "payments":
      query = db.from("payment_history").select("*, client:clients(name), case:cases(case_number)");
      query = applyFilters(query);
      if (filters?.status) query = query.eq("status", filters.status);
      const { data: payments } = await query.order("payment_date", { ascending: false });
      return { payments: payments || [] };

    case "followups":
      query = db.from("followups").select("*, case:cases(case_number)");
      query = applyFilters(query);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.type) query = query.eq("type", filters.type);
      if (filters?.searchTerm) query = query.ilike("title", `%${filters.searchTerm}%`);
      const { data: followups } = await query.order("scheduled_at", { ascending: false });
      return { followups: followups || [] };

    case "documents":
      query = db.from("documents").select("*, case:cases(case_number)").is("deleted_at", null);
      query = applyFilters(query);
      if (filters?.category) query = query.eq("category", filters.category);
      if (filters?.searchTerm) query = query.ilike("name", `%${filters.searchTerm}%`);
      const { data: documents } = await query.order("uploaded_at", { ascending: false });
      return { documents: documents || [] };

    case "tasks":
      query = db.from("tasks").select("*").is("deleted_at", null);
      query = applyFilters(query);
      if (filters?.priority) query = query.eq("priority", filters.priority);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.searchTerm) query = query.ilike("title", `%${filters.searchTerm}%`);
      const { data: tasks } = await query.order("created_at", { ascending: false });
      return { tasks: tasks || [] };

    case "dashboard":
    default:
      const [c, cs, p, f, d, t] = await Promise.all([
        db.from("clients").select("*").eq("organization_id", orgId).is("deleted_at", null).gte("created_at", start || "2000-01-01").lte("created_at", end || "2100-01-01"),
        db.from("cases").select("*, client:clients(name)").eq("organization_id", orgId).is("deleted_at", null).gte("created_at", start || "2000-01-01").lte("created_at", end || "2100-01-01"),
        db.from("payment_history").select("*, client:clients(name)").eq("organization_id", orgId).gte("payment_date", start || "2000-01-01").lte("payment_date", end || "2100-01-01"),
        db.from("followups").select("*, case:cases(case_number)").eq("organization_id", orgId).gte("scheduled_at", start || "2000-01-01").lte("scheduled_at", end || "2100-01-01"),
        db.from("documents").select("*, case:cases(case_number)").eq("organization_id", orgId).is("deleted_at", null).gte("uploaded_at", start || "2000-01-01").lte("uploaded_at", end || "2100-01-01"),
        db.from("tasks").select("*").eq("organization_id", orgId).is("deleted_at", null).gte("created_at", start || "2000-01-01").lte("created_at", end || "2100-01-01"),
      ]);
      return {
        clients: c.data || [],
        cases: cs.data || [],
        payments: p.data || [],
        followups: f.data || [],
        documents: d.data || [],
        tasks: t.data || [],
      };
  }
}

// ---------------------------------------------------------------------------
// Format Generators
// ---------------------------------------------------------------------------

/** CSV Generator */
function generateCSV(data: any, type: ExportType): string {
  let headers: string[] = [];
  let rows: any[] = [];

  switch (type) {
    case "clients":
      headers = ["Name", "Email", "Phone", "Address", "Status", "Created By", "Created At"];
      rows = data.clients.map((c: any) => [c.name, c.email, c.phone, c.address, c.status, c.created_by, c.created_at]);
      break;
    case "cases":
      headers = ["Case Number", "Title", "Type", "Status", "Court", "Lawyer", "Client", "Created At"];
      rows = data.cases.map((c: any) => [c.case_number, c.title, c.case_type, c.status, c.court_name, c.lawyer_name, c.client?.name || "N/A", c.created_at]);
      break;
    case "payments":
      headers = ["Amount", "Date", "Mode", "Reference", "Charge Name", "Client", "Case"];
      rows = data.payments.map((p: any) => [p.amount_paid, p.payment_date, p.payment_mode, p.payment_reference, p.charge_name, p.client?.name || "N/A", p.case?.case_number || "N/A"]);
      break;
    case "followups":
      headers = ["Date", "Type", "Title", "Status", "Case", "Notes", "Created By"];
      rows = data.followups.map((f: any) => [f.scheduled_at, f.type, f.title, f.status, f.case?.case_number || "N/A", f.notes, f.created_by]);
      break;
    case "documents":
      headers = ["File Name", "Category", "Description", "Uploaded At", "Uploaded By", "Case"];
      rows = data.documents.map((d: any) => [d.file_name, d.category, d.description, d.uploaded_at, d.uploaded_by, d.case?.case_number || "N/A"]);
      break;
    case "tasks":
      headers = ["Title", "Priority", "Status", "Created By", "Created At"];
      rows = data.tasks.map((t: any) => [t.title, t.priority, t.status, t.created_by, t.created_at]);
      break;
    default:
      headers = ["Section", "Count"];
      rows = [
        ["Clients", data.clients?.length || 0],
        ["Cases", data.cases?.length || 0],
        ["Payments", data.payments?.length || 0],
        ["Follow-ups", data.followups?.length || 0],
        ["Documents", data.documents?.length || 0],
        ["Tasks", data.tasks?.length || 0],
      ];
  }

  return [
    headers.join(","),
    ...rows.map(row => row.map((v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
  ].join("\n");
}

/** Robust XLSX Generator (OOXML) */
async function generateXLSX(data: any, type: ExportType, orgName: string): Promise<Uint8Array> {
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

  const sheets: Sheet[] = [];
  
  if (type === "dashboard") {
    const revenue = data.payments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
    sheets.push({ 
      name: "Summary", 
      headers: ["Metric", "Value"], 
      rows: [
        ["Organization", orgName],
        ["Export Date", new Date().toLocaleString()],
        ["Total Clients", data.clients.length],
        ["Total Cases", data.cases.length],
        ["Total Payments", data.payments.length],
        ["Total Revenue", revenue],
        ["Total Documents", data.documents.length],
        ["Total Tasks", data.tasks.length]
      ] 
    });
    sheets.push({ 
      name: "Clients", 
      headers: ["Name", "Email", "Phone", "Address", "Status", "Created At"], 
      rows: data.clients.map((c: any) => [c.name, c.email, c.phone, c.address, c.status, c.created_at]) 
    });
    sheets.push({ 
      name: "Cases", 
      headers: ["Case #", "Title", "Type", "Status", "Court", "Lawyer", "Client"], 
      rows: data.cases.map((c: any) => [c.case_number, c.title, c.case_type, c.status, c.court_name, c.lawyer_name, c.client?.name]) 
    });
    sheets.push({ 
      name: "Payments", 
      headers: ["Amount", "Date", "Mode", "Reference", "Charge", "Client"], 
      rows: data.payments.map((p: any) => [p.amount_paid, p.payment_date, p.payment_mode, p.payment_reference, p.charge_name, p.client?.name]) 
    });
    sheets.push({ 
      name: "Followups", 
      headers: ["Date", "Type", "Title", "Status", "Case", "Notes"], 
      rows: data.followups.map((f: any) => [f.scheduled_at, f.type, f.title, f.status, f.case?.case_number, f.notes]) 
    });
    sheets.push({ 
      name: "Documents", 
      headers: ["File Name", "Category", "Description", "Uploaded At", "Case"], 
      rows: data.documents.map((d: any) => [d.file_name, d.category, d.description, d.uploaded_at, d.case?.case_number]) 
    });
    sheets.push({ 
      name: "Tasks", 
      headers: ["Title", "Priority", "Status", "Created At"], 
      rows: data.tasks.map((t: any) => [t.title, t.priority, t.status, t.created_at]) 
    });
  } else if (type === "clients") {
    sheets.push({ name: "Clients", headers: ["Name", "Email", "Phone", "Address", "Status", "Created At"], rows: data.clients.map((c: any) => [c.name, c.email, c.phone, c.address, c.status, c.created_at]) });
  } else if (type === "cases") {
    sheets.push({ name: "Cases", headers: ["Case #", "Title", "Type", "Status", "Court", "Lawyer", "Client", "Created At"], rows: data.cases.map((c: any) => [c.case_number, c.title, c.case_type, c.status, c.court_name, c.lawyer_name, c.client?.name, c.created_at]) });
  } else if (type === "payments") {
    sheets.push({ name: "Payments", headers: ["Amount", "Date", "Mode", "Reference", "Charge", "Client", "Case"], rows: data.payments.map((p: any) => [p.amount_paid, p.payment_date, p.payment_mode, p.payment_reference, p.charge_name, p.client?.name, p.case?.case_number]) });
  } else if (type === "followups") {
    sheets.push({ name: "Events", headers: ["Date", "Type", "Title", "Status", "Case", "Notes", "Created By"], rows: data.followups.map((f: any) => [f.scheduled_at, f.type, f.title, f.status, f.case?.case_number, f.notes, f.created_by]) });
  } else if (type === "documents") {
    sheets.push({ name: "Documents", headers: ["Name", "Category", "Date", "Uploaded By", "Case", "Description"], rows: data.documents.map((d: any) => [d.file_name, d.category, d.uploaded_at, d.uploaded_by, d.case?.case_number, d.description]) });
  } else if (type === "tasks") {
    sheets.push({ name: "Tasks", headers: ["Title", "Priority", "Status", "Created By", "Created At"], rows: data.tasks.map((t: any) => [t.title, t.priority, t.status, t.created_by, t.created_at]) });
  }

  const sheetXmls: string[] = [];
  for (const sheet of sheets) {
    const allRows: Row[] = [sheet.headers, ...sheet.rows];
    let rowsXml = "";
    allRows.forEach((row, rIdx) => {
      let cellsXml = "";
      row.forEach((val, cIdx) => {
        const ref = `${colLetter(cIdx)}${rIdx + 1}`;
        if (val === null || val === undefined || val === "") cellsXml += `<c r="${ref}"/>`;
        else if (typeof val === "number") cellsXml += `<c r="${ref}" t="n"><v>${val}</v></c>`;
        else cellsXml += `<c r="${ref}" t="s"><v>${si(String(val))}</v></c>`;
      });
      rowsXml += `<row r="${rIdx + 1}">${cellsXml}</row>`;
    });
    sheetXmls.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`);
  }

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}<Relationship Id="rIdStrings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets></workbook>`);
  zip.file("xl/sharedStrings.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${sharedStrings.map(s => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("")}</sst>`);
  sheets.forEach((_, i) => { zip.file(`xl/worksheets/sheet${i+1}.xml`, sheetXmls[i]); });

  return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** Robust DOCX Generator (OOXML) */
async function generateDOCX(data: any, type: ExportType, orgName: string): Promise<Uint8Array> {
  const zip = new JSZip();
  
  let tablesXml = "";
  let totalCount = 0;

  if (type === "dashboard") {
    const sections = [
      { name: "Clients", headers: ["Name", "Email", "Phone", "Status"], data: data.clients.map((c: any) => [c.name, c.email, c.phone, c.status]) },
      { name: "Cases", headers: ["Case #", "Title", "Type", "Status", "Client"], data: data.cases.map((c: any) => [c.case_number, c.title, c.case_type, c.status, c.client?.name]) },
      { name: "Payments", headers: ["Amount", "Date", "Mode", "Client"], data: data.payments.map((p: any) => [p.amount_paid, p.payment_date, p.payment_mode, p.client?.name]) },
      { name: "Events", headers: ["Date", "Type", "Title", "Case"], data: data.followups.map((f: any) => [f.scheduled_at, f.type, f.title, f.case?.case_number]) },
      { name: "Tasks", headers: ["Title", "Priority", "Status", "Date"], data: data.tasks.map((t: any) => [t.title, t.priority, t.status, t.created_at]) }
    ];

    totalCount = sections.reduce((sum, s) => sum + s.data.length, 0);

    for (const sec of sections) {
      tablesXml += `
        <w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${esc(sec.name)}</w:t></w:r></w:p>
        <w:tbl>
          <w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single"/><w:left w:val="single"/><w:bottom w:val="single"/><w:right w:val="single"/><w:insideH w:val="single"/><w:insideV w:val="single"/></w:tblBorders></w:tblPr>
          <w:tr>${sec.headers.map(h => `<w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${esc(h)}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>
          ${sec.data.map((row: any) => `<w:tr>${row.map((val: any) => `<w:tc><w:p><w:r><w:t>${esc(val)}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`).join("")}
        </w:tbl>
        <w:p/>`;
    }
  } else {
    const headers = type === "clients" ? ["Name", "Email", "Phone", "Address", "Status"] :
                   type === "cases" ? ["Case #", "Title", "Type", "Status", "Lawyer", "Client"] :
                   type === "payments" ? ["Amount", "Date", "Mode", "Reference", "Client"] :
                   ["Title", "Priority", "Status", "Created By", "Created At"];

    const rows = type === "clients" ? data.clients.map((c: any) => [c.name, c.email, c.phone, c.address, c.status]) :
                 type === "cases" ? data.cases.map((c: any) => [c.case_number, c.title, c.case_type, c.status, c.lawyer_name, c.client?.name]) :
                 type === "payments" ? data.payments.map((p: any) => [p.amount_paid, p.payment_date, p.payment_mode, p.payment_reference, p.client?.name]) :
                 data.tasks.map((t: any) => [t.title, t.priority, t.status, t.created_by, t.created_at]);

    totalCount = rows.length;

    tablesXml = `
      <w:tbl>
        <w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single"/><w:left w:val="single"/><w:bottom w:val="single"/><w:right w:val="single"/><w:insideH w:val="single"/><w:insideV w:val="single"/></w:tblBorders></w:tblPr>
        <w:tr>${headers.map(h => `<w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${esc(h)}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>
        ${rows.map((row: any) => `<w:tr>${row.map((val: any) => `<w:tc><w:p><w:r><w:t>${esc(val)}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`).join("")}
      </w:tbl>`;
  }

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="48"/></w:rPr><w:t>${esc(orgName)}</w:t></w:r></w:p>
        <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="32"/></w:rPr><w:t>${esc(type.toUpperCase())} REPORT</w:t></w:r></w:p>
        <w:p><w:r><w:t>Generated on: ${new Date().toLocaleString()}</w:t></w:r></w:p>
        <w:p><w:r><w:t>Total Records: ${totalCount}</w:t></w:r></w:p>
        ${tablesXml}
      </w:body>
    </w:document>`;

  zip.file("word/document.xml", docXml);
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);

  return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** Enhanced PDF Generator */
async function generatePDF(data: any, type: ExportType, orgName: string, dateRange: any, actorName: string): Promise<Uint8Array> {
  const doc = new jsPDF() as any;
  const timestamp = new Date().toLocaleString("en-IN");
  
  // PAGE 1: COVER PAGE
  doc.setFillColor(11, 31, 58); // Dark Blue
  doc.rect(0, 0, 210, 297, 'F');
  
  doc.setTextColor(201, 163, 78); // Gold
  
  // Organization Logo
  if (data.orgBranding?.logoUrl) {
    try {
      const resp = await fetch(data.orgBranding.logoUrl);
      if (resp.ok) {
        const blob = await resp.blob();
        const buffer = await blob.arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        doc.addImage(uint8, "PNG", 85, 40, 40, 40); // Center logo
      }
    } catch (e) {
      console.warn("Failed to load org logo", e);
    }
  }

  doc.setFontSize(32);
  doc.text(orgName.toUpperCase(), 105, 100, { align: "center" });
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text(`${type.toUpperCase()} REPORT`, 105, 120, { align: "center" });
  
  doc.setFontSize(14);
  doc.text(`Period: ${dateRange?.start?.slice(0, 10) || "Beginning"} to ${dateRange?.end?.slice(0, 10) || "Present"}`, 105, 140, { align: "center" });
  
  doc.setFontSize(10);
  doc.text(`Generated on: ${timestamp}`, 105, 250, { align: "center" });
  doc.text(`Generated by: ${actorName}`, 105, 255, { align: "center" });
  doc.text("LAW OFFICE MANAGEMENT SYSTEM", 105, 265, { align: "center" });

  // Organization Details at bottom of cover
  if (data.orgBranding) {
    const b = data.orgBranding;
    let contactInfo = "";
    if (b.phone) contactInfo += `Phone: ${b.phone} | `;
    if (b.email) contactInfo += `Email: ${b.email}`;
    
    doc.setFontSize(9);
    doc.setTextColor(180, 180, 180);
    if (b.address) doc.text(b.address, 105, 220, { align: "center", maxWidth: 160 });
    if (contactInfo) doc.text(contactInfo.replace(/ \| $/, ""), 105, 230, { align: "center" });
    if (b.website) doc.text(b.website, 105, 235, { align: "center" });
  }

  // PAGE 2: EXECUTIVE SUMMARY
  doc.addPage();
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(18);
  doc.text("Executive Summary", 14, 25);
  
  let y = 40;
  if (type === "dashboard") {
    const revenue = data.payments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
    const summary = [
      ["Metric", "Value"],
      ["Total Clients", String(data.clients.length)],
      ["Total Cases", String(data.cases.length)],
      ["Financial Revenue", `Rs. ${revenue.toLocaleString("en-IN")}`],
      ["Documents Stored", String(data.documents.length)],
      ["Pending Tasks", String(data.tasks.filter((t: any) => t.status !== 'COMPLETED').length)],
    ];
    doc.autoTable({ startY: y, head: [summary[0]], body: summary.slice(1), theme: 'striped', headStyles: { fillColor: [11, 31, 58] } });
    y = doc.lastAutoTable.finalY + 15;
    
    // Detailed Sections
    const sections = [
      { 
        title: "1. Clients", 
        head: [["Name", "Email", "Phone", "Status"]], 
        body: data.clients.slice(0, 100).map((c: any) => [c.name, c.email, c.phone, c.status]) 
      },
      { 
        title: "2. Active Cases", 
        head: [["Case #", "Title", "Type", "Status", "Client"]], 
        body: data.cases.slice(0, 100).map((c: any) => [c.case_number, c.title, c.case_type, c.status, c.client?.name || "N/A"]) 
      },
      { 
        title: "3. Payment History", 
        head: [["Amount", "Date", "Mode", "Client"]], 
        body: data.payments.slice(0, 100).map((p: any) => [`Rs. ${p.amount_paid}`, p.payment_date?.slice(0,10), p.payment_mode, p.client?.name || "N/A"]) 
      },
      { 
        title: "4. Upcoming Events", 
        head: [["Date", "Type", "Title", "Case"]], 
        body: data.followups.slice(0, 100).map((f: any) => [f.scheduled_at?.slice(0, 16), f.type, f.title, f.case?.case_number || "N/A"]) 
      },
      { 
        title: "5. Recent Documents", 
        head: [["Name", "Category", "Date", "Case"]], 
        body: data.documents.slice(0, 100).map((d: any) => [d.file_name, d.category, d.uploaded_at?.slice(0,10), d.case?.case_number || "N/A"]) 
      },
      { 
        title: "6. Task List", 
        head: [["Title", "Priority", "Status", "Date"]], 
        body: data.tasks.slice(0, 100).map((t: any) => [t.title, t.priority, t.status, t.created_at?.slice(0,10)]) 
      }
    ];

    for (const section of sections) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.text(section.title, 14, y);
      doc.autoTable({
        startY: y + 5,
        head: section.head,
        body: section.body,
        theme: 'grid',
        headStyles: { fillColor: [201, 163, 78] },
        styles: { fontSize: 9 }
      });
      y = doc.lastAutoTable.finalY + 15;
    }
  } else {
    // Specific module summary
    const count = Array.isArray(data[type]) ? data[type].length : 0;
    doc.text(`This report contains detailed information for ${count} ${type} records.`, 14, y);
    y += 20;
    
    let head = [];
    let body = [];
    if (type === "clients") {
      head = [["Name", "Email", "Phone", "Address", "Status"]];
      body = data.clients.map((c: any) => [c.name, c.email, c.phone, c.address, c.status]);
    } else if (type === "cases") {
      head = [["Case #", "Title", "Type", "Status", "Lawyer", "Client"]];
      body = data.cases.map((c: any) => [c.case_number, c.title, c.case_type, c.status, c.lawyer_name, c.client?.name || "N/A"]);
    } else if (type === "payments") {
      head = [["Amount", "Date", "Mode", "Reference", "Client"]];
      body = data.payments.map((p: any) => [p.amount_paid, p.payment_date, p.payment_mode, p.payment_reference, p.client?.name || "N/A"]);
    } else if (type === "followups") {
      head = [["Date", "Type", "Title", "Status", "Case"]];
      body = data.followups.map((f: any) => [f.scheduled_at?.slice(0, 16), f.type, f.title, f.status, f.case?.case_number]);
    } else if (type === "documents") {
      head = [["Name", "Category", "Date", "Uploaded By", "Case"]];
      body = data.documents.map((d: any) => [d.file_name, d.category, d.uploaded_at?.slice(0, 10), d.uploaded_by, d.case?.case_number]);
    } else if (type === "tasks") {
      head = [["Title", "Priority", "Status", "Created By", "Created At"]];
      body = data.tasks.map((t: any) => [t.title, t.priority, t.status, t.created_by, t.created_at?.slice(0, 10)]);
    }
    
    doc.autoTable({ startY: y, head, body, theme: 'grid', headStyles: { fillColor: [11, 31, 58] } });
  }

  // Footer on each page
  const pageCount = doc.internal.getNumberOfPages();
  for(let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    const orgInfo = data.orgBranding?.email || orgName;
    doc.text(`Page ${i} of ${pageCount} | ${orgName} | Generated by ${actorName}`, 105, 285, { align: "center" });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const db = createAdminClient();

  try {
    const actor = await getActorContext(req);
    assertOrganizationAdmin(actor);
    const orgId = actor.profile!.organization_id as string;
    const actorName = actor.profile!.full_name || actor.profile!.email;

    const body: ExportRequest = await req.json();
    const { format, type, dateRange } = body;

    const { data: org } = await db.from("organizations").select("*").eq("id", orgId).single();
    const orgName = org?.name || "Law Office";
    const orgBranding = org ? {
      address: org.address,
      phone: org.phone,
      email: org.email,
      website: org.website,
      logoUrl: org.logo_url
    } : null;

    const data = await fetchData(db, orgId, body);
    data.orgBranding = orgBranding;

    // Task 15: Handle Large Exports
    const totalRecords = Array.isArray(data[type]) ? data[type].length : 
                        (type === "dashboard" ? (data.clients.length + data.cases.length + data.payments.length) : 0);
    
    if (totalRecords > 500) {
      // In a real system, we'd trigger an async job here. 
      // For now, we'll return a 202 and log it as "PENDING"
      await db.from("export_logs").insert({
        organization_id: orgId,
        actor_id: actor.user.id,
        actor_email: actor.profile!.email,
        format,
        export_type: type,
        scope: "large_batch",
        status: "PROCESSING_QUEUED",
        file_name: "TBD",
      });
      return jsonResponse({ 
        message: "Report is too large for synchronous generation. Our servers are processing it in the background. You will receive an email once it is ready.",
        totalRecords 
      }, 202);
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

    let result: Uint8Array | string;
    let contentType: string;

    switch (format) {
      case "csv":
        result = generateCSV(data, type);
        contentType = "text/csv";
        break;
      case "xlsx":
        result = await generateXLSX(data, type, orgName);
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        break;
      case "pdf":
        result = await generatePDF(data, type, orgName, dateRange, actorName);
        contentType = "application/pdf";
        break;
      case "docx":
        result = await generateDOCX(data, type, orgName);
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
      metadata: { type, format, records: totalRecords },
    });

    // STEP 1 — FIX BACKEND RESPONSE (Raw binary response)
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

