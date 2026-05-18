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
  useQueue?: boolean;
  allData?: any;   // frontend-loaded data, used directly to skip DB fetch
}

export type Row = (string | number | null | undefined)[];
export type Sheet = { name: string; headers: string[]; rows: Row[]; pageBreak?: boolean };

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
        id, case_number, title, case_type, status, court_name, judge_name,
        lawyer_name, next_hearing_date, filing_date,
        opponent_name, opponent_lawyer,
        details, created_at, updated_at,
        client:clients(id, name, phone, email)
      `).is("deleted_at", null);
      query = applyFilters(query);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.caseType) query = query.eq("case_type", filters.caseType);
      if (filters?.searchTerm) query = query.or(`case_number.ilike.%${filters.searchTerm}%,case_type.ilike.%${filters.searchTerm}%,court_name.ilike.%${filters.searchTerm}%`);
      const { data: cases } = await query.order("created_at", { ascending: false });
      return { cases: cases || [] };

    case "payments": {
      // Strategy: query from payment_history (has payment_charge_id FK → payment_charges)
      // Then payment_charges has case_id FK → cases → clients
      // Group in-memory by case to build paymentCases[] shape

      const { data: historyRows, error: histErr } = await db
        .from("payment_history")
        .select(`
          id, amount_paid, timestamp, payment_mode, payment_reference,
          charge_name, created_by, payment_date,
          payment_charges:payment_charge_id (
            id, name, total, paid, balance, due_date, status,
            description, is_lawyer_fee,
            cases:case_id (
              id, case_number, title, case_type, status, court_name, lawyer_name,
              clients:client_id ( id, name, phone, email )
            )
          )
        `)
        .eq("organization_id", orgId)
        .order("timestamp", { ascending: false })
        .limit(2000);

      if (histErr) {
        console.error("[payments fetchData] history query error:", histErr.message);
      }

      // Also fetch all payment_charges for this org to show categories even without payments
      const { data: chargeRows } = await db
        .from("payment_charges")
        .select(`
          id, name, total, paid, balance, due_date, status,
          description, is_lawyer_fee, case_id,
          cases:case_id (
            id, case_number, title, case_type, status, court_name, lawyer_name,
            clients:client_id ( id, name, phone, email )
          )
        `)
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .limit(2000);

      // ── Build paymentCases map keyed by case_id ────────────────────────────
      const caseMap: Record<string, any> = {};

      const ensureCase = (caseObj: any) => {
        if (!caseObj?.id) return;
        if (!caseMap[caseObj.id]) {
          const client = caseObj.clients || caseObj.client || {};
          caseMap[caseObj.id] = {
            caseId:       caseObj.id,
            caseNumber:   caseObj.case_number,
            caseTitle:    caseObj.title || caseObj.case_number,
            caseType:     caseObj.case_type,
            caseStatus:   caseObj.status,
            courtName:    caseObj.court_name,
            lawyerName:   caseObj.lawyer_name,
            clientId:     client.id,
            clientName:   client.name,
            clientPhone:  client.phone,
            clientEmail:  client.email,
            totalBilled:  0,
            totalPaid:    0,
            totalPending: 0,
            chargeItems:  [],
            paymentHistory: [],
            _chargeIdsSeen: new Set<string>(),
          };
        }
        return caseMap[caseObj.id];
      };

      // 1) Seed case map from charge rows (covers cases with charges but no payments yet)
      for (const ch of (chargeRows || [])) {
        const c = ch.cases;
        if (!c) continue;
        const entry = ensureCase(c);
        if (!entry) continue;

        if (!entry._chargeIdsSeen.has(ch.id)) {
          entry._chargeIdsSeen.add(ch.id);
          const billed  = Number(ch.total   || 0);
          const paid    = Number(ch.paid    || 0);
          const balance = Number(ch.balance || 0);
          entry.totalBilled  += billed;
          entry.totalPaid    += paid;
          entry.totalPending += balance;
          entry.chargeItems.push({
            id:            ch.id,
            label:         ch.name,
            isLawyerFee:   ch.is_lawyer_fee,
            totalAmount:   billed,
            paidAmount:    paid,
            balanceAmount: balance,
            status:        ch.status,
            dueDate:       ch.due_date,
            description:   ch.description,
          });
        }
      }

      // 2) Add payment history rows
      for (const h of (historyRows || [])) {
        const ch  = h.payment_charges;
        if (!ch) continue;
        const c   = ch.cases;
        if (!c) continue;

        const entry = ensureCase(c);
        if (!entry) continue;

        // Ensure charge is registered (may not be if charges query was limited)
        if (!entry._chargeIdsSeen.has(ch.id)) {
          entry._chargeIdsSeen.add(ch.id);
          const billed  = Number(ch.total   || 0);
          const paid    = Number(ch.paid    || 0);
          const balance = Number(ch.balance || 0);
          entry.totalBilled  += billed;
          entry.totalPaid    += paid;
          entry.totalPending += balance;
          entry.chargeItems.push({
            id:            ch.id,
            label:         ch.name,
            isLawyerFee:   ch.is_lawyer_fee,
            totalAmount:   billed,
            paidAmount:    paid,
            balanceAmount: balance,
            status:        ch.status,
            dueDate:       ch.due_date,
            description:   ch.description,
          });
        }

        entry.paymentHistory.push({
          id:               h.id,
          chargeLabel:      h.charge_name || ch.name,
          amount:           Number(h.amount_paid || 0),
          paymentDate:      h.payment_date || h.timestamp,
          paymentMode:      h.payment_mode,
          paymentReference: h.payment_reference,
          recordedBy:       h.created_by,
          createdAt:        h.timestamp,
          remarks:          null,
        });
      }

      // Convert map to array, strip internal _chargeIdsSeen set
      const paymentCases = Object.values(caseMap).map((e: any) => {
        const { _chargeIdsSeen, ...rest } = e;
        return rest;
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
          "#", "Client ID", "Full Name", "Phone", "Alternate Phone",
          "Email", "Occupation", "Date of Birth",
          "Address", "City", "State", "Pincode",
          "ID Proof Type", "ID Proof Number",
          "Notes", "Registered On"
        ],
        rows: (data.clients || []).map((c: any, idx: number) => [
          idx + 1,
          c.id || "",
          c.name || "",
          c.phone || "",
          c.alternatePhone || c.alternate_phone || dv(c, "alternatePhone", "alternate_phone"),
          c.email || "",
          c.occupation || dv(c, "occupation") || "",
          fmtDate(c.dateOfBirth || c.date_of_birth || dv(c, "dateOfBirth", "dob", "date_of_birth")),
          c.address || "",
          c.city || dv(c, "city") || "",
          c.state || dv(c, "state") || "",
          c.pincode || c.zipCode || dv(c, "pincode", "zipCode", "zip") || "",
          c.idProofType || c.id_proof_type || dv(c, "idProofType", "id_proof_type") || "",
          c.idProofNumber || c.id_proof_number || dv(c, "idProofNumber", "id_proof_number") || "",
          trunc(c.notes, 120),
          fmtDate(c.created_at || c.createdAt),
        ])
      }];

    // ── CASES ────────────────────────────────────────────────────────────────
    case "cases":
      return [{
        name: "Case Register",
        headers: [
          "#", "Case No", "Case Title", "Case Type", "Status",
          "Client Name", "Client Phone",
          "Court Name", "Judge / Bench",
          "Assigned Lawyer", "Opposing Party", "Opposing Counsel",
          "Filing Date", "Next Hearing Date",
          "Notes / Summary", "Created At"
        ],
        rows: (data.cases || []).map((c: any, idx: number) => [
          idx + 1,
          caseNo(c),
          c.title || c.caseTitle || dv(c, "title", "caseTitle") || caseNo(c),
          c.caseType || c.case_type || "",
          c.status || "",
          c.client?.name || c.clientName || cName(c),
          c.client?.phone || c.clientPhone || dv(c, "clientPhone", "client_phone"),
          c.courtName || c.court_name || dv(c, "courtName", "court_name") || "",
          c.judgeName || c.judge_name || dv(c, "bench", "judge", "benchName") || "",
          c.lawyerName || c.lawyer_name || dv(c, "lawyerName", "lawyer") || "",
          c.opponentName || c.opponent_name || dv(c, "opposingParty", "opposing_party", "opponent") || "",
          c.opponentLawyer || c.opponent_lawyer || dv(c, "opposingCounsel", "opposing_counsel") || "",
          fmtDate(c.filingDate || c.filing_date || dv(c, "filingDate", "filing_date")),
          fmtDate(c.nextHearingDate || c.next_hearing_date || dv(c, "nextHearingDate", "next_hearing_date")),
          trunc(c.notes || c.summary || c.description || dv(c, "notes", "summary", "description") || "", 150),
          fmtDate(c.created_at || c.createdAt),
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
          "#", "Hearing ID", "Event Type", "Title / Description",
          "Status", "Scheduled Date", "Postponed To",
          "Case No", "Client Name", "Court Name",
          "Assigned Lawyer", "Notes / Outcome", "Created At"
        ],
        rows: (data.hearings || []).map((h: any, idx: number) => [
          idx + 1,
          h.id || "",
          h.type || h.eventType || "",
          h.title || h.description || dv(h, "description") || "",
          h.status || "",
          fmtDate(h.date || h.scheduled_at || h.scheduledAt),
          fmtDate(h.postponed_to || h.postponedTo),
          h.caseNumber || h.case?.case_number || caseNo(h) || "",
          h.clientName || h.case?.client?.name || cName(h) || "",
          h.courtName || h.case?.court_name || dv(h, "courtName", "court_name") || "",
          h.lawyerName || h.case?.lawyer_name || dv(h, "lawyerName") || "",
          trunc(h.notes || h.outcome || "", 120),
          fmtDate(h.created_at || h.createdAt),
        ])
      }];

    // ── DOCUMENTS ────────────────────────────────────────────────────────────
    case "documents":
      return [{
        name: "Document Repository",
        headers: [
          "#", "Document ID", "Title / File Name", "Category",
          "Description", "File Type", "File Size (KB)",
          "Case No", "Client Name",
          "Uploaded By", "Uploaded At"
        ],
        rows: (data.documents || []).map((d: any, idx: number) => [
          idx + 1,
          d.id || "",
          d.fileName || d.file_name || d.title || "",
          d.category || "",
          trunc(d.description || "", 100),
          d.fileType || d.file_type || d.mime_type || "",
          d.file_size != null ? (Number(d.file_size) / 1024).toFixed(1) : "",
          d.caseNumber || d.case?.case_number || caseNo(d) || "",
          d.clientName || d.case?.client?.name || cName(d) || "",
          d.uploadedBy || d.uploaded_by || d.created_by || "",
          fmtDate(d.uploaded_at || d.uploadedAt || d.created_at),
        ])
      }];

    // ── TASKS ────────────────────────────────────────────────────────────────
    case "tasks": {
      const tasks = data.tasks || [];
      const now = new Date();
      const isOvr = (t: any) => {
        const d = t.due_date || t.dueDate;
        return d && new Date(d) < now && t.status !== "COMPLETED" && t.status !== "CANCELLED";
      };

      return [
        {
          name: "Task List",
          headers: [
            "#", "Task ID", "Title", "Description", "Priority", "Status",
            "Overdue?", "Due Date", "Assigned To",
            "Created By", "Created At", "Completed At"
          ],
          rows: tasks.map((t: any, idx: number) => [
            idx + 1,
            t.id || "",
            t.title || "",
            trunc(t.description || t.notes || "", 100),
            t.priority || "",
            t.status || "",
            isOvr(t) ? "YES" : "No",
            fmtDate(t.dueDate || t.due_date),
            t.assignedTo || t.assigned_to || t.assignedToName || "",
            t.createdBy || t.created_by || "",
            fmtDate(t.created_at || t.createdAt),
            fmtDate(t.completed_at || t.completedAt),
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
            "#", "User ID", "Full Name", "Email", "Role",
            "Account Status", "Password Reset Pending?",
            "Last Login", "Joined On"
          ],
          rows: (data.members || data.team || []).map((m: any, idx: number) => [
            idx + 1,
            m.id || "",
            m.full_name || m.fullName || m.name || "",
            m.email || "",
            m.role || "",
            m.status || "",
            m.must_reset_password ? "YES" : "No",
            fmtDate(m.last_sign_in_at || m.last_login || m.lastLogin),
            fmtDate(m.created_at || m.createdAt),
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
          pageBreak: true,
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
          pageBreak: true,
          name: "Clients",
          headers: ["Client ID", "Full Name", "Phone", "Email", "Occupation", "City", "State", "ID Proof Type", "Notes", "Registered On"],
          rows: clients.map((c: any) => [c.id, c.name, c.phone, c.email, dv(c, "occupation"), dv(c, "city"), dv(c, "state"), dv(c, "idProofType", "id_proof_type"), trunc(c.notes, 80), fmtDate(c.created_at)])
        },
        {
          pageBreak: true,
          name: "Cases",
          headers: ["Case No", "Case Title", "Type", "Status", "Client Name", "Court Name", "Assigned Lawyer", "Opposing Party", "Filing Date", "Next Hearing", "Created At"],
          rows: cases.map((c: any) => [caseNo(c), dv(c, "title", "caseTitle") || caseNo(c), c.case_type, c.status, c.client?.name || cName(c), c.court_name, c.lawyer_name || dv(c, "lawyerName"), dv(c, "opposingParty", "opposing_party"), fmtDate(dv(c, "filingDate", "filing_date")), fmtDate(dv(c, "nextHearingDate", "next_hearing_date")), fmtDate(c.created_at)])
        },
        {
          pageBreak: true,
          name: "Payments",
          headers: ["Payment Date", "Amount (Rs.)", "Payment Mode", "Reference", "Fee Category", "Case No", "Client Name"],
          rows: payments.map((p: any) => [fmtDate(p.payment_date || p.timestamp), fmtMoney(p.amount_paid), p.payment_mode, p.payment_reference, p.charge_name, p.case?.case_number || caseNo(p), p.client?.name || cName(p)])
        },
        {
          pageBreak: true,
          name: "Hearings",
          headers: ["Scheduled Date", "Event Type", "Title", "Status", "Postponed To", "Case No", "Client Name", "Notes"],
          rows: hearings.map((h: any) => [fmtDate(h.date || h.scheduled_at), h.type, h.title, h.status, fmtDate(h.postponed_to), h.case?.case_number || caseNo(h) || h.caseNumber, h.case?.client?.name || h.clientName || cName(h), trunc(h.notes, 80)])
        },
        {
          pageBreak: true,
          name: "Documents",
          headers: ["File Name", "Category", "Description", "File Type", "Size (KB)", "Case No", "Uploaded At"],
          rows: docs.map((d: any) => [d.file_name || d.fileName, d.category, trunc(d.description, 80), d.file_type || d.fileType, d.file_size != null ? (Number(d.file_size) / 1024).toFixed(1) : "", d.case?.case_number || caseNo(d) || d.caseNumber, fmtDate(d.created_at)])
        },
        {
          pageBreak: true,
          name: "Tasks",
          headers: ["Title", "Priority", "Status", "Due Date", "Assigned To", "Description"],
          rows: tasks.map((t: any) => [t.title, t.priority, t.status, fmtDate(t.due_date || t.dueDate), t.assigned_to || t.assignedTo, trunc(t.description || t.notes, 80)])
        },
        {
          pageBreak: true,
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
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const dateStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  return sheets.map((s, idx) => {
    // Section title row — col A: "1. Clients", col B: record count
    const titleRow  = [q(`${idx + 1}. ${s.name}`), q(`${s.rows.length} records  |  Generated: ${dateStr}`)].join(",");
    const headerRow = s.headers.map(q).join(",");
    const dataRows  = s.rows.map(r => r.map(q).join(","));
    return [titleRow, headerRow, ...dataRows].join("\n");
  }).join("\n\n\n");   // 3 blank lines = clear visual break between sections
}


export async function generateXLSX(sheets: Sheet[]): Promise<Uint8Array> {
  const zip = new JSZip();
  const colLetter = (n: number): string => {
    let s = ""; n += 1;
    while (n > 0) { const r = (n-1)%26; s = String.fromCharCode(65+r)+s; n = Math.floor((n-1)/26); }
    return s;
  };

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${esc(s.name.slice(0,31))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets></workbook>`);

  // Styles: 0=normal, 1=header(navy bg white bold), 2=alt row (light blue bg), 3=normal wrap
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="10"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
    <font><sz val="10"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1A237E"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF0F2FF"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFAAAACC"/></left>
      <right style="thin"><color rgb="FFAAAACC"/></right>
      <top style="thin"><color rgb="FFAAAACC"/></top>
      <bottom style="thin"><color rgb="FFAAAACC"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment wrapText="1" vertical="top"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment wrapText="1" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment wrapText="1" vertical="top"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment wrapText="1" vertical="top"/></xf>
  </cellXfs>
