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

    case "payments": {
      // ── Step 1: Fetch cases that have at least one payment charge ─────────
      let casesQ = db.from("cases").select(`
        id, case_number, case_type, status, court_name, lawyer_name, details,
        client:clients(id, name, phone, email),
        payment_charges(
          id, name, is_lawyer_fee, total_amount, paid_amount, balance_amount,
          status, due_date, description, notes,
          payment_history(
            id, amount_paid, payment_date, timestamp, payment_mode,
            payment_reference, charge_name, created_by, notes
          )
        )
      `).is("deleted_at", null).eq("organization_id", orgId);

      // Date filter on cases' payment dates is tricky across nested; filter by case created_at
      if (filters?.status) casesQ = casesQ.eq("status", filters.status);
      if (filters?.searchTerm) casesQ = casesQ.or(`case_number.ilike.%${filters.searchTerm}%,court_name.ilike.%${filters.searchTerm}%`);

      const { data: rawCases } = await casesQ.order("created_at", { ascending: false }).limit(500);

      // ── Step 2: Map into paymentCases[] shape the generator expects ───────
      const paymentCases = (rawCases || [])
        .filter((c: any) => (c.payment_charges || []).length > 0)
        .map((c: any) => {
          const charges = c.payment_charges || [];
          const totalBilled  = charges.reduce((s: number, ch: any) => s + Number(ch.total_amount   || 0), 0);
          const totalPaid    = charges.reduce((s: number, ch: any) => s + Number(ch.paid_amount    || 0), 0);
          const totalPending = charges.reduce((s: number, ch: any) => s + Number(ch.balance_amount || 0), 0);

          return {
            caseId:      c.id,
            caseNumber:  c.case_number,
            caseTitle:   c.details?.title || c.details?.caseTitle || c.case_number,
            caseType:    c.case_type,
            caseStatus:  c.status,
            courtName:   c.court_name,
            lawyerName:  c.lawyer_name || c.details?.lawyerName,
            clientId:    c.client?.id,
            clientName:  c.client?.name,
            clientPhone: c.client?.phone,
            clientEmail: c.client?.email,
            totalBilled,
            totalPaid,
            totalPending,
            chargeItems: charges.map((ch: any) => ({
              id:            ch.id,
              label:         ch.name,
              isLawyerFee:   ch.is_lawyer_fee,
              totalAmount:   ch.total_amount,
              paidAmount:    ch.paid_amount,
              balanceAmount: ch.balance_amount,
              status:        ch.status,
              dueDate:       ch.due_date,
              description:   ch.description,
              notes:         ch.notes,
            })),
            paymentHistory: charges.flatMap((ch: any) =>
              (ch.payment_history || []).map((p: any) => ({
                id:               p.id,
                chargeLabel:      ch.name,
                amount:           p.amount_paid,
                paymentDate:      p.payment_date || p.timestamp,
                paymentMode:      p.payment_mode,
                paymentReference: p.payment_reference,
                recordedBy:       p.created_by,
                createdAt:        p.timestamp,
                remarks:          p.notes,
              }))
            ),
          };
        });

      return { paymentCases };
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

  // Format date to readable Indian locale
  const fmtDate = (d: any): string => {
    if (!d) return "";
    try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return String(d ?? ""); }
  };

  // Truncate for cell safety
  const trunc = (s: any, len = 80): string => String(s ?? "").slice(0, len);

  // Format INR currency
  const fmtMoney = (v: any): string => v != null ? `Rs.${Number(v).toLocaleString("en-IN")}` : "";

  // Get nested detail field (snake_case + camelCase)
  const dv = (row: any, ...keys: string[]): string => detailValue(row, ...keys);

  // Normalize case number from any field name
  const caseNo = (r: any): string =>
    r?.case_number || r?.caseNumber || r?.case_no || "";

  // Get client name from nested or flat fields
  const cName = (r: any): string =>
    r?.client?.name || r?.clientName || "";

  switch (type) {

    // ── CLIENTS ─────────────────────────────────────────────────────────────
    case "clients":
      return [{
        name: "Client Register",
        headers: [
          "Client ID", "Full Name", "Phone", "Alternate Phone",
          "Email", "Occupation", "Date of Birth",
          "Address", "City", "State", "Pincode",
          "ID Proof Type", "ID Proof Number",
          "Notes", "Registered On"
        ],
        rows: (data.clients || []).map((c: any) => [
          c.id,
          c.name,
          c.phone,
          dv(c, "alternatePhone", "alternate_phone"),
          c.email,
          dv(c, "occupation"),
          fmtDate(dv(c, "dateOfBirth", "dob", "date_of_birth")),
          c.address,
          dv(c, "city"),
          dv(c, "state"),
          dv(c, "pincode", "zipCode", "zip"),
          dv(c, "idProofType", "id_proof_type", "idType"),
          dv(c, "idProofNumber", "id_proof_number", "idNumber"),
          trunc(c.notes, 120),
          fmtDate(c.created_at),
        ])
      }];

    // ── CASES ────────────────────────────────────────────────────────────────
    case "cases":
      return [{
        name: "Case Register",
        headers: [
          "Case No", "Case Title", "Case Type", "Status",
          "Client Name", "Client Phone",
          "Court Name", "Court Room", "Bench / Judge",
          "Assigned Lawyer", "Opposing Party", "Opposing Counsel",
          "Petition No", "FIR / Complaint No",
          "Filing Date", "Next Hearing Date", "Last Hearing Date",
          "Case Stage", "Priority",
          "Notes / Summary", "Created At"
        ],
        rows: (data.cases || []).map((c: any) => [
          caseNo(c),
          dv(c, "title", "caseTitle", "case_title") || caseNo(c),
          c.case_type,
          c.status,
          c.client?.name || cName(c),
          c.client?.phone || dv(c, "clientPhone", "client_phone"),
          c.court_name,
          dv(c, "courtRoom", "court_room"),
          dv(c, "bench", "judge", "benchName"),
          c.lawyer_name || dv(c, "lawyerName", "lawyer"),
          dv(c, "opposingParty", "opposing_party", "opponent"),
          dv(c, "opposingCounsel", "opposing_counsel", "opponentLawyer"),
          dv(c, "petitionNumber", "petition_number", "petitionNo"),
          dv(c, "firNumber", "fir_number", "complaintNo"),
          fmtDate(dv(c, "filingDate", "filing_date")),
          fmtDate(dv(c, "nextHearingDate", "next_hearing_date")),
          fmtDate(dv(c, "lastHearingDate", "last_hearing_date")),
          dv(c, "caseStage", "stage", "case_stage"),
          dv(c, "priority"),
          trunc(dv(c, "notes", "summary", "description"), 150),
          fmtDate(c.created_at),
        ])
      }];

    // ── PAYMENTS ─────────────────────────────────────────────────────────────
    // Accepts rich structure: data.paymentCases[] (from Payments page)
    // Falls back to data.payments[] flat array for other callers
    case "payments": {
      const paymentCases: any[] = data.paymentCases || [];
      const flatPayments: any[] = data.payments || [];

      // ── Build working sets ────────────────────────────────────────────────

      // If rich structure available, derive everything from it
      const allChargeItems: any[] = paymentCases.flatMap(c =>
        (c.chargeItems || []).map((i: any) => ({ ...i, _case: c }))
      );
      const allPaymentHistory: any[] = paymentCases.flatMap(c =>
        (c.paymentHistory || []).map((p: any) => ({ ...p, _case: c }))
      );

      // Fall back to flat payments for legacy callers
      const hasRich = paymentCases.length > 0;
      const ledgerRows = hasRich ? allPaymentHistory : flatPayments;

      // ── Revenue KPIs ──────────────────────────────────────────────────────
      const totalBilled  = hasRich
        ? paymentCases.reduce((s: number, c: any) => s + Number(c.totalBilled  || 0), 0)
        : 0;
      const totalPaid    = hasRich
        ? paymentCases.reduce((s: number, c: any) => s + Number(c.totalPaid    || 0), 0)
        : ledgerRows.reduce((s: number, p: any) => s + Number(p.amount_paid || p.amount || 0), 0);
      const totalPending = hasRich
        ? paymentCases.reduce((s: number, c: any) => s + Number(c.totalPending || 0), 0)
        : Math.max(0, totalBilled - totalPaid);

      // Category breakdown
      const categoryMap: Record<string, { total: number; paid: number }> = {};
      for (const ci of allChargeItems) {
        if (!categoryMap[ci.label]) categoryMap[ci.label] = { total: 0, paid: 0 };
        categoryMap[ci.label].total += Number(ci.totalAmount || 0);
        categoryMap[ci.label].paid  += Number(ci.paidAmount  || 0);
      }

      // Mode breakdown from payment history
      const modeMap: Record<string, number> = {};
      for (const p of ledgerRows) {
        const mode = p.paymentMode || p.payment_mode || "Unspecified";
        modeMap[mode] = (modeMap[mode] || 0) + Number(p.amount || p.amount_paid || 0);
      }

      return [
        // ── Sheet 1: Case Financial Summary (one row per case) ────────────
        {
          name: "Case Financial Summary",
          headers: [
            "Case No", "Case Title", "Case Type", "Status",
            "Client Name", "Client Phone", "Client Email",
            "Assigned Lawyer",
            "Total Billed (Rs.)", "Total Paid (Rs.)", "Outstanding (Rs.)",
            "No. of Fee Categories", "No. of Payments"
          ],
          rows: hasRich
            ? paymentCases.map((c: any) => [
                c.caseNumber,
                c.caseTitle || c.caseNumber,
                c.caseType,
                c.caseStatus,
                c.clientName,
                c.clientPhone,
                c.clientEmail,
                c.lawyerName,
                fmtMoney(c.totalBilled),
                fmtMoney(c.totalPaid),
                fmtMoney(c.totalPending),
                (c.chargeItems || []).length,
                (c.paymentHistory || []).length,
              ])
            : [["-", "No case-level data available", "", "", "", "", "", "", "", "", "", "", ""]]
        },

        // ── Sheet 2: Fee Categories (one row per charge item) ─────────────
        {
          name: "Fee Categories",
          headers: [
            "Category Label", "Type",
            "Total Billed (Rs.)", "Total Paid (Rs.)", "Balance (Rs.)",
            "Status", "Due Date",
            "Case No", "Client Name",
            "Description / Notes"
          ],
          rows: hasRich
            ? allChargeItems.map((i: any) => [
                i.label,
                i.isLawyerFee ? "Lawyer Fee" : "Other Fee",
                fmtMoney(i.totalAmount),
                fmtMoney(i.paidAmount),
                fmtMoney(i.balanceAmount),
                i.status,
                fmtDate(i.dueDate),
                i._case?.caseNumber,
                i._case?.clientName,
                trunc((i.description || i.notes || ""), 100),
              ])
            : [["-", "No fee category data available", "", "", "", "", "", "", "", ""]]
        },

        // ── Sheet 3: Payment Transaction Ledger ───────────────────────────
        {
          name: "Payment Ledger",
          headers: [
            "Payment Date", "Amount Paid (Rs.)",
            "Fee Category", "Payment Mode", "Reference / UTR",
            "Case No", "Client Name", "Client Phone",
            "Recorded By", "Remarks"
          ],
          rows: ledgerRows.map((p: any) => [
            fmtDate(p.paymentDate || p.payment_date || p.createdAt || p.timestamp),
            fmtMoney(p.amount || p.amount_paid),
            p.chargeLabel || p.charge_name || p.chargeCategory,
            p.paymentMode || p.payment_mode,
            p.paymentReference || p.payment_reference,
            p._case?.caseNumber || p.caseNumber || caseNo(p),
            p._case?.clientName || p.clientName || cName(p),
            p._case?.clientPhone || p.clientPhone || p.client?.phone,
            p.recordedBy || p.recorded_by || p.created_by,
            trunc(p.remarks || p.notes, 80),
          ])
        },

        // ── Sheet 4: Revenue & Analytics KPIs ────────────────────────────
        {
          name: "Revenue Summary",
          headers: ["Metric", "Value"],
          rows: [
            ["--- OVERALL FINANCIALS ---", ""],
            ["Total Cases in Report",       paymentCases.length || "-"],
            ["Total Fee Categories",         allChargeItems.length || "-"],
            ["Total Payment Transactions",   ledgerRows.length],
            ["Total Amount Billed",          fmtMoney(totalBilled) || "N/A"],
            ["Total Amount Paid / Received", fmtMoney(totalPaid)],
            ["Total Outstanding / Pending",  fmtMoney(totalPending) || "N/A"],
            ...(totalBilled > 0 ? [
              ["Collection Rate (%)",
                `${((totalPaid / totalBilled) * 100).toFixed(1)}%`]
            ] : []),
            ["", ""],
            ["--- PAYMENT MODES ---", ""],
            ...Object.entries(modeMap).map(([mode, amt]) => [
              `Collected via ${mode}`, fmtMoney(amt)
            ]),
            ["", ""],
            ["--- CATEGORY BREAKDOWN ---", ""],
            ...Object.entries(categoryMap).map(([cat, v]) => [
              cat,
              `Billed: ${fmtMoney(v.total)} | Paid: ${fmtMoney(v.paid)} | Pending: ${fmtMoney(v.total - v.paid)}`
            ]),
            ["", ""],
            ["--- CASE STATUS ---", ""],
            ["Cases with Fully Paid Fees",
              paymentCases.filter((c: any) => Number(c.totalPending) === 0 && Number(c.totalBilled) > 0).length || "-"],
            ["Cases with Outstanding Balance",
              paymentCases.filter((c: any) => Number(c.totalPending) > 0).length || "-"],
          ]
        },
      ];
    }


    // ── HEARINGS ──────────────────────────────────────────────────────────────
    case "hearings":
      return [{
        name: "Court Hearings & Timeline",
        headers: [
          "Hearing ID", "Event Type", "Title / Description",
          "Status", "Scheduled Date", "Postponed To",
          "Case No", "Client Name", "Court Name",
          "Assigned Lawyer", "Notes / Outcome", "Created At"
        ],
        rows: (data.hearings || []).map((h: any) => [
          h.id,
          h.type,
          h.title || dv(h, "description"),
          h.status,
          fmtDate(h.date || h.scheduled_at || h.scheduledAt),
          fmtDate(h.postponed_to || h.postponedTo),
          h.case?.case_number || caseNo(h) || h.caseNumber,
          h.case?.client?.name || h.clientName || cName(h),
          h.case?.court_name || h.courtName,
          h.case?.lawyer_name || h.lawyerName,
          trunc(h.notes || h.outcome, 120),
          fmtDate(h.created_at),
        ])
      }];

    // ── DOCUMENTS ────────────────────────────────────────────────────────────
    case "documents":
      return [{
        name: "Document Repository",
        headers: [
          "Document ID", "Title / File Name", "Category",
          "Description", "File Type", "File Size (KB)",
          "Case No", "Client Name",
          "Uploaded By", "Uploaded At"
        ],
        rows: (data.documents || []).map((d: any) => [
          d.id,
          d.file_name || d.fileName || d.title,
          d.category,
          trunc(d.description, 100),
          d.file_type || d.fileType || d.mime_type,
          d.file_size != null ? (Number(d.file_size) / 1024).toFixed(1) : "",
          d.case?.case_number || caseNo(d) || d.caseNumber,
          d.case?.client?.name || d.clientName || cName(d),
          d.uploaded_by || d.uploadedBy || d.created_by,
          fmtDate(d.created_at || d.uploaded_at),
        ])
      }];

    // ── TASKS ────────────────────────────────────────────────────────────────
    case "tasks": {
      const tasks = data.tasks || [];
      const now = new Date();
      const isOvr = (t: any) =>
        t.due_date && new Date(t.due_date) < now &&
        t.status !== "COMPLETED" && t.status !== "CANCELLED";
      return [
        {
          name: "Task List",
          headers: [
            "Task ID", "Title", "Description", "Priority", "Status",
            "Overdue?", "Due Date", "Assigned To",
            "Created By", "Created At", "Completed At"
          ],
          rows: tasks.map((t: any) => [
            t.id,
            t.title,
            trunc(t.description || t.notes, 100),
            t.priority,
            t.status,
            isOvr(t) ? "YES" : "No",
            fmtDate(t.due_date || t.dueDate),
            t.assigned_to || t.assignedTo,
            t.created_by,
            fmtDate(t.created_at),
            fmtDate(t.completed_at),
          ])
        },
        {
          name: "Task Summary",
          headers: ["Metric", "Value"],
          rows: [
            ["Total Tasks", tasks.length],
            ["Pending", tasks.filter((t: any) => t.status === "PENDING").length],
            ["In Progress", tasks.filter((t: any) => t.status === "IN_PROGRESS").length],
            ["Completed", tasks.filter((t: any) => t.status === "COMPLETED").length],
            ["Cancelled", tasks.filter((t: any) => t.status === "CANCELLED").length],
            ["Overdue", tasks.filter((t: any) => isOvr(t)).length],
            ["Urgent Priority", tasks.filter((t: any) => t.priority === "URGENT").length],
            ["High Priority", tasks.filter((t: any) => t.priority === "HIGH").length],
          ]
        }
      ];
    }

    // ── TEAM ─────────────────────────────────────────────────────────────────
    case "team":
      return [
        {
          name: "Active Team Members",
          headers: [
            "User ID", "Full Name", "Email", "Role",
            "Account Status", "Password Reset Pending?",
            "Last Login", "Joined On"
          ],
          rows: (data.members || []).map((m: any) => [
            m.id,
            m.full_name || m.name,
            m.email,
            m.role,
            m.status,
            m.must_reset_password ? "YES" : "No",
            fmtDate(m.last_sign_in_at || m.last_login),
            fmtDate(m.created_at),
          ])
        },
        {
          name: "Pending Invites",
          headers: [
            "Invite ID", "Invited Email", "Role",
            "Invite Status", "Invite Type", "Sent At", "Expires At"
          ],
          rows: (data.invites || []).map((v: any) => [
            v.id,
            v.email,
            v.role,
            v.status,
            v.invite_type || v.inviteType,
            fmtDate(v.sent_at || v.created_at),
            fmtDate(v.expires_at),
          ])
        },
        {
          name: "Team Summary",
          headers: ["Metric", "Value"],
          rows: [
            ["Total Members", (data.members || []).length],
            ["Active Members", (data.members || []).filter((m: any) => m.status === "ACTIVE").length],
            ["Inactive Members", (data.members || []).filter((m: any) => m.status !== "ACTIVE").length],
            ["Admins", (data.members || []).filter((m: any) => m.role === "ADMIN").length],
            ["Lawyers", (data.members || []).filter((m: any) => m.role === "LAWYER").length],
            ["Staff", (data.members || []).filter((m: any) => m.role === "STAFF").length],
            ["Pending Password Reset", (data.members || []).filter((m: any) => m.must_reset_password).length],
            ["Pending Invites", (data.invites || []).filter((v: any) => v.status === "PENDING").length],
          ]
        }
      ];

    // ── PLATFORM (Super Admin) ────────────────────────────────────────────────
    case "platform":
      return [
        {
          name: "Platform Overview",
          headers: ["Metric", "Value"],
          rows: [
            ["Active Organizations", data.active_organizations ?? 0],
            ["Active Users (All Orgs)", data.active_users ?? 0],
            ["New Registrations (Period)", data.new_registrations ?? 0],
            ["Security Alerts (Period)", (data.security_alerts || []).length],
          ]
        },
        {
          name: "Security Alerts",
          headers: ["Alert ID", "Severity", "Action / Event", "Triggered At", "Details"],
          rows: (data.security_alerts || []).map((a: any) => [
            a.id,
            a.severity,
            a.action,
            fmtDate(a.created_at),
            trunc(JSON.stringify(a.metadata || {}), 200),
          ])
        }
      ];

    // ── DASHBOARD — Full Practice Report ─────────────────────────────────────
    case "dashboard":
    default: {
      const clients  = data.clients  || [];
      const cases    = data.cases    || [];
      const payments = data.payments || [];
      const hearings = data.hearings || [];
      const docs     = data.documents || [];
      const tasks    = data.tasks    || [];
      const members  = data.members  || [];
      const invites  = data.invites  || [];
      const totalRevenue = payments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
      const now = new Date();
      const pendingTasks = tasks.filter((t: any) => t.status === "PENDING" || t.status === "IN_PROGRESS").length;
      const upcomingHearings = hearings.filter((h: any) => { const d = new Date(h.date || h.scheduled_at || ""); return !isNaN(d.getTime()) && d >= now; }).length;

      return [
        {
          name: "Practice Summary",
          headers: ["Category", "Metric", "Value"],
          rows: [
            ["Clients",   "Total Registered Clients",    clients.length],
            ["Cases",     "Total Cases",                 cases.length],
            ["Cases",     "Active / Open Cases",         cases.filter((c: any) => c.status === "ACTIVE" || c.status === "OPEN").length],
            ["Cases",     "Closed / Disposed Cases",     cases.filter((c: any) => c.status === "CLOSED" || c.status === "DISPOSED").length],
            ["Payments",  "Total Revenue Collected",     fmtMoney(totalRevenue)],
            ["Payments",  "Total Payment Transactions",  payments.length],
            ["Hearings",  "Total Hearings / Events",     hearings.length],
            ["Hearings",  "Upcoming Hearings",           upcomingHearings],
            ["Documents", "Total Documents Stored",      docs.length],
            ["Tasks",     "Total Tasks",                 tasks.length],
            ["Tasks",     "Pending / In-Progress",       pendingTasks],
            ["Team",      "Team Members",                members.length],
            ["Team",      "Active Members",              members.filter((m: any) => m.status === "ACTIVE").length],
            ["Team",      "Pending Invites",             invites.filter((i: any) => i.status === "PENDING").length],
          ]
        },
        {
          name: "Clients",
          headers: ["Client ID", "Full Name", "Phone", "Email", "Occupation", "City", "State", "ID Proof Type", "Notes", "Registered On"],
          rows: clients.map((c: any) => [c.id, c.name, c.phone, c.email, dv(c, "occupation"), dv(c, "city"), dv(c, "state"), dv(c, "idProofType", "id_proof_type"), trunc(c.notes, 80), fmtDate(c.created_at)])
        },
        {
          name: "Cases",
          headers: ["Case No", "Case Title", "Type", "Status", "Client Name", "Court Name", "Assigned Lawyer", "Opposing Party", "Filing Date", "Next Hearing", "Created At"],
          rows: cases.map((c: any) => [caseNo(c), dv(c, "title", "caseTitle") || caseNo(c), c.case_type, c.status, c.client?.name || cName(c), c.court_name, c.lawyer_name || dv(c, "lawyerName"), dv(c, "opposingParty", "opposing_party"), fmtDate(dv(c, "filingDate", "filing_date")), fmtDate(dv(c, "nextHearingDate", "next_hearing_date")), fmtDate(c.created_at)])
        },
        {
          name: "Payments",
          headers: ["Payment Date", "Amount (Rs.)", "Payment Mode", "Reference", "Fee Category", "Case No", "Client Name"],
          rows: payments.map((p: any) => [fmtDate(p.payment_date || p.timestamp), fmtMoney(p.amount_paid), p.payment_mode, p.payment_reference, p.charge_name, p.case?.case_number || caseNo(p), p.client?.name || cName(p)])
        },
        {
          name: "Hearings",
          headers: ["Scheduled Date", "Event Type", "Title", "Status", "Postponed To", "Case No", "Client Name", "Notes"],
          rows: hearings.map((h: any) => [fmtDate(h.date || h.scheduled_at), h.type, h.title, h.status, fmtDate(h.postponed_to), h.case?.case_number || caseNo(h) || h.caseNumber, h.case?.client?.name || h.clientName || cName(h), trunc(h.notes, 80)])
        },
        {
          name: "Documents",
          headers: ["File Name", "Category", "Description", "File Type", "Size (KB)", "Case No", "Uploaded At"],
          rows: docs.map((d: any) => [d.file_name || d.fileName, d.category, trunc(d.description, 80), d.file_type || d.fileType, d.file_size != null ? (Number(d.file_size) / 1024).toFixed(1) : "", d.case?.case_number || caseNo(d) || d.caseNumber, fmtDate(d.created_at)])
        },
        {
          name: "Tasks",
          headers: ["Title", "Priority", "Status", "Due Date", "Assigned To", "Description"],
          rows: tasks.map((t: any) => [t.title, t.priority, t.status, fmtDate(t.due_date || t.dueDate), t.assigned_to || t.assignedTo, trunc(t.description || t.notes, 80)])
        },
        {
          name: "Team",
          headers: ["Full Name", "Email", "Role", "Status", "Joined On"],
          rows: members.map((m: any) => [m.full_name || m.name, m.email, m.role, m.status, fmtDate(m.created_at)])
        },
      ];
    }
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

  // Excel column letter helper (supports AA, AB... beyond Z)
  const colLetter = (n: number): string => {
    let s = "";
    n += 1; // 1-indexed
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };

  sheets.forEach((s, i) => {
    let sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`;
    // Header row
    sheetXml += `<row r="1">` + s.headers.map((h, hi) => `<c r="${colLetter(hi)}1" s="1" t="inlineStr"><is><t>${esc(h)}</t></is></c>`).join("") + `</row>`;
    // Data rows
    s.rows.forEach((r, ri) => {
      sheetXml += `<row r="${ri + 2}">` + r.map((v, ci) => `<c r="${colLetter(ci)}${ri + 2}" t="inlineStr"><is><t>${esc(String(v ?? "").slice(0, 200))}</t></is></c>`).join("") + `</row>`;
    });
    sheetXml += `</sheetData></worksheet>`;
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml);
  });


  return await zip.generateAsync({ type: "uint8array" });
}

export function generatePDF(sheets: Sheet[], title: string): Uint8Array {
  // Determine if any sheet is wide (>9 columns) — if so, start in landscape
  const hasWideSheet = sheets.some(s => s.headers.length > 9);
  const doc = new jsPDF({ orientation: hasWideSheet ? "landscape" : "portrait" }) as any;
  const dateStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  // Page dimensions
  const pageW = hasWideSheet ? 297 : 210;

  sheets.forEach((s, i) => {
    if (i > 0) doc.addPage();

    const isWide = s.headers.length > 9;

    // Header bar
    doc.setFillColor(26, 35, 126);
    doc.rect(0, 0, pageW, 22, "F");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text(title, 14, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(dateStr, pageW - 14, 14, { align: "right" });

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
      styles: { fontSize: isWide ? 6.0 : 7.5, cellPadding: isWide ? 2 : 3, overflow: "linebreak" },
      headStyles: { fillColor: [26, 35, 126], textColor: 255, fontStyle: "bold", fontSize: isWide ? 6.5 : 8 },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      margin: { left: 10, right: 10 },
      tableWidth: "auto",
    });

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    const footerY = hasWideSheet ? 200 : 290;
    doc.text(`Page ${i + 1} of ${sheets.length} sections`, 14, footerY);
    doc.text("Law Office Management System — Confidential", pageW - 14, footerY, { align: "right" });
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
