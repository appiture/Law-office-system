import { __internal } from "./supabaseRepository";
import {
  assertClientPayload,
  normalizeDigits,
  normalizeEmail,
} from "../utils/validation";

const getHelpers = () => __internal;

const DEFAULT_PAGE_SIZE = 50;

export const clientRepository = {
  searchClients: async ({ filters = {}, page = 1, pageSize = DEFAULT_PAGE_SIZE, showAll = false } = {}) => {
    const {
      getEffectiveFilters,
      getSearchTokens,
      getMappedClients,
      matchesSearchTokens,
      isDateWithinRange,
      paginateItems,
    } = getHelpers();

    const effectiveFilters = getEffectiveFilters(filters, showAll);
    const tokens = getSearchTokens(effectiveFilters.searchTerm, effectiveFilters.name);
    const phoneTokens = getSearchTokens(effectiveFilters.phone);
    const emailTokens = getSearchTokens(effectiveFilters.email);
    const clients = await getMappedClients();
    const matches = clients.filter((item) => {
      const searchMatch = matchesSearchTokens(tokens, [
        item.name,
        item.phone,
        item.email,
        item.address,
        item.city,
        item.state,
        item.pinCode,
        item.occupation,
        item.notes,
        item.idProofNumber,
      ]);
      const phoneMatch = matchesSearchTokens(phoneTokens, [item.phone, item.altPhone, item.emergencyContactPhone]);
      const emailMatch = matchesSearchTokens(emailTokens, [item.email]);
      const dateRangeMatch = isDateWithinRange(item.createdAt, effectiveFilters.fromDate, effectiveFilters.toDate);

      return searchMatch && phoneMatch && emailMatch && dateRangeMatch;
    });
    return paginateItems(matches, page, pageSize);
  },
  getClient: async (clientId) => {
    const {
      internalGetWorkspaceContext,
      isLawyerContext,
      getMappedClients,
      requireSupabase,
      single,
      mapClientRecord,
    } = getHelpers();

    const context = await internalGetWorkspaceContext();
    if (isLawyerContext(context)) {
      const clients = await getMappedClients();
      const client = clients.find((item) => String(item.id) === String(clientId));
      if (!client) throw new Error("Client not found.");
      return client;
    }

    const data = await single(
      requireSupabase()
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .eq("organization_id", context.organizationId)
        .is("deleted_at", null)
    );
    if (!data) throw new Error("Client not found.");
    return mapClientRecord(data);
  },
  saveClient: async (payload, clientId) => {
    const actionKey = `saveClient:${clientId || "new"}`;
    return ((_k, _f) => _f())(actionKey, async () => {
      const {
        internalGetWorkspaceContext,
        requireSupabase,
        single,
        resetWorkspaceDataCache,
      } = getHelpers();

      const context = await internalGetWorkspaceContext();
      if (!context?.organizationId) throw new Error("No organization workspace is available.");

      assertClientPayload({
        ...payload,
        phone: normalizeDigits(payload.phone),
        email: payload.email?.trim(),
      });

      const record = {
        organization_id: context.organizationId,
        name: payload.name?.trim(),
        phone: normalizeDigits(payload.phone),
        email: payload.email ? normalizeEmail(payload.email) : "",
        address: payload.address || "",
        photo_url: payload.photoUrl || "",
        photo_path: payload.photoPath || "",
        notes: payload.notes || "",
        updated_by: context.email,
        id_proof: {
          type: payload.idProofType || "",
          number: payload.idProofNumber || "",
          file_url: payload.idProofFileUrl || "",
          file_path: payload.idProofFilePath || "",
        },
        details: {
          gender: payload.gender || "",
          dateOfBirth: payload.dateOfBirth || "",
          occupation: payload.occupation || "",
          referralSource: payload.referralSource || "",
          altPhone: payload.altPhone ? normalizeDigits(payload.altPhone) : "",
          city: payload.city || "",
          state: payload.state || "",
          pinCode: payload.pinCode || "",
          emergencyContactName: payload.emergencyContactName || "",
          emergencyContactPhone: payload.emergencyContactPhone ? normalizeDigits(payload.emergencyContactPhone) : "",
        },
      };

      let savedClientId = clientId;
      if (clientId) {
        const { error } = await requireSupabase()
          .from("clients")
          .update(record)
          .eq("id", clientId)
          .eq("organization_id", context.organizationId);
        if (error) throw error;
      } else {
        record.created_by = context.email;
        const inserted = await single(requireSupabase().from("clients").insert(record).select("id"));
        savedClientId = inserted?.id;
      }

      resetWorkspaceDataCache();
      return clientRepository.getClient(savedClientId);
    });
  },
  deleteClient: async (clientId) => {
    const actionKey = `deleteClient:${clientId}`;
    return ((_k, _f) => _f())(actionKey, async () => {
      const {
        internalGetWorkspaceContext,
        requireSupabase,
        single,
        list,
        resetWorkspaceDataCache,
      } = getHelpers();

      const context = await internalGetWorkspaceContext();
      if (!context?.organizationId) throw new Error("No organization workspace is available.");

      const { error: rpcError } = await requireSupabase()
        .rpc("hard_delete_client", { target_client_id: clientId });

      if (!rpcError) {
        resetWorkspaceDataCache();
        return { id: clientId, deleted: true };
      }

      if (rpcError.code !== "42883" && rpcError.code !== "PGRST202") {
        throw rpcError;
      }

      const existingClient = await single(
        requireSupabase()
          .from("clients")
          .select("id")
          .eq("id", clientId)
          .eq("organization_id", context.organizationId)
          .is("deleted_at", null)
      );
      if (!existingClient) throw new Error("Client not found.");

      const caseRows = await list(
        requireSupabase()
          .from("cases")
          .select("id")
          .eq("client_id", clientId)
          .eq("organization_id", context.organizationId)
          .is("deleted_at", null)
      );
      const caseIds = caseRows.map((item) => item.id).filter(Boolean);

      const deleteFrom = async (table, column, values) => {
        if (!values.length) return;
        const { error } = await requireSupabase()
          .from(table)
          .delete()
          .eq("organization_id", context.organizationId)
          .in(column, values);
        if (error) throw error;
      };

      await deleteFrom("payment_history", "case_id", caseIds);
      await deleteFrom("documents", "case_id", caseIds);
      await deleteFrom("hearings", "case_id", caseIds);
      await deleteFrom("payment_charges", "case_id", caseIds);
      await deleteFrom("payments", "case_id", caseIds);
      await deleteFrom("cases", "id", caseIds);

      const { error } = await requireSupabase()
        .from("clients")
        .delete()
        .eq("id", clientId)
        .eq("organization_id", context.organizationId);

      if (error) throw error;
      resetWorkspaceDataCache();
      return { id: clientId, deleted: true };
    });
  },
  
  saveWizardStep: async (payload, clientId) => {
    const actionKey = `saveWizard:${clientId || "new"}`;
    return ((_k, _f) => _f())(actionKey, async () => {
      const {
        internalGetWorkspaceContext,
        requireSupabase,
        resetWorkspaceDataCache,
      } = getHelpers();

      const context = await internalGetWorkspaceContext();
      if (!context?.organizationId) throw new Error("No organization workspace is available.");
      
      const clientPayload = payload.client;
      let savedClientId = clientId;
      
      const clientRecord = {
        organization_id: context.organizationId,
        name: clientPayload.name?.trim(),
        phone: normalizeDigits(clientPayload.phone),
        email: clientPayload.email ? normalizeEmail(clientPayload.email) : "",
        address: clientPayload.address || "",
        photo_url: clientPayload.photoUrl || "",
        photo_path: clientPayload.photoPath || "",
        notes: clientPayload.notes || "",
        updated_by: context.email,
        id_proof: {
          type: clientPayload.idProofType || "",
          number: clientPayload.idProofNumber || "",
          file_url: clientPayload.idProofFileUrl || "",
          file_path: clientPayload.idProofFilePath || "",
        },
        details: {
          gender: clientPayload.gender || "",
          dateOfBirth: clientPayload.dateOfBirth || "",
          occupation: clientPayload.occupation || "",
          referralSource: clientPayload.referralSource || "",
          altPhone: clientPayload.altPhone ? normalizeDigits(clientPayload.altPhone) : "",
          city: clientPayload.city || "",
          state: clientPayload.state || "",
          pinCode: clientPayload.pinCode || "",
          emergencyContactName: clientPayload.emergencyContactName || "",
          emergencyContactPhone: clientPayload.emergencyContactPhone ? normalizeDigits(clientPayload.emergencyContactPhone) : "",
        },
      };

      if (!clientId) {
        clientRecord.created_by = context.email;
        const { data: clientData, error: clientError } = await requireSupabase()
          .from("clients")
          .insert(clientRecord)
          .select("id")
          .single();
        if (clientError) throw clientError;
        savedClientId = clientData.id;
      } else {
        const { error: clientError } = await requireSupabase()
          .from("clients")
          .update(clientRecord)
          .eq("id", clientId)
          .eq("organization_id", context.organizationId);
        if (clientError) throw clientError;
      }
      
      let savedCaseId = null;
      const casePayload = payload.caseData;
      if (casePayload) {
        const caseRecord = {
          organization_id: context.organizationId,
          client_id: savedClientId,
          case_number: casePayload.caseNumber?.trim(),
          case_type: casePayload.caseType?.trim(),
          court_name: casePayload.courtName || "",
          lawyer_name: casePayload.assignedLawyer || "",
          assigned_lawyer_id: casePayload.assigned_lawyer_id || null,
          assigned_by: casePayload.assigned_lawyer_id ? context.userId : null,
          assigned_at: casePayload.assigned_lawyer_id ? new Date().toISOString() : null,
          status: casePayload.status || "DRAFT",
          updated_by: context.email,
          details: {
            judgeName: casePayload.judgeName || "",
            filingDate: casePayload.filingDate || "",
            firstHearingDate: casePayload.firstHearingDate || "",
            nextHearingDate: casePayload.nextHearingDate || "",
            opponentName: casePayload.opponentName || "",
            opponentLawyer: casePayload.opponentLawyer || "",
            caseDescription: casePayload.caseDescription || "",
          },
        };
        
        if (casePayload.id) {
          const { error: caseError } = await requireSupabase()
            .from("cases")
            .update(caseRecord)
            .eq("id", casePayload.id)
            .eq("organization_id", context.organizationId);
          if (caseError) throw caseError;
          savedCaseId = casePayload.id;
        } else {
          caseRecord.created_by = context.email;
          const { data: caseData, error: caseError } = await requireSupabase()
            .from("cases")
            .insert(caseRecord)
            .select("id")
            .single();
          if (caseError) throw caseError;
          savedCaseId = caseData.id;
        }
      }

      resetWorkspaceDataCache();
      return {
        clientId: savedClientId,
        caseId: savedCaseId
      };
    });
  },
};