</styleSheet>`);

  sheets.forEach((s, si) => {
    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetView showGridLines="1"/><sheetData>`;
    // Header row — style 1 (navy+white+bold)
    xml += `<row r="1">` + s.headers.map((h,hi) =>
      `<c r="${colLetter(hi)}1" s="1" t="inlineStr"><is><t>${esc(String(h??""))}</t></is></c>`
    ).join("") + `</row>`;
    // Data rows
    s.rows.forEach((r, ri) => {
      const rowStyle = ri % 2 === 0 ? 2 : 3; // alt=light blue, even=white
      xml += `<row r="${ri+2}">` + r.map((v,ci) =>
        `<c r="${colLetter(ci)}${ri+2}" s="${rowStyle}" t="inlineStr"><is><t>${esc(String(v??"").slice(0,500))}</t></is></c>`
      ).join("") + `</row>`;
    });
    xml += `</sheetData></worksheet>`;
    zip.file(`xl/worksheets/sheet${si+1}.xml`, xml);
  });

  return await zip.generateAsync({ type: "uint8array" });
}



export function generatePDF(sheets: Sheet[], title: string): Uint8Array {
  const hasWide = sheets.some(s => s.headers.length > 9);
  const doc = new jsPDF({ orientation: hasWide ? "landscape" : "portrait" }) as any;
  const pageW = hasWide ? 297 : 210;
  const footY = hasWide ? 203 : 292;
  const dateStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  const drawPageHeader = () => {
    doc.setFillColor(26, 35, 126);
    doc.rect(0, 0, pageW, 12, "F");
    doc.setFontSize(8); doc.setTextColor(255,255,255); doc.setFont("helvetica","bold");
    doc.text(title, 14, 8.5);
    doc.setFont("helvetica","normal"); doc.setFontSize(7);
    doc.text(dateStr, pageW - 14, 8.5, { align: "right" });
  };

  drawPageHeader();
  let cursorY = 18;

  sheets.forEach((s, i) => {
    const isWide = s.headers.length > 9;

    // For pageBreak sheets (dashboard): force a new page per section
    if (s.pageBreak) {
      if (i > 0) { doc.addPage(); }
      drawPageHeader();
      cursorY = 18;
    } else if (cursorY > (hasWide ? 172 : 258)) {
      doc.addPage(); drawPageHeader(); cursorY = 18;
    }

    // Section title block
    doc.setFillColor(26, 35, 126);
    doc.rect(10, cursorY, pageW - 20, 9, "F");
    doc.setFontSize(10); doc.setTextColor(255, 255, 255); doc.setFont("helvetica","bold");
    doc.text(`${i + 1}. ${s.name}`, 14, cursorY + 6.5);
    doc.setFontSize(8); doc.setFont("helvetica","normal");
    doc.text(`${s.rows.length} record${s.rows.length !== 1 ? "s" : ""}`, pageW - 14, cursorY + 6.5, { align: "right" });
    cursorY += 12;


    doc.autoTable({
      head: [s.headers],
      body: s.rows.map(r => r.map(v => String(v ?? ""))),
      startY: cursorY,
      theme: "grid",
      styles: { fontSize: isWide ? 5.8 : 7.2, cellPadding: 2, overflow: "linebreak", valign: "top", lineWidth: 0.25 },
      headStyles: { fillColor: [26, 35, 126], textColor: 255, fontStyle: "bold", fontSize: isWide ? 6.2 : 7.8, cellPadding: 3 },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      rowPageBreak: "auto",
      margin: { top: 14, left: 10, right: 10, bottom: 12 },
      tableWidth: "auto",
      didDrawPage: () => {
        drawPageHeader();
        const pg = doc.internal.getNumberOfPages();
        doc.setFontSize(7); doc.setTextColor(150,150,150);
        doc.text(`Page ${pg}`, 14, footY);
        doc.text("Law Office Management — Confidential", pageW - 14, footY, { align: "right" });
      },
    });

    cursorY = (doc as any).lastAutoTable.finalY + 6;
  });

  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
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
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  let docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
  docXml += `<w:document xmlns:w="${W}"><w:body>`;
  docXml += `<w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>`;

  // Title block
  docXml += `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr>`;
  docXml += `<w:r><w:rPr><w:b/><w:sz w:val="40"/><w:color w:val="1A237E"/></w:rPr><w:t>${esc(title)}</w:t></w:r></w:p>`;
  docXml += `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr>`;
  docXml += `<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="888888"/></w:rPr><w:t>Generated: ${esc(dateStr)} | Law Office Management System</w:t></w:r></w:p>`;

  sheets.forEach((s, idx) => {
    const colCount = s.headers.length;
    const tblW = 14400;
    const colW = Math.floor(tblW / Math.max(colCount, 1));

    // Page break before each section (dashboard) except the very first
    if (s.pageBreak && idx > 0) {
      docXml += `<w:p><w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:br w:type="page"/></w:r></w:p>`;
    }

    // Section heading — navy background paragraph
    docXml += `<w:p><w:pPr><w:spacing w:before="160" w:after="80"/><w:shd w:val="clear" w:color="auto" w:fill="1A237E"/></w:pPr>`;
    docXml += `<w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="FFFFFF"/></w:rPr>`;
    docXml += `<w:t xml:space="preserve">${idx + 1}. ${esc(s.name)}  —  ${s.rows.length} record${s.rows.length !== 1 ? "s" : ""}</w:t></w:r></w:p>`;


    // Table
    docXml += `<w:tbl><w:tblPr>`;
    docXml += `<w:tblW w:w="${tblW}" w:type="dxa"/>`;
    docXml += `<w:tblLayout w:type="fixed"/>`;
    docXml += `<w:tblBorders>`;
    docXml += `<w:top w:val="single" w:sz="6" w:color="1A237E"/>`;
    docXml += `<w:left w:val="single" w:sz="6" w:color="1A237E"/>`;
    docXml += `<w:bottom w:val="single" w:sz="6" w:color="1A237E"/>`;
    docXml += `<w:right w:val="single" w:sz="6" w:color="1A237E"/>`;
    docXml += `<w:insideH w:val="single" w:sz="2" w:color="AAAACC"/>`;
    docXml += `<w:insideV w:val="single" w:sz="2" w:color="AAAACC"/>`;
    docXml += `</w:tblBorders>`;
    docXml += `<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>`;
    docXml += `</w:tblPr>`;

    // Column widths grid
    docXml += `<w:tblGrid>${s.headers.map(() => `<w:gridCol w:w="${colW}"/>`).join("")}</w:tblGrid>`;

    const mkCell = (text: string, fill: string, bold: boolean, color: string) =>
      `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` +
      `<w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar></w:tcPr>` +
      `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr>${bold ? "<w:b/>" : ""}<w:sz w:val="16"/><w:color w:val="${color}"/></w:rPr>` +
      `<w:t xml:space="preserve">${esc(String(text ?? ""))}</w:t></w:r></w:p></w:tc>`;

    // Header row
    docXml += `<w:tr><w:trPr><w:tblHeader/></w:trPr>`;
    docXml += s.headers.map(h => mkCell(h, "1A237E", true, "FFFFFF")).join("");
    docXml += `</w:tr>`;

    // Data rows
    s.rows.forEach((r, ri) => {
      const fill = ri % 2 === 0 ? "F0F2FF" : "FFFFFF";
      docXml += `<w:tr>`;
      docXml += r.map(v => mkCell(String(v ?? ""), fill, false, "222222")).join("");
      docXml += `</w:tr>`;
    });

    docXml += `</w:tbl><w:p><w:pPr><w:spacing w:after="280"/></w:pPr></w:p>`;
  });

  docXml += `<w:p><w:r><w:rPr><w:sz w:val="14"/><w:color w:val="AAAAAA"/></w:rPr>`;
  docXml += `<w:t>Law Office Management — Internal Confidential Document</w:t></w:r></w:p>`;
  docXml += `</w:body></w:document>`;

  zip.file("word/document.xml", docXml);
  return await zip.generateAsync({ type: "uint8array" });
}

