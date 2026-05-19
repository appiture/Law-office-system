import { __internal } from "./supabaseRepository";
import { assertCasePayload, assertChargePayload, assertDocumentPayload, assertPaymentPayload, assertHearingPayload } from "../utils/validation";
import { toIsoDate } from "../utils/caseDomain";

const DEFAULT_PAGE_SIZE = 25;

const normalizeHearingPayload = (payload = {}) => ({
  type: payload.type || "REGULAR",
  title: (payload.title ?? payload.case_title ?? "").trim(),
  scheduledAt: payload.scheduledAt ?? payload.hearing_date ?? null,
  notes: payload.notes || "",
  status: payload.status || "PENDING",
  postponedTo: payload.postponedTo || null,
});

export const caseRepository = {
  getCases: async () => {
    return __internal.getMappedCases();
  },
  searchCases: async ({ filters = {}, page = 1, pageSize = DEFAULT_PAGE_SIZE, showAll = false } = {}) => {
    const effectiveFilters = __internal.getEffectiveFilters(filters, showAll);
    const tokens = __internal.getSearchTokens(effectiveFilters.searchTerm, effectiveFilters.caseNumber, effectiveFilters.clientName);
    const caseType = __internal.normalizeSearchText(effectiveFilters.caseType);
    const status = __internal.normalizeSearchText(effectiveFilters.status);
    const cases = await __internal.getMappedCases();
    const matches = cases.filter((item) => {
      const searchMatch = __internal.matchesSearchTokens(tokens, [
        item.caseNumber,
        item.caseType,
        item.status,
        item.courtName,
        item.judgeName,
        item.assignedLawyer,
        item.opponentName,
        item.opponentLawyer,
        item.caseDescription,
        item.client?.name,
        item.client?.phone,
        item.client?.email,
      ]);
      const typeMatch = !caseType || __internal.normalizeSearchText(item.caseType).includes(caseType);
      const statusMatch = !status || __internal.normalizeSearchText(item.status) === status;
      const dateRangeMatch = __internal.isDateWithinRange(item.createdAt, effectiveFilters.fromDate, effectiveFilters.toDate);

      return searchMatch && typeMatch && statusMatch && dateRangeMatch;
    });
    return __internal.paginateItems(matches, page, pageSize);
  },
  getCase: async (caseId) => {
    const context = await __internal.internalGetWorkspaceContext();
    let query = __internal.requireSupabase()
      .from("cases")
      .select("*")
      .eq("id", caseId)
      .eq("organization_id", context.organizationId)
      .is("deleted_at", null);

    if (__internal.isLawyerContext(context)) {
      query = query.eq("assigned_lawyer_id", context.userId);
    }

    const data = await __internal.single(query);
    if (!data) throw new Error("Case not found.");
    const dataset = await __internal.getWorkspaceData();
    return __internal.mapCaseRecord(data, dataset);
  },
  saveCase: async (payload, caseId) => {
    const actionKey = `saveCase:${caseId || "new"}`;
    return ((_k, _f) => _f())(actionKey, async () => {
      const context = await __internal.internalGetWorkspaceContext();
      if (!context?.organizationId) throw new Error("No organization workspace is available.");
      await __internal.assertClientBelongsToWorkspace(payload.clientId);

      assertCasePayload(payload);

      const record = {
        organization_id: context.organizationId,
        client_id: payload.clientId,
        case_number: payload.caseNumber?.trim(),
        case_type: payload.caseType?.trim(),
        court_name: payload.courtName || "",
        lawyer_name: payload.assignedLawyer || "",
        assigned_lawyer_id: payload.assigned_lawyer_id || null,
        assigned_by: payload.assigned_lawyer_id ? context.userId : null,
        assigned_at: payload.assigned_lawyer_id ? new Date().toISOString() : null,
        status: payload.status || "OPEN",
        updated_by: context.email,
        details: {
          judgeName: payload.judgeName || "",
          filingDate: payload.filingDate || "",
          firstHearingDate: payload.firstHearingDate || "",
          nextHearingDate: payload.nextHearingDate || "",
          opponentName: payload.opponentName || "",
          opponentLawyer: payload.opponentLawyer || "",
          caseDescription: payload.caseDescription || "",
        },
      };

      let savedCaseId = caseId;
      if (caseId) {
        const { error } = await __internal.requireSupabase()
          .from("cases")
          .update(record)
          .eq("id", caseId)
          .eq("organization_id", context.organizationId);
        if (error) throw error;
      } else {
        record.created_by = context.email;
        const inserted = await __internal.single(__internal.requireSupabase().from("cases").insert(record).select("id"));
        savedCaseId = inserted?.id;
      }

      if (savedCaseId) {
        await __internal.ensurePaymentShell(context.organizationId, savedCaseId);
        await __internal.logObservabilityEvent(context, "cases", caseId ? "UPDATE_CASE" : "CREATE_CASE", { caseId: savedCaseId });
      }

      __internal.resetWorkspaceDataCache();
      return caseRepository.getCase(savedCaseId);
    });
  },
  addDocument: async (caseId, payload) => {
    const actionKey = `addDocument:${caseId}`;
    return ((_k, _f) => _f())(actionKey, async () => {
      const context = await __internal.internalGetWorkspaceContext();
      await caseRepository.getCase(caseId);
      __internal.validateCaseScopedPath(payload.filePath, context.organizationId, caseId);
      assertDocumentPayload(payload);
      const { error } = await __internal.requireSupabase().from("documents").insert({
        organization_id: context.organizationId,
        case_id: caseId,
        category: payload.category,
        file_name: payload.fileName,
        file_url: payload.fileUrl || "",
        file_path: payload.filePath || "",
        file_type: payload.fileType || "",
        file_size: payload.fileSize || 0,
        description: payload.description || "",
        uploaded_by: context.email,
      });

      if (error) throw error;
      await __internal.logObservabilityEvent(context, "documents", "DOCUMENT_UPLOAD", { caseId, category: payload.category });
      __internal.resetWorkspaceDataCache();
      return caseRepository.getCase(caseId);
    });
  },
  deleteDocument: async (caseId, documentId) => {
    const context = await __internal.internalGetWorkspaceContext();
    const { error } = await __internal.requireSupabase()
      .from("documents")
      .update({ deleted_at: new Date().toISOString(), updated_by: context.email })
      .eq("id", documentId)
      .eq("organization_id", context.organizationId);
    if (error) throw error;
    __internal.resetWorkspaceDataCache();
    return caseRepository.getCase(caseId);
  },
  addChargeItem: async (caseId, payload) => {
    const actionKey = `addCharge:${caseId}`;
    return ((_k, _f) => _f())(actionKey, async () => {
      const context = await __internal.internalGetWorkspaceContext();
      await caseRepository.getCase(caseId);
      assertChargePayload(payload);
      const payment = await __internal.ensurePaymentShell(context.organizationId, caseId);

      const { data: insertedCharge, error } = await __internal.requireSupabase().from("payment_charges").insert({
        organization_id: context.organizationId,
        payment_id: payment.id,
        case_id: caseId,
        name: payload.label,
        total: Number(payload.totalAmount),
        paid: Number(payload.paidAmount || 0),
        due_date: payload.dueDate || null,
        display_order: payload.displayOrder || 0,
        description: payload.description || "",
        is_lawyer_fee: Boolean(payload.isLawyerFee),
        created_by: context.email,
        updated_by: context.email,
      }).select("id, name, paid").single();

      if (error) throw error;

      if (insertedCharge.paid > 0) {
        const historyResult = await __internal.requireSupabase().from("payment_history").insert({
          organization_id: context.organizationId,
          case_id: caseId,
          payment_charge_id: insertedCharge.id,
          charge_name: insertedCharge.name,
          amount_paid: insertedCharge.paid,
          payment_mode: payload.paymentMode || "Cash",
          payment_reference: payload.paymentReference || "",
          timestamp: new Date().toISOString(),
          updated_by: context.email,
          created_by: context.email,
        });
        if (historyResult.error) throw historyResult.error;
      }

      await __internal.logObservabilityEvent(context, "payments", "CREATE_CHARGE", { caseId, chargeId: insertedCharge.id });
      await __internal.syncPaymentTotals(payment.id, context.organizationId);
      __internal.resetWorkspaceDataCache();
      return caseRepository.getCase(caseId);
    });
  },
  updateChargeItem: async (caseId, chargeItemId, payload) => {
    const actionKey = `updateCharge:${chargeItemId}`;
    return ((_k, _f) => _f())(actionKey, async () => {
      const context = await __internal.internalGetWorkspaceContext();
      await caseRepository.getCase(caseId);
      assertChargePayload(payload);
      const existing = await __internal.single(
        __internal.requireSupabase()
          .from("payment_charges")
          .select("id, payment_id")
          .eq("id", chargeItemId)
          .eq("organization_id", context.organizationId)
      );
      if (!existing) throw new Error("Charge item not found.");

      const { error } = await __internal.requireSupabase()
        .from("payment_charges")
        .update({
          name: payload.label,
          total: Number(payload.totalAmount),
          paid: Number(payload.paidAmount || 0),
          due_date: payload.dueDate || null,
          display_order: payload.displayOrder || 0,
          description: payload.description || "",
          is_lawyer_fee: Boolean(payload.isLawyerFee),
          updated_by: context.email,
        })
        .eq("id", chargeItemId)
        .eq("organization_id", context.organizationId);

      if (error) throw error;
      await __internal.logObservabilityEvent(context, "payments", "UPDATE_CHARGE", { caseId, chargeId: chargeItemId });
      await __internal.syncPaymentTotals(existing.payment_id, context.organizationId);
      __internal.resetWorkspaceDataCache();
      return caseRepository.getCase(caseId);
    });
  },
  addPayment: async (caseId, payload) => {
    const actionKey = `addPayment:${payload.chargeItemId}`;
    return ((_k, _f) => _f())(actionKey, async () => {
      const context = await __internal.internalGetWorkspaceContext();
      const legalCase = await caseRepository.getCase(caseId);
      const selectedChargeItem = __internal.assertChargeBelongsToCase(payload.chargeItemId, legalCase);
      assertPaymentPayload(payload, selectedChargeItem.balanceAmount);

      const existing = await __internal.single(
        __internal.requireSupabase()
          .from("payment_charges")
          .select("*")
          .eq("id", payload.chargeItemId)
          .eq("organization_id", context.organizationId)
      );
      if (!existing) throw new Error("Charge item not found.");

      const paid = Number(existing.paid || 0) + Number(payload.amount || 0);

      const historyResult = await __internal.requireSupabase().from("payment_history").insert({
        organization_id: context.organizationId,
        case_id: caseId,
        payment_charge_id: existing.id,
        charge_name: existing.name,
        amount_paid: Number(payload.amount || 0),
        payment_mode: payload.paymentMode,
        payment_reference: payload.paymentReference || "",
        timestamp: toIsoDate(payload.paymentDate) || new Date().toISOString(),
        updated_by: context.email,
        created_by: context.email,
      });

      if (historyResult.error) throw historyResult.error;

      const updateResult = await __internal.requireSupabase()
        .from("payment_charges")
        .update({
          paid,
          updated_by: context.email,
        })
        .eq("id", existing.id)
        .eq("organization_id", context.organizationId);

      if (updateResult.error) throw updateResult.error;
      await __internal.logObservabilityEvent(context, "payments", "RECORD_PAYMENT", { caseId, amount: payload.amount });
      __internal.resetWorkspaceDataCache();
      return caseRepository.getCase(caseId);
    });
  },
  getPayments: async () => __internal.getMappedCases(),
  searchPayments: async ({ filters = {}, page = 1, pageSize = DEFAULT_PAGE_SIZE, showAll = false } = {}) => {
    const effectiveFilters = __internal.getEffectiveFilters(filters, showAll);
    const tokens = __internal.getSearchTokens(effectiveFilters.searchTerm, effectiveFilters.caseNumber, effectiveFilters.clientName);
    const status = __internal.normalizeSearchText(effectiveFilters.status);
    const cases = await __internal.getMappedCases();
    const matches = cases.filter((item) => {
      const chargeValues = (item.chargeItems || []).flatMap((charge) => [
        charge.label,
        charge.status,
        charge.description,
        charge.dueDate,
      ]);
      const historyValues = (item.paymentHistory || []).flatMap((entry) => [
        entry.chargeLabel,
        entry.paymentMode,
        entry.paymentReference,
        entry.recordedBy,
        entry.paymentDate,
        entry.createdAt,
      ]);
      const searchMatch = __internal.matchesSearchTokens(tokens, [
        item.caseNumber,
        item.caseType,
        item.status,
        item.client?.name,
        item.client?.phone,
        item.client?.email,
        chargeValues,
        historyValues,
      ]);
      const statusMatch = !status || (item.chargeItems || []).some((charge) => __internal.normalizeSearchText(charge.status) === status);
      
      let monthMatch = true;
      if (effectiveFilters.month) {
        const monthPrefix = effectiveFilters.month; // "YYYY-MM"
        const hasPaymentInMonth = (item.paymentHistory || []).some(entry => String(entry.paymentDate || entry.createdAt || "").startsWith(monthPrefix));
        const hasChargeInMonth = (item.chargeItems || []).some(charge => String(charge.createdAt || charge.dueDate || "").startsWith(monthPrefix));
        monthMatch = hasPaymentInMonth || hasChargeInMonth;
      }

      let dateRangeMatch = true;
      if (effectiveFilters.fromDate || effectiveFilters.toDate) {
        const start = effectiveFilters.fromDate ? new Date(effectiveFilters.fromDate) : null;
        const end = effectiveFilters.toDate ? new Date(effectiveFilters.toDate) : null;
        if (start) start.setHours(0, 0, 0, 0);
        if (end) end.setHours(23, 59, 59, 999);

        dateRangeMatch = (item.chargeItems || []).some(charge => {
          if (Number(charge.balanceAmount || 0) <= 0) return false;
          if (!charge.dueDate) return false;
          const d = new Date(charge.dueDate);
          if (start && d < start) return false;
          if (end && d > end) return false;
          return true;
        });
      }

      return searchMatch && statusMatch && monthMatch && dateRangeMatch;
    });
    return __internal.paginateItems(matches, page, pageSize);
  },
  searchDocuments: async ({ filters = {}, page = 1, pageSize = DEFAULT_PAGE_SIZE, showAll = false } = {}) => {
    const effectiveFilters = __internal.getEffectiveFilters(filters, showAll);
    const tokens = __internal.getSearchTokens(effectiveFilters.searchTerm);
    const category = __internal.normalizeSearchText(effectiveFilters.category);
    
    const cases = await __internal.getMappedCases();
    let allDocuments = [];
    cases.forEach((item) => {
      (item.documents || []).forEach((doc) => {
        allDocuments.push({
          ...doc,
          caseId: item.id,
          caseNumber: item.caseNumber,
          caseType: item.caseType,
          clientName: item.client?.name,
        });
      });
    });

    const matches = allDocuments.filter((doc) => {
      const searchMatch = __internal.matchesSearchTokens(tokens, [
        doc.fileName,
        doc.category,
        doc.description,
        doc.caseNumber,
        doc.caseType,
        doc.clientName,
      ]);
      const categoryMatch = !category || __internal.normalizeSearchText(doc.category) === category;
      const dateRangeMatch = __internal.isDateWithinRange(doc.createdAt, effectiveFilters.fromDate, effectiveFilters.toDate);

      return searchMatch && categoryMatch && dateRangeMatch;
    });

    return __internal.paginateItems(matches, page, pageSize);
  },
  getHearings: async () => __internal.getMappedCases(),
  searchHearings: async ({ filters = {}, page = 1, pageSize = DEFAULT_PAGE_SIZE, showAll = false } = {}) => {
    const effectiveFilters = __internal.getEffectiveFilters(filters, showAll);
    const tokens = __internal.getSearchTokens(effectiveFilters.searchTerm, effectiveFilters.caseNumber, effectiveFilters.clientName);
    const status = __internal.normalizeSearchText(effectiveFilters.status);
    const alertLevel = __internal.normalizeSearchText(effectiveFilters.alertLevel);
    
    const cases = await __internal.getMappedCases();
    let allHearings = [];
    cases.forEach((item) => {
      (item.hearings || []).forEach((h) => {
        allHearings.push({
          ...h,
          caseId: item.id,
          caseNumber: item.caseNumber,
          caseType: item.caseType,
          clientName: item.client?.name,
        });
      });
    });

    const matches = allHearings.filter((h) => {
      const searchMatch = __internal.matchesSearchTokens(tokens, [
        h.title,
        h.type,
        h.notes,
        h.status,
        h.caseNumber,
        h.caseType,
        h.clientName,
      ]);
      const statusMatch = !status || __internal.normalizeSearchText(h.status) === status;
      const alertLevelMatch = !alertLevel || __internal.normalizeSearchText(h.alertLevel) === alertLevel;

      let monthMatch = true;
      if (effectiveFilters.month) {
        const monthPrefix = effectiveFilters.month; // "YYYY-MM"
        monthMatch = String(h.scheduledAt || "").startsWith(monthPrefix);
      }

      const dateRangeMatch = __internal.isDateWithinRange(h.scheduledAt, effectiveFilters.fromDate, effectiveFilters.toDate);

      return searchMatch && statusMatch && alertLevelMatch && monthMatch && dateRangeMatch;
    });

    matches.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    return __internal.paginateItems(matches, page, pageSize);
  },
  addHearing: async (caseId, payload) => {
    const actionKey = `addHearing:${caseId}`;
    return ((_k, _f) => _f())(actionKey, async () => {
      const context = await __internal.internalGetWorkspaceContext();
      await caseRepository.getCase(caseId);
      assertHearingPayload(payload);
      const hearing = normalizeHearingPayload(payload);

      const record = {
        organization_id: context.organizationId,
        case_id: caseId,
        type: hearing.type,
        title: hearing.title,
        date: hearing.scheduledAt,
        notes: hearing.notes,
        status: hearing.status,
        created_by: context.email,
      };

      const { error } = await __internal.requireSupabase().from("hearings").insert(record);
      if (error) throw error;

      await __internal.logObservabilityEvent(context, "hearings", "CREATE_HEARING", { caseId });
      __internal.resetWorkspaceDataCache();
      return caseRepository.getCase(caseId);
    });
  },
  updateHearing: async (caseId, hearingId, payload) => {
    const actionKey = `updateHearing:${hearingId}`;
    return ((_k, _f) => _f())(actionKey, async () => {
      const context = await __internal.internalGetWorkspaceContext();
      await caseRepository.getCase(caseId);
      assertHearingPayload(payload);
      const hearing = normalizeHearingPayload(payload);

      const updates = {
        type: hearing.type,
        title: hearing.title,
        date: hearing.scheduledAt,
        notes: hearing.notes,
        status: hearing.status,
        postponed_to: hearing.postponedTo,
      };

      const { error } = await __internal.requireSupabase()
        .from("hearings")
        .update(updates)
        .eq("id", hearingId)
        .eq("organization_id", context.organizationId);

      if (error) throw error;

      await __internal.logObservabilityEvent(context, "hearings", "UPDATE_HEARING", { caseId, hearingId });
      __internal.resetWorkspaceDataCache();
      return caseRepository.getCase(caseId);
    });
  },
  deleteHearing: async (caseId, hearingId) => {
    const context = await __internal.internalGetWorkspaceContext();
    const { error } = await __internal.requireSupabase()
      .from("hearings")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", hearingId)
      .eq("organization_id", context.organizationId);
    if (error) throw error;
    __internal.resetWorkspaceDataCache();
    return caseRepository.getCase(caseId);
  },
};
