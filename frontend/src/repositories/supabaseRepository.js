import { supabase, supabaseBuckets } from "../services/supabaseClient";
import {
  assertCasePayload,
  assertChargePayload,
  assertClientPayload,
  assertDocumentPayload,
  assertFollowUpPayload,
  assertPaymentPayload,
  normalizeDigits,
  requiredText,
} from "../utils/validation";
import {
  buildDashboardSummary,
  computeChargeFinancials,
  deriveFollowUpAlertLevel,
  summarizeCaseTotals,
  toIsoDate,
} from "../utils/caseDomain";
import { createSignedAssetUrl } from "../services/storageService";
import { withRetry, normalizeError } from "../services/apiErrorService";
// import { guardAction } from "../lib/rateLimiter";
import { getUser } from "../store/sessionStore";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SERVER_PAGE = 1000; // Safety cap for server-side queries

/* ------------------------------------------------------------------ */
/*  User-scoped cache — prevents cross-user data leakage               */
/* ------------------------------------------------------------------ */
const workspaceCaches = new Map();

const getCache = (userId) => {
  if (!userId) {
    return {
      context: null,
      contextTimestamp: 0,
      data: null,
      dataTimestamp: 0,
      mappedCases: null,
      mappedCasesTimestamp: 0,
      mappedClients: null,
      mappedClientsTimestamp: 0,
    };
  }
  if (!workspaceCaches.has(userId)) {
    workspaceCaches.set(userId, {
      context: null,
      contextTimestamp: 0,
      data: null,
      dataTimestamp: 0,
      mappedCases: null,
      mappedCasesTimestamp: 0,
      mappedClients: null,
      mappedClientsTimestamp: 0,
    });
  }
  return workspaceCaches.get(userId);
};

/** Currently active userId for cache scoping */
let _activeUserId = null;
const activeCache = () => getCache(_activeUserId);

const isCacheValid = (timestamp) => Date.now() - timestamp < CACHE_TTL_MS;

const DEFAULT_PAGE_SIZE = 25;

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const normalizeRole = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || "LAWYER";
};

const normalizeAssignmentToken = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\b(adv|advocate|lawyer)\b/g, "")
    .replace(/[^a-z0-9@.]+/g, "");

const isLawyerContext = (context) => normalizeRole(context?.role) === "LAWYER";

const isCaseAssignedToContext = (legalCase, context) => {
  if (!isLawyerContext(context)) return true;
  if (!legalCase?.assigned_lawyer_id) return false;
  return String(legalCase.assigned_lawyer_id) === String(context?.userId);
};

const requireSupabase = () => {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  return supabase;
};

const single = async (query, fallback = null) => {
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || fallback;
};

const list = async (query) => {
  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
};

const getSessionUser = async (providedUser = null) => {
  if (providedUser) return providedUser;

  const cached = getUser();
  if (cached) return cached;

  // fallback ONLY ON FIRST LOAD
  const {
    data: { session },
  } = await requireSupabase().auth.getSession();

  return session?.user || null;
};

const resetWorkspaceContextCache = () => {
  workspaceCaches.clear();
  _activeUserId = null;
  _pendingContextPromise = null;
  _pendingDataPromise = null;
  _pendingMappedCasesPromise = null;
  _pendingMappedClientsPromise = null;
};

let _pendingContextPromise = null;

const getWorkspaceContextFromRpc = async (client) => {
  const { data, error } = await client.rpc("get_workspace_context").maybeSingle();
  if (error) {
    throw new Error(
      error.code === "42883" || error.code === "PGRST202"
        ? "Workspace access is not installed. Run database/production_workspace_access.sql in Supabase."
        : error.message || "Unable to load workspace access."
    );
  }

  if (!data) return null;

  // Enrich with demo metadata if available
  if (data.organization_id) {
    const { data: orgData } = await client
      .from("organizations")
      .select("is_demo, demo_expires_at, subscription_status")
      .eq("id", data.organization_id)
      .maybeSingle();
    if (orgData) {
      data.is_demo_workspace = orgData.is_demo;
      data.demo_expires_at = orgData.demo_expires_at;
      data.subscription_status = orgData.subscription_status;
    }
  }

  let avatarUrl = data.avatar_url || "";
  if (data.avatar_path) {
    try {
      avatarUrl = await createSignedAssetUrl({ bucket: supabaseBuckets.clients, path: data.avatar_path }) || avatarUrl;
    } catch (e) {
      console.warn("Failed to sign avatar url", e);
    }
  }

  let organizationLogoUrl = data.organization_logo_url || "";
  if (data.organization_logo_path) {
    try {
      organizationLogoUrl = await createSignedAssetUrl({ bucket: supabaseBuckets.clients, path: data.organization_logo_path }) || organizationLogoUrl;
    } catch (e) {
      console.warn("Failed to sign organization logo url", e);
    }
  }

  return {
    userId: data.user_id || "",
    email: normalizeEmail(data.email),
    fullName: data.full_name || "",
    avatarUrl,
    avatarPath: data.avatar_path || "",
    role: normalizeRole(data.role),
    organizationId: data.organization_id || null,
    organizationName: data.organization_name || "Law Office",
    organizationLogoUrl,
    organizationLogoPath: data.organization_logo_path || "",
    organizationStatus: data.organization_status || "",
    status: data.status || "",
    canAccessWorkspace: Boolean(data.can_access_workspace),
    isDemoWorkspace: Boolean(data.is_demo_workspace),
    demoExpiresAt: data.demo_expires_at || null,
    subscriptionStatus: data.subscription_status || "ACTIVE",
    workspaceAccessMessage: data.access_message || "",
  };
};

const logSystemEvent = async (context, module, actionType, metadata = {}) => {
  if (!context?.organizationId) return;
  try {
    const client = requireSupabase();
    await client.rpc("log_system_event", {
      p_organization_id: context.organizationId,
      p_actor_id: context.userId || null,
      p_actor_email: context.email || null,
      p_actor_role: context.role || null,
      p_entity_type: null,
      p_entity_id: null,
      p_entity_name: null,
      p_action_type: actionType,
      p_module: module,
      p_description: null,
      p_metadata: metadata
    });
  } catch (err) {
    console.warn("logSystemEvent error:", err);
  }
};

const internalGetWorkspaceContext = async ({ force = false, providedUser = null } = {}) => {
  const cache = activeCache();
  if (!force && cache.context && isCacheValid(cache.contextTimestamp)) {
    return cache.context;
  }

  if (_pendingContextPromise && !force) return _pendingContextPromise;

  _pendingContextPromise = (async () => {
    try {
      const client = requireSupabase();
      const user = await getSessionUser(providedUser);
      if (!user) {
        cache.context = null;
        return null;
      }

      // Scope cache to this user
      _activeUserId = user.id;

      const context = await getWorkspaceContextFromRpc(client);

      const userCache = getCache(user.id);
      userCache.context = context;
      userCache.contextTimestamp = Date.now();
      return context;
    } finally {
      _pendingContextPromise = null;
    }
  })();

  return _pendingContextPromise;
};

let _pendingDataPromise = null;

const getWorkspaceData = async ({ refresh = false } = {}) => {
  const initialCache = activeCache();
  if (!refresh && initialCache.data && isCacheValid(initialCache.dataTimestamp)) {
    return initialCache.data;
  }

  if (_pendingDataPromise && !refresh) return _pendingDataPromise;

  _pendingDataPromise = (async () => {
    try {
      const context = await internalGetWorkspaceContext({ force: refresh });
      const cache = activeCache();
      if (!context?.organizationId || !context?.canAccessWorkspace) {
        const empty = {
          clients: [],
          cases: [],
          payments: [],
          charges: [],
          paymentHistory: [],
          documents: [],
          followups: [],
        };
        cache.data = empty;
        cache.dataTimestamp = Date.now();
        cache.mappedCases = null;
        cache.mappedCasesTimestamp = 0;
        cache.mappedClients = null;
        cache.mappedClientsTimestamp = 0;
        return empty;
      }

      const client = requireSupabase();
      const organizationId = context.organizationId;

      let clientsQuery = client.from("clients").select("id, organization_id, name, phone, email, photo_url, photo_path, address, notes, id_proof, details, created_at, created_by, updated_by").eq("organization_id", organizationId).is("deleted_at", null);
      let casesQuery = client.from("cases").select("id, organization_id, client_id, case_number, case_type, court_name, lawyer_name, status, details, created_at, updated_at, created_by, updated_by, assigned_lawyer_id, assigned_by, assigned_at").eq("organization_id", organizationId).is("deleted_at", null);

      if (isLawyerContext(context)) {
        casesQuery = casesQuery.eq("assigned_lawyer_id", context.userId);
      }

      let [clients, cases] = await Promise.all([
        list(clientsQuery.order("created_at", { ascending: false }).range(0, MAX_SERVER_PAGE - 1)),
        list(casesQuery.order("updated_at", { ascending: false }).range(0, MAX_SERVER_PAGE - 1))
      ]);

      let paymentsQuery = client.from("payments").select("id, case_id, organization_id, total_amount, created_at, created_by, updated_by").eq("organization_id", organizationId).is("deleted_at", null);
      let chargesQuery = client.from("payment_charges").select("id, payment_id, case_id, organization_id, name, total, paid, balance, due_date, status, display_order, description, is_lawyer_fee, created_at, created_by, updated_by").eq("organization_id", organizationId).is("deleted_at", null);
      let paymentHistoryQuery = client.from("payment_history").select("id, case_id, organization_id, payment_charge_id, charge_name, amount_paid, payment_mode, payment_reference, timestamp, updated_by, created_by").eq("organization_id", organizationId);
      let documentsQuery = client.from("documents").select("id, case_id, organization_id, file_url, file_path, file_name, file_type, file_size, category, description, created_at, uploaded_by").eq("organization_id", organizationId).is("deleted_at", null);
      let followupsQuery = client.from("followups").select("id, case_id, organization_id, type, title, date, notes, status, postponed_to, created_at, created_by").eq("organization_id", organizationId).is("deleted_at", null);

      if (isLawyerContext(context)) {
        const visibleCaseIds = cases.map(c => c.id);
        if (visibleCaseIds.length > 0) {
          paymentsQuery = paymentsQuery.in("case_id", visibleCaseIds);
          chargesQuery = chargesQuery.in("case_id", visibleCaseIds);
          paymentHistoryQuery = paymentHistoryQuery.in("case_id", visibleCaseIds);
          documentsQuery = documentsQuery.in("case_id", visibleCaseIds);
          followupsQuery = followupsQuery.in("case_id", visibleCaseIds);
        } else {
          // No cases, so no related data
          return { clients: [], cases: [], payments: [], charges: [], paymentHistory: [], documents: [], followups: [] };
        }
      }

      let [payments, charges, paymentHistory, documents, followups] = await Promise.all([
        list(paymentsQuery.order("created_at", { ascending: false }).range(0, MAX_SERVER_PAGE - 1)),
        list(chargesQuery.order("display_order", { ascending: true }).range(0, MAX_SERVER_PAGE - 1)),
        list(paymentHistoryQuery.order("timestamp", { ascending: false }).range(0, MAX_SERVER_PAGE - 1)),
        list(documentsQuery.order("created_at", { ascending: false }).range(0, MAX_SERVER_PAGE - 1)),
        list(followupsQuery.order("date", { ascending: true }).range(0, MAX_SERVER_PAGE - 1))
      ]);

      if (isLawyerContext(context)) {
        const visibleClientIds = new Set(cases.map((item) => String(item.client_id)));
        clients = clients.filter((item) => visibleClientIds.has(String(item.id)));
      }

      const data = { clients, cases, payments, charges, paymentHistory, documents, followups };
      cache.data = data;
      cache.dataTimestamp = Date.now();
      cache.mappedCases = null;
      cache.mappedCasesTimestamp = 0;
      cache.mappedClients = null;
      cache.mappedClientsTimestamp = 0;
      return data;
    } finally {
      _pendingDataPromise = null;
    }
  })();

  return _pendingDataPromise;
};

const resetWorkspaceDataCache = () => {
  const cache = activeCache();
  cache.data = null;
  cache.dataTimestamp = 0;
  cache.mappedCases = null;
  cache.mappedCasesTimestamp = 0;
  cache.mappedClients = null;
  cache.mappedClientsTimestamp = 0;
};

const mapClientRecord = async (client, { includeAssets = true } = {}) => {
  const photoUrl = includeAssets && client?.photo_path
    ? await createSignedAssetUrl({ bucket: supabaseBuckets.clients, path: client.photo_path })
    : client?.photo_url || "";
  const idProofPath = client?.id_proof?.file_path || "";
  const idProofFileUrl = includeAssets && idProofPath
    ? await createSignedAssetUrl({ bucket: supabaseBuckets.clients, path: idProofPath })
    : client?.id_proof?.file_url || "";

  return {
    id: client.id,
    name: client.name,
    phone: client.phone,
    email: client.email,
    address: client.address || client?.details?.address || "",
    notes: client.notes || client?.details?.notes || "",
    photoUrl,
    photoPath: client.photo_path || "",
    idProofType: client?.id_proof?.type || "",
    idProofNumber: client?.id_proof?.number || "",
    idProofFileUrl,
    idProofFilePath: idProofPath,
    createdBy: client.created_by || "",
    createdAt: client.created_at,
    ...client.details,
  };
};

const mapDocumentRecord = async (document, { includeSignedUrl = true } = {}) => {
  const signedUrl = includeSignedUrl && document?.file_path
    ? await createSignedAssetUrl({ bucket: supabaseBuckets.documents, path: document.file_path })
    : document?.file_url || "";

  return {
    id: document.id,
    category: document.category,
    fileName: document.file_name,
    fileUrl: signedUrl,
    filePath: document.file_path,
    fileType: document.file_type,
    fileSize: document.file_size,
    uploadedBy: document.uploaded_by,
    createdAt: document.created_at,
    description: document.description || "",
  };
};

const buildDatasetIndexes = (dataset) => {
  const clientsById = new Map();
  dataset.clients.forEach((item) => clientsById.set(item.id, item));

  const chargesById = new Map();
  dataset.charges.forEach((item) => chargesById.set(item.id, item));

  const chargesByCase = new Map();
  dataset.charges.forEach((item) => {
    if (!chargesByCase.has(item.case_id)) chargesByCase.set(item.case_id, []);
    chargesByCase.get(item.case_id).push(item);
  });

  const documentsByCase = new Map();
  dataset.documents.forEach((item) => {
    if (!documentsByCase.has(item.case_id)) documentsByCase.set(item.case_id, []);
    documentsByCase.get(item.case_id).push(item);
  });

  const followUpsByCase = new Map();
  dataset.followups.forEach((item) => {
    if (!followUpsByCase.has(item.case_id)) followUpsByCase.set(item.case_id, []);
    followUpsByCase.get(item.case_id).push(item);
  });

  const historyByCase = new Map();
  dataset.paymentHistory.forEach((item) => {
    if (!historyByCase.has(item.case_id)) historyByCase.set(item.case_id, []);
    historyByCase.get(item.case_id).push(item);
  });

  return { clientsById, chargesById, chargesByCase, documentsByCase, followUpsByCase, historyByCase };
};

const mapCaseRecord = async (
  legalCase,
  dataset,
  {
    clientsById,
    chargesById,
    chargesByCase,
    documentsByCase,
    followUpsByCase,
    historyByCase,
    includeClientAssets = true,
    includeDocuments = true,
  } = {}
) => {
  const clientRecord = clientsById ? clientsById.get(legalCase.client_id) : dataset.clients.find((item) => item.id === legalCase.client_id);
  const mappedClient = clientRecord ? await mapClientRecord(clientRecord, { includeAssets: includeClientAssets }) : null;

  const caseCharges = chargesByCase ? (chargesByCase.get(legalCase.id) || []) : dataset.charges.filter((item) => item.case_id === legalCase.id);
  const chargeItems = caseCharges
    .map((item) => {
      const financials = computeChargeFinancials(item);
      return {
        id: item.id,
        label: item.name,
        totalAmount: financials.totalAmount,
        paidAmount: financials.paidAmount,
        balanceAmount: financials.balanceAmount,
        dueDate: item.due_date,
        status: item.status || financials.status,
        displayOrder: item.display_order || 0,
        createdAt: item.created_at,
        isLawyerFee: Boolean(item.is_lawyer_fee),
        description: item.description || "",
      };
    })
    .sort((left, right) => (left.displayOrder || 0) - (right.displayOrder || 0));

  const caseDocuments = includeDocuments
    ? (documentsByCase ? (documentsByCase.get(legalCase.id) || []) : dataset.documents.filter((item) => item.case_id === legalCase.id))
    : [];
  const documents = includeDocuments
    ? await Promise.all(caseDocuments.map((item) => mapDocumentRecord(item)))
    : [];

  const caseFollowUps = followUpsByCase ? (followUpsByCase.get(legalCase.id) || []) : dataset.followups.filter((item) => item.case_id === legalCase.id);
  const followUps = caseFollowUps
    .map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title || item.type,
      scheduledAt: item.date,
      status: item.status,
      notes: item.notes || "",
      postponedTo: item.postponed_to || null,
      createdBy: item.created_by || "",
      createdAt: item.created_at,
      alertLevel: deriveFollowUpAlertLevel({
        status: item.status,
        scheduledAt: item.date,
        postponedTo: item.postponed_to,
      }),
    }));

  const caseHistory = historyByCase ? (historyByCase.get(legalCase.id) || []) : dataset.paymentHistory.filter((item) => item.case_id === legalCase.id);
  const history = caseHistory
    .map((item) => {
      const charge = chargesById ? chargesById.get(item.payment_charge_id) : dataset.charges.find(c => c.id === item.payment_charge_id);
      return {
        id: item.id,
        chargeItemId: item.payment_charge_id,
        chargeLabel: item.charge_name,
        amount: Number(item.amount_paid || 0),
        paymentMode: item.payment_mode,
        paymentReference: item.payment_reference || "",
        paymentDate: item.timestamp,
        recordedBy: item.updated_by,
        createdAt: item.timestamp,
        isLawyerFee: charge ? Boolean(charge.is_lawyer_fee) : false,
      };
    });

  const totals = summarizeCaseTotals(chargeItems);
  const caseDetails = legalCase.details || {};

  return {
    id: legalCase.id,
    caseId: legalCase.id,
    caseNumber: legalCase.case_number,
    caseType: legalCase.case_type,
    courtName: legalCase.court_name,
    assignedLawyer: legalCase.lawyer_name,
    assignedLawyerId: legalCase.assigned_lawyer_id,
    assignedBy: legalCase.assigned_by,
    assignedAt: legalCase.assigned_at,
    status: legalCase.status,
    createdBy: legalCase.created_by || "",
    createdAt: legalCase.created_at,
    updatedAt: legalCase.updated_at,
    judgeName: caseDetails.judgeName || "",
    filingDate: caseDetails.filingDate || "",
    firstHearingDate: caseDetails.firstHearingDate || "",
    nextHearingDate: caseDetails.nextHearingDate || "",
    opponentName: caseDetails.opponentName || "",
    opponentLawyer: caseDetails.opponentLawyer || "",
    caseDescription: caseDetails.caseDescription || "",
    client: mappedClient,
    chargeItems,
    paymentHistory: history,
    documents,
    followUps,
    totalAmount: totals.totalAmount,
    paidAmount: totals.paidAmount,
    balanceAmount: totals.balanceAmount,
  };
};

let _pendingMappedCasesPromise = null;

const getMappedCases = async ({ refresh = false } = {}) => {
  const dataset = await getWorkspaceData({ refresh });
  const cache = activeCache();

  if (!refresh && cache.mappedCases && isCacheValid(cache.mappedCasesTimestamp)) {
    return cache.mappedCases;
  }

  if (_pendingMappedCasesPromise && !refresh) return _pendingMappedCasesPromise;
  
  _pendingMappedCasesPromise = (async () => {
    try {
      // Build O(N) lookup indexes to avoid O(N^2) filters during mapping
      const options = buildDatasetIndexes(dataset);
      const mappedCases = await Promise.all(dataset.cases.map((item) => mapCaseRecord(item, dataset, options)));
      cache.mappedCases = mappedCases;
      cache.mappedCasesTimestamp = Date.now();
      return mappedCases;
    } finally {
      _pendingMappedCasesPromise = null;
    }
  })();

  return _pendingMappedCasesPromise;
};

let _pendingMappedClientsPromise = null;

const getMappedClients = async ({ refresh = false } = {}) => {
  const dataset = await getWorkspaceData({ refresh });
  const cache = activeCache();

  if (!refresh && cache.mappedClients && isCacheValid(cache.mappedClientsTimestamp)) {
    return cache.mappedClients;
  }

  if (_pendingMappedClientsPromise && !refresh) return _pendingMappedClientsPromise;

  _pendingMappedClientsPromise = (async () => {
    try {
      const options = { ...buildDatasetIndexes(dataset), includeDocuments: false, includeClientAssets: false };
      const mappedCases = await Promise.all(dataset.cases.map(c => mapCaseRecord(c, dataset, options)));

      const casesByClient = new Map();
      mappedCases.forEach(item => {
        const clientId = item.client?.id;
        if (clientId) {
          if (!casesByClient.has(clientId)) casesByClient.set(clientId, []);
          casesByClient.get(clientId).push(item);
        }
      });

      const mappedClients = await Promise.all(
        dataset.clients.map(async (client) => {
          const mappedClient = await mapClientRecord(client);
          const clientCases = casesByClient.get(client.id) || [];
          const cases = clientCases.map((legalCase) => ({
            id: legalCase.id,
            caseId: legalCase.id,
            caseNumber: legalCase.caseNumber,
            caseType: legalCase.caseType,
            courtName: legalCase.courtName,
            assignedLawyer: legalCase.assignedLawyer,
            status: legalCase.status,
            totalAmount: legalCase.totalAmount,
            paidAmount: legalCase.paidAmount,
            balanceAmount: legalCase.balanceAmount,
            documentCount: legalCase.documents.length,
            followUpCount: legalCase.followUps.length,
            clientName: legalCase.client?.name,
            clientPhotoUrl: legalCase.client?.photoUrl,
          }));

          return {
            ...mappedClient,
            cases,
          };
        })
      );
      cache.mappedClients = mappedClients;
      cache.mappedClientsTimestamp = Date.now();
      return mappedClients;
    } finally {
      _pendingMappedClientsPromise = null;
    }
  })();

  return _pendingMappedClientsPromise;
};

const ensurePaymentShell = async (organizationId, caseId) => {
  const existing = await single(
    requireSupabase()
      .from("payments")
      .select("id, total_amount, organization_id, case_id")
      .eq("organization_id", organizationId)
      .eq("case_id", caseId)
  );

  if (existing) return existing;
  return single(
    requireSupabase()
      .from("payments")
      .insert({
        organization_id: organizationId,
        case_id: caseId,
        total_amount: 0,
      })
      .select("id, total_amount, organization_id, case_id")
  );
};

const syncPaymentTotals = async (paymentId, organizationId) => {
  const charges = await list(
    requireSupabase()
      .from("payment_charges")
      .select("total")
      .eq("organization_id", organizationId)
      .eq("payment_id", paymentId)
  );

  const total = charges.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const { error } = await requireSupabase()
    .from("payments")
    .update({ total_amount: total })
    .eq("id", paymentId)
    .eq("organization_id", organizationId);

  if (error) throw error;
};

const assertClientBelongsToWorkspace = async (clientId) => {
  const clients = await getMappedClients();
  const client = clients.find((item) => String(item.id) === String(clientId));
  if (!client) {
    throw new Error("Selected client was not found in the current organization.");
  }
  return client;
};

const assertChargeBelongsToCase = (chargeItemId, legalCase) => {
  const chargeItem = legalCase?.chargeItems?.find((item) => String(item.id) === String(chargeItemId));
  if (!chargeItem) {
    throw new Error("Selected fee category was not found in the current case.");
  }
  return chargeItem;
};

const validateCaseScopedPath = (filePath, organizationId, caseId) => {
  if (!requiredText(filePath)) {
    return;
  }
  const expectedPrefix = `org-${organizationId}/cases/case-${caseId}/`;
  if (!String(filePath).startsWith(expectedPrefix)) {
    throw new Error("Uploaded files must stay inside the current organization and case folder.");
  }
};

const getEffectiveFilters = (filters = {}, showAll = false) => showAll ? {} : filters;

const getPageBounds = (page = 1, pageSize = DEFAULT_PAGE_SIZE) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  return { safePage, safePageSize, from, to };
};

const paginateItems = (items, page = 1, pageSize = DEFAULT_PAGE_SIZE) => {
  const { safePage, safePageSize, from, to } = getPageBounds(page, pageSize);
  return {
    items: items.slice(from, to + 1),
    total: items.length,
    page: safePage,
    pageSize: safePageSize,
  };
};

const isWriteOperation = (key) => ["save", "add", "update", "delete"].some((prefix) => key.startsWith(prefix));

const checkServerRateLimit = async (key) => {
  const { error } = await requireSupabase().rpc("check_rate_limit", {
    _action_key: key,
    _max_requests: 10,
    _window_seconds: 60,
  });
  if (error) throw error;
};

/* ── Task helpers (localStorage fallback when DB table absent) ──────── */
const _TASKS_KEY = (orgId) => `lawoffice.tasks.${orgId}`;

const _mapTask = (row) => ({
  id: row.id || row._id,
  title: row.title || "",
  description: row.description || "",
  priority: row.priority || "MEDIUM",
  status: row.status || "PENDING",
  dueDate: row.due_date || row.dueDate || null,
  assignedTo: row.assigned_to || row.assignedTo || "",
  createdBy: row.created_by || row.createdBy || "",
  createdAt: row.created_at || row.createdAt || new Date().toISOString(),
  updatedAt: row.updated_at || row.updatedAt || null,
});

const _localTasks = (orgId) => {
  try {
    return JSON.parse(localStorage.getItem(_TASKS_KEY(orgId)) || "[]");
  } catch { return []; }
};

const _localSaveTasks = (orgId, tasks) => {
  localStorage.setItem(_TASKS_KEY(orgId), JSON.stringify(tasks));
};

const _localCreateTask = (orgId, payload) => {
  const tasks = _localTasks(orgId);
  const task = {
    id: `local-${Date.now()}`,
    title: payload.title || "",
    description: payload.description || "",
    priority: payload.priority || "MEDIUM",
    status: payload.status || "PENDING",
    dueDate: payload.dueDate || null,
    assignedTo: payload.assignedTo || "",
    createdBy: "",
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
  _localSaveTasks(orgId, [task, ...tasks]);
  return task;
};

const _localUpdateTask = (orgId, id, payload) => {
  const tasks = _localTasks(orgId);
  const task = tasks.find(t => t.id === id);
  if (!task) throw new Error("Task not found.");
  const updated = { ...task, ...payload, id, updatedAt: new Date().toISOString() };
  _localSaveTasks(orgId, tasks.map(t => t.id === id ? updated : t));
  return updated;
};

const _localDeleteTask = (orgId, id) => {
  const tasks = _localTasks(orgId);
  _localSaveTasks(orgId, tasks.filter(t => t.id !== id));
};

const supabasePlatformApi = {
  getWorkspaceContext: internalGetWorkspaceContext,
  getAssignableLawyers: async () => {
    const context = await internalGetWorkspaceContext();
    if (!context?.organizationId) return [];

    const rows = await list(
      requireSupabase()
        .from("users")
        .select("id,email,full_name,role,status")
        .eq("organization_id", context.organizationId)
        .eq("role", "LAWYER")
        .eq("status", "ACTIVE")
        .is("deleted_at", null)
        .order("full_name", { ascending: true })
    );

    return rows.map((item) => ({
      id: item.id,
      email: item.email || "",
      fullName: item.full_name || "",
      label: item.full_name ? `${item.full_name} <${item.email}>` : item.email,
      value: item.full_name || item.email,
    }));
  },
  searchClients: async ({ filters = {}, page = 1, pageSize = DEFAULT_PAGE_SIZE, showAll = false } = {}) => {
    const context = await internalGetWorkspaceContext();
    if (isLawyerContext(context)) {
      const effectiveFilters = getEffectiveFilters(filters, showAll);
      const clients = await getMappedClients();
      const matches = clients.filter((item) => {
        const nameMatch = !effectiveFilters.name || String(item.name || "").toLowerCase().includes(String(effectiveFilters.name).toLowerCase());
        const phoneMatch = !effectiveFilters.phone || String(item.phone || "").toLowerCase().includes(String(effectiveFilters.phone).toLowerCase());
        const emailMatch = !effectiveFilters.email || String(item.email || "").toLowerCase().includes(String(effectiveFilters.email).toLowerCase());
        return nameMatch && phoneMatch && emailMatch;
      });
      return paginateItems(matches, page, pageSize);
    }

    const client = requireSupabase();
    const effectiveFilters = getEffectiveFilters(filters, showAll);
    let query = client.from("clients")
      .select("*", { count: "exact" })
      .eq("organization_id", context.organizationId)
      .is("deleted_at", null);

    if (effectiveFilters.name) query = query.ilike("name", `%${effectiveFilters.name}%`);
    if (effectiveFilters.phone) query = query.ilike("phone", `%${effectiveFilters.phone}%`);
    if (effectiveFilters.email) query = query.ilike("email", `%${effectiveFilters.email}%`);

    const { safePage, safePageSize, from, to } = getPageBounds(page, pageSize);
    const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
    if (error) throw error;

    const items = await Promise.all((data || []).map(mapClientRecord));
    return { items, total: count || 0, page: safePage, pageSize: safePageSize };
  },
  getClient: async (clientId) => {
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
      return supabasePlatformApi.getClient(savedClientId);
    });
  },
  deleteClient: async (clientId) => {
    const actionKey = `deleteClient:${clientId}`;
    return ((_k, _f) => _f())(actionKey, async () => {
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
      await deleteFrom("followups", "case_id", caseIds);
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
  getCases: async () => {
    return getMappedCases();
  },
  searchCases: async ({ filters = {}, page = 1, pageSize = DEFAULT_PAGE_SIZE, showAll = false } = {}) => {
    const context = await internalGetWorkspaceContext();
    if (isLawyerContext(context)) {
      const effectiveFilters = getEffectiveFilters(filters, showAll);
      const normalized = {
        caseNumber: String(effectiveFilters.caseNumber || "").toLowerCase(),
        caseType: String(effectiveFilters.caseType || "").toLowerCase(),
        clientName: String(effectiveFilters.clientName || "").toLowerCase(),
      };
      const cases = await getMappedCases();
      const matches = cases.filter((item) => {
        const caseMatch = !normalized.caseNumber || String(item.caseNumber || "").toLowerCase().includes(normalized.caseNumber);
        const typeMatch = !normalized.caseType || String(item.caseType || "").toLowerCase().includes(normalized.caseType);
        const clientMatch = !normalized.clientName || String(item.client?.name || "").toLowerCase().includes(normalized.clientName);
        return caseMatch && typeMatch && clientMatch;
      });
      return paginateItems(matches, page, pageSize);
    }

    const client = requireSupabase();
    const effectiveFilters = getEffectiveFilters(filters, showAll);
    let query = client.from("cases")
      .select("*, clients!inner(*)", { count: "exact" })
      .eq("organization_id", context.organizationId)
      .is("deleted_at", null);

    // Hardened Backend Enforcement for Lawyer View
    if (isLawyerContext(context)) {
      query = query.eq("assigned_lawyer_id", context.userId);
    }

    if (effectiveFilters.caseNumber) query = query.ilike("case_number", `%${effectiveFilters.caseNumber}%`);
    if (effectiveFilters.caseType) query = query.ilike("case_type", `%${effectiveFilters.caseType}%`);
    if (effectiveFilters.clientName) query = query.ilike("clients.name", `%${effectiveFilters.clientName}%`);

    const { safePage, safePageSize, from, to } = getPageBounds(page, pageSize);
    const { data, count, error } = await query.order("updated_at", { ascending: false }).range(from, to);
    if (error) throw error;

    const dataset = await getWorkspaceData(); // Still need dataset for related items like charges
    const items = await Promise.all((data || []).map(item => mapCaseRecord(item, dataset)));
    return { items, total: count || 0, page: safePage, pageSize: safePageSize };
  },
  getCase: async (caseId) => {
    const context = await internalGetWorkspaceContext();
    let query = requireSupabase()
      .from("cases")
      .select("*")
      .eq("id", caseId)
      .eq("organization_id", context.organizationId)
      .is("deleted_at", null);

    if (isLawyerContext(context)) {
      query = query.eq("assigned_lawyer_id", context.userId);
    }

    const data = await single(query);
    if (!data) throw new Error("Case not found.");
    const dataset = await getWorkspaceData();
    return mapCaseRecord(data, dataset);
  },
  saveCase: async (payload, caseId) => {
    const actionKey = `saveCase:${caseId || "new"}`;
    return ((_k, _f) => _f())(actionKey, async () => {
      const context = await internalGetWorkspaceContext();
      if (!context?.organizationId) throw new Error("No organization workspace is available.");
      await assertClientBelongsToWorkspace(payload.clientId);

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
        const { error } = await requireSupabase()
          .from("cases")
          .update(record)
          .eq("id", caseId)
          .eq("organization_id", context.organizationId);
        if (error) throw error;
      } else {
        record.created_by = context.email;
        const inserted = await single(requireSupabase().from("cases").insert(record).select("id"));
        savedCaseId = inserted?.id;
      }

      if (savedCaseId) {
        await ensurePaymentShell(context.organizationId, savedCaseId);
        await logSystemEvent(context, "cases", caseId ? "UPDATE_CASE" : "CREATE_CASE", { caseId: savedCaseId });
      }

      resetWorkspaceDataCache();
      return supabasePlatformApi.getCase(savedCaseId);
    });
  },
  addDocument: async (caseId, payload) => {
    const actionKey = `addDocument:${caseId}`;
    return ((_k, _f) => _f())(actionKey, async () => {
      const context = await internalGetWorkspaceContext();
      await supabasePlatformApi.getCase(caseId);
      validateCaseScopedPath(payload.filePath, context.organizationId, caseId);
      assertDocumentPayload(payload);
      const { error } = await requireSupabase().from("documents").insert({
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
      await logSystemEvent(context, "documents", "DOCUMENT_UPLOAD", { caseId, category: payload.category });
      resetWorkspaceDataCache();
      return supabasePlatformApi.getCase(caseId);
    });
  },
  deleteDocument: async (caseId, documentId) => {
    const context = await internalGetWorkspaceContext();
    const { error } = await requireSupabase()
      .from("documents")
      .update({ deleted_at: new Date().toISOString(), updated_by: context.email })
      .eq("id", documentId)
      .eq("organization_id", context.organizationId);
    if (error) throw error;
    resetWorkspaceDataCache();
    return supabasePlatformApi.getCase(caseId);
  },
  addChargeItem: async (caseId, payload) => {
    const actionKey = `addCharge:${caseId}`;
    return ((_k, _f) => _f())(actionKey, async () => {
      const context = await internalGetWorkspaceContext();
      await supabasePlatformApi.getCase(caseId);
      assertChargePayload(payload);
      const payment = await ensurePaymentShell(context.organizationId, caseId);

      const { data: insertedCharge, error } = await requireSupabase().from("payment_charges").insert({
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
        const historyResult = await requireSupabase().from("payment_history").insert({
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

      await logSystemEvent(context, "payments", "CREATE_CHARGE", { caseId, chargeId: insertedCharge.id });
      await syncPaymentTotals(payment.id, context.organizationId);
      resetWorkspaceDataCache();
      return supabasePlatformApi.getCase(caseId);
    });
  },
  updateChargeItem: async (caseId, chargeItemId, payload) => {
    const actionKey = `updateCharge:${chargeItemId}`;
    return ((_k, _f) => _f())(actionKey, async () => {
      const context = await internalGetWorkspaceContext();
      await supabasePlatformApi.getCase(caseId);
      assertChargePayload(payload);
      const existing = await single(
        requireSupabase()
          .from("payment_charges")
          .select("id, payment_id")
          .eq("id", chargeItemId)
          .eq("organization_id", context.organizationId)
      );
      if (!existing) throw new Error("Charge item not found.");

      const { error } = await requireSupabase()
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
      await logSystemEvent(context, "payments", "UPDATE_CHARGE", { caseId, chargeId: chargeItemId });
      await syncPaymentTotals(existing.payment_id, context.organizationId);
      resetWorkspaceDataCache();
      return supabasePlatformApi.getCase(caseId);
    });
  },
  addPayment: async (caseId, payload) => {
    const actionKey = `addPayment:${payload.chargeItemId}`;
    return ((_k, _f) => _f())(actionKey, async () => {
      const context = await internalGetWorkspaceContext();
      const legalCase = await supabasePlatformApi.getCase(caseId);
      const selectedChargeItem = assertChargeBelongsToCase(payload.chargeItemId, legalCase);
      assertPaymentPayload(payload, selectedChargeItem.balanceAmount);

      const existing = await single(
        requireSupabase()
          .from("payment_charges")
          .select("*")
          .eq("id", payload.chargeItemId)
          .eq("organization_id", context.organizationId)
      );
      if (!existing) throw new Error("Charge item not found.");

      const paid = Number(existing.paid || 0) + Number(payload.amount || 0);

      const historyResult = await requireSupabase().from("payment_history").insert({
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

      const updateResult = await requireSupabase()
        .from("payment_charges")
        .update({
          paid,
          updated_by: context.email,
        })
        .eq("id", existing.id)
        .eq("organization_id", context.organizationId);

      if (updateResult.error) throw updateResult.error;
      await logSystemEvent(context, "payments", "RECORD_PAYMENT", { caseId, amount: payload.amount });
      resetWorkspaceDataCache();
      return supabasePlatformApi.getCase(caseId);
    });
  },
  getPayments: async () => getMappedCases(),
  searchPayments: async ({ filters = {}, page = 1, pageSize = DEFAULT_PAGE_SIZE, showAll = false } = {}) => {
    const effectiveFilters = getEffectiveFilters(filters, showAll);
    const status = String(effectiveFilters.status || "").toLowerCase();
    const cases = await getMappedCases();
    const matches = cases.filter((item) => {
      const clientMatch = !effectiveFilters.clientName || String(item.client?.name || "").toLowerCase().includes(String(effectiveFilters.clientName).toLowerCase());
      const caseMatch = !effectiveFilters.caseNumber || String(item.caseNumber || "").toLowerCase().includes(String(effectiveFilters.caseNumber).toLowerCase());
      const statusMatch = !status || (item.chargeItems || []).some((charge) => String(charge.status || "").toLowerCase() === status);
      
      let monthMatch = true;
      if (effectiveFilters.month) {
        const monthPrefix = effectiveFilters.month; // "YYYY-MM"
        const hasPaymentInMonth = (item.paymentHistory || []).some(entry => String(entry.paymentDate || entry.createdAt || "").startsWith(monthPrefix));
        const hasChargeInMonth = (item.chargeItems || []).some(charge => String(charge.createdAt || charge.dueDate || "").startsWith(monthPrefix));
        monthMatch = hasPaymentInMonth || hasChargeInMonth;
      }

      return clientMatch && caseMatch && statusMatch && monthMatch;
    });
    return paginateItems(matches, page, pageSize);
  },
  searchDocuments: async ({ filters = {}, page = 1, pageSize = DEFAULT_PAGE_SIZE, showAll = false } = {}) => {
    const effectiveFilters = getEffectiveFilters(filters, showAll);
    const searchTerm = String(effectiveFilters.searchTerm || "").toLowerCase();
    const category = String(effectiveFilters.category || "").toLowerCase();
    
    const cases = await getMappedCases();
    const matches = cases.filter((item) => {
      // 1. Category filter (if selected)
      if (category) {
        const hasCategory = (item.documents || []).some(d => String(d.category || "").toLowerCase() === category);
        if (!hasCategory) return false;
      }
      
      // 2. Search term filter (if provided)
      if (searchTerm) {
        const caseMatch = String(item.caseNumber || "").toLowerCase().includes(searchTerm);
        const clientMatch = String(item.client?.name || "").toLowerCase().includes(searchTerm);
        const docMatch = (item.documents || []).some(d => 
          String(d.fileName || "").toLowerCase().includes(searchTerm) || 
          String(d.description || "").toLowerCase().includes(searchTerm) ||
          String(d.category || "").toLowerCase().includes(searchTerm)
        );
        if (!caseMatch && !clientMatch && !docMatch) return false;
      }
      
      return true;
    });

    // If category is selected, we should also filter the documents list INSIDE the matched cases
    // to only show those that match the category.
    const resultItems = matches.map(item => {
      if (!category) return item;
      return {
        ...item,
        documents: (item.documents || []).filter(d => String(d.category || "").toLowerCase() === category)
      };
    });

    return paginateItems(resultItems, page, pageSize);
  },
  getDocuments: async () => getMappedCases(),
  getCalendarEvents: async () => {
    const context = await internalGetWorkspaceContext();
    if (!context?.organizationId) return [];
    return list(
      requireSupabase()
        .from("calendar_events")
        .select("*")
        .eq("organization_id", context.organizationId)
        .order("event_date", { ascending: true })
    );
  },
  saveCalendarEvent: async (eventData, eventId) => {
    const context = await internalGetWorkspaceContext();
    if (!context?.organizationId) throw new Error("No organization workspace is available.");

    const record = {
      organization_id: context.organizationId,
      created_by: context.userId,
      title: eventData.title,
      description: eventData.description || "",
      event_date: eventData.eventDate,
      event_type: eventData.eventType,
      color: eventData.color,
    };

    if (eventId) {
      const { error } = await requireSupabase()
        .from("calendar_events")
        .update(record)
        .eq("id", eventId)
        .eq("organization_id", context.organizationId);
      if (error) throw error;
    } else {
      const { error } = await requireSupabase()
        .from("calendar_events")
        .insert(record);
      if (error) throw error;
    }
  },
  getFollowUps: async () => getMappedCases(),
  searchFollowUps: async ({ filters = {}, page = 1, pageSize = DEFAULT_PAGE_SIZE, showAll = false } = {}) => {
    const context = await internalGetWorkspaceContext();
    if (isLawyerContext(context)) {
      const effectiveFilters = getEffectiveFilters(filters, showAll);
      const cases = await getMappedCases();
      const matches = cases.filter((item) => {
        const dateMatch = !effectiveFilters.date || (item.followUps || []).some((followUp) => String(followUp.scheduledAt || "").startsWith(effectiveFilters.date));
        const caseMatch = !effectiveFilters.caseNumber || String(item.caseNumber || "").toLowerCase().includes(String(effectiveFilters.caseNumber).toLowerCase());
        const clientMatch = !effectiveFilters.clientName || String(item.client?.name || "").toLowerCase().includes(String(effectiveFilters.clientName).toLowerCase());
        return dateMatch && caseMatch && clientMatch;
      });
      return paginateItems(matches, page, pageSize);
    }

    const client = requireSupabase();
    const effectiveFilters = getEffectiveFilters(filters, showAll);
    let query = client.from("followups")
      .select("*, cases!inner(*, clients!inner(*))", { count: "exact" })
      .eq("organization_id", context.organizationId)
      .is("deleted_at", null);

    if (effectiveFilters.date) {
      query = query.gte("date", `${effectiveFilters.date}T00:00:00`).lte("date", `${effectiveFilters.date}T23:59:59`);
    }
    if (effectiveFilters.clientName) query = query.ilike("cases.clients.name", `%${effectiveFilters.clientName}%`);
    if (effectiveFilters.caseNumber) query = query.ilike("cases.case_number", `%${effectiveFilters.caseNumber}%`);

    const { safePage, safePageSize, from, to } = getPageBounds(page, pageSize);
    const { data, count, error } = await query.order("date", { ascending: true }).range(from, to);
    if (error) throw error;

    const dataset = await getWorkspaceData();
    // Unique by case ID to avoid duplicates in the UI
    const uniqueCaseMap = new Map();
    (data || []).forEach(item => {
      if (item.cases && !uniqueCaseMap.has(item.cases.id)) {
        uniqueCaseMap.set(item.cases.id, item.cases);
      }
    });

    const items = await Promise.all(Array.from(uniqueCaseMap.values()).map(caseRecord => mapCaseRecord(caseRecord, dataset)));
    return { items, total: count || 0, page: safePage, pageSize: safePageSize };
  },
  addFollowUp: async (caseId, payload) => {
    const actionKey = `addFollowUp:${caseId}`;
    return ((_k, _f) => _f())(actionKey, async () => {
      const context = await internalGetWorkspaceContext();
      await supabasePlatformApi.getCase(caseId);
      assertFollowUpPayload(payload);
      const { error } = await requireSupabase().from("followups").insert({
        organization_id: context.organizationId,
        case_id: caseId,
        type: payload.type,
        title: payload.title,
        date: toIsoDate(payload.scheduledAt) || new Date().toISOString(),
        status: payload.status,
        notes: payload.notes || "",
        postponed_to: toIsoDate(payload.postponedTo),
        created_by: context.email,
      });

      if (error) throw error;
      resetWorkspaceDataCache();
      return supabasePlatformApi.getCase(caseId);
    });
  },
  updateFollowUp: async (caseId, followUpId, payload) => {
    const actionKey = `updateFollowUp:${followUpId}`;
    return ((_k, _f) => _f())(actionKey, async () => {
      const context = await internalGetWorkspaceContext();
      await supabasePlatformApi.getCase(caseId);
      assertFollowUpPayload(payload);
      const { error } = await requireSupabase()
        .from("followups")
        .update({
          type: payload.type,
          title: payload.title,
          date: toIsoDate(payload.scheduledAt) || new Date().toISOString(),
          status: payload.status,
          notes: payload.notes || "",
          postponed_to: toIsoDate(payload.postponedTo),
          updated_by: context.email,
        })
        .eq("id", followUpId)
        .eq("organization_id", context.organizationId);

      if (error) throw error;
      resetWorkspaceDataCache();
      return supabasePlatformApi.getCase(caseId);
    });
  },
  deleteFollowUp: async (caseId, followUpId) => {
    const context = await internalGetWorkspaceContext();
    const { error } = await requireSupabase()
      .from("followups")
      .update({ deleted_at: new Date().toISOString(), updated_by: context.email })
      .eq("id", followUpId)
      .eq("organization_id", context.organizationId);
    if (error) throw error;
    resetWorkspaceDataCache();
    return supabasePlatformApi.getCase(caseId);
  },

  // Wizard operations
  saveWizardStep: async (payload, clientId) => {
    const actionKey = `saveWizard:${clientId || "new"}`;
    return ((_k, _f) => _f())(actionKey, async () => {
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
        
        await ensurePaymentShell(context.organizationId, savedCaseId);
        
        if (payload.charges && payload.charges.length > 0) {
          const payment = await ensurePaymentShell(context.organizationId, savedCaseId);
          for (const chargePayload of payload.charges) {
            const chargeRecord = {
              organization_id: context.organizationId,
              payment_id: payment.id,
              case_id: savedCaseId,
              name: chargePayload.label,
              total: Number(chargePayload.totalAmount) || 0,
              paid: Number(chargePayload.paidAmount || 0),
              due_date: chargePayload.dueDate || null,
              display_order: chargePayload.displayOrder || 0,
              description: chargePayload.description || "",
              is_lawyer_fee: Boolean(chargePayload.isLawyerFee),
              updated_by: context.email,
            };
            
            if (chargePayload.id) {
              await requireSupabase()
                .from("payment_charges")
                .update(chargeRecord)
                .eq("id", chargePayload.id)
                .eq("organization_id", context.organizationId);
            } else {
              chargeRecord.created_by = context.email;
              const { data: insertedCharge, error: insertError } = await requireSupabase()
                .from("payment_charges")
                .insert(chargeRecord)
                .select("id, name, paid")
                .single();
              
              if (!insertError && insertedCharge?.paid > 0) {
                await requireSupabase().from("payment_history").insert({
                  organization_id: context.organizationId,
                  case_id: savedCaseId,
                  payment_charge_id: insertedCharge.id,
                  charge_name: insertedCharge.name,
                  amount_paid: insertedCharge.paid,
                  payment_mode: "Initial Payment",
                  payment_reference: "",
                  timestamp: new Date().toISOString(),
                  updated_by: context.email,
                  created_by: context.email,
                });
              }
            }
          }
          await syncPaymentTotals(payment.id, context.organizationId);
        }
        
        if (payload.followUps && payload.followUps.length > 0) {
          for (const followUpPayload of payload.followUps) {
            const followUpRecord = {
              organization_id: context.organizationId,
              case_id: savedCaseId,
              type: followUpPayload.type,
              title: followUpPayload.title,
              date: toIsoDate(followUpPayload.scheduledAt) || new Date().toISOString(),
              status: followUpPayload.status || "PENDING",
              notes: followUpPayload.notes || "",
              postponed_to: toIsoDate(followUpPayload.postponedTo),
              updated_by: context.email,
            };
            if (followUpPayload.id) {
              await requireSupabase()
                .from("followups")
                .update(followUpRecord)
                .eq("id", followUpPayload.id)
                .eq("organization_id", context.organizationId);
            } else {
              followUpRecord.created_by = context.email;
              await requireSupabase()
                .from("followups")
                .insert(followUpRecord);
            }
          }
        }
      }
      
      resetWorkspaceDataCache();
      return supabasePlatformApi.getClient(savedClientId);
    });
  },
  getDashboardPayload: async () => {
    const dataset = await getWorkspaceData();
    const indexes = buildDatasetIndexes(dataset);
    const cases = await Promise.all(
      dataset.cases.map((item) =>
        mapCaseRecord(item, dataset, {
          ...indexes,
          includeClientAssets: false,
          includeDocuments: false,
        })
      )
    );
    // Map clients with full details using mapClientRecord
    const clients = await Promise.all(
      dataset.clients.map((client) => mapClientRecord(client, { includeAssets: true }))
    );
    const dashboard = buildDashboardSummary(cases);

    // Derive follow-ups (tasks/dates) from mapped cases to avoid extra DB hits
    const followUps = cases.flatMap(c => (c.followUps || []).map(f => ({ ...f, legalCase: c })));

    return {
      dashboard,
      cases,
      clients,
      tasks: followUps,
      putUpDates: followUps
    };
  },
  getPutUpDates: async () => {
    const { cases } = await supabasePlatformApi.getDashboardPayload();
    return cases.flatMap(c => (c.followUps || []).map(f => ({ ...f, legalCase: c })));
  },
  getCalendarEvents: async () => {
    const context = await internalGetWorkspaceContext();
    if (!context?.organizationId) return [];
    
    const { data, error } = await requireSupabase()
      .from("calendar_events")
      .select("*")
      .eq("organization_id", context.organizationId);
      
    if (error) throw error;
    return data || [];
  },
  saveCalendarEvent: async (payload, eventId) => {
    const context = await internalGetWorkspaceContext();
    if (!context?.organizationId) throw new Error("No organization workspace is available.");
    
    const record = {
      organization_id: context.organizationId,
      title: payload.title?.trim() || "",
      description: payload.description || "",
      event_date: payload.eventDate,
      event_type: payload.eventType || "note",
      color: payload.color || "#3A5BA0",
    };
    
    if (eventId) {
      const { error } = await requireSupabase()
        .from("calendar_events")
        .update(record)
        .eq("id", eventId)
        .eq("organization_id", context.organizationId);
      if (error) throw error;
    } else {
      const { error } = await requireSupabase()
        .from("calendar_events")
        .insert(record);
      if (error) throw error;
    }

    await logSystemEvent(context, "calendar", eventId ? "UPDATE_NOTE" : "CREATE_NOTE", { title: record.title });
  },
  deleteCalendarEvent: async (eventId) => {
    const context = await internalGetWorkspaceContext();
    if (!context?.organizationId) throw new Error("No organization workspace is available.");
    
    const { error } = await requireSupabase()
      .from("calendar_events")
      .delete()
      .eq("id", eventId)
      .eq("organization_id", context.organizationId);
      
    if (error) throw error;
    await logSystemEvent("DELETE_NOTE", `Calendar event deleted: ${eventId}`);
  },
  saveOrganizationSettings: async (payload) => {
    const context = await internalGetWorkspaceContext();
    if (!context?.organizationId) throw new Error("No organization workspace is available.");

    const { error } = await requireSupabase()
      .rpc("update_organization_settings", {
        target_organization_id: context.organizationId,
        organization_name: payload.name?.trim(),
        organization_logo_url: payload.logoUrl || "",
        organization_logo_path: payload.logoPath || "",
      });

    if (error) throw error;
    resetWorkspaceContextCache();
    return internalGetWorkspaceContext({ force: true });
  },
  saveUserProfile: async (payload) => {
    const context = await internalGetWorkspaceContext();
    if (!context?.userId) throw new Error("No user session is available.");

    const client = requireSupabase();
    const profileUpdate = {
      fullName: payload.fullName?.trim() || "",
      avatarUrl: payload.avatarUrl || "",
      avatarPath: payload.avatarPath || "",
    };

    const { error: rpcError } = await client
      .rpc("update_user_profile", {
        user_full_name: profileUpdate.fullName,
        user_avatar_url: profileUpdate.avatarUrl,
        user_avatar_path: profileUpdate.avatarPath,
      });

    if (rpcError && rpcError.code !== "42883" && rpcError.code !== "PGRST202") {
      throw rpcError;
    }

    if (rpcError) {
      const updated = await single(
        client
          .from("users")
          .update({
            full_name: profileUpdate.fullName,
            avatar_url: profileUpdate.avatarUrl,
            avatar_path: profileUpdate.avatarPath,
          })
          .eq("id", context.userId)
          .select("id")
      );
      if (!updated) throw new Error("Profile was not updated. Check the public.users update policy.");
    }

    resetWorkspaceContextCache();
    return internalGetWorkspaceContext({ force: true });
  },

  /* ── Tasks CRUD ─────────────────────────────────────────────────── */
  /**
   * Tasks are stored in a `tasks` table scoped to organization_id.
   * Falls back to localStorage if the table does not exist yet so the
   * UI always works during development / demos.
   */
  getTasks: async () => {
    const context = await internalGetWorkspaceContext();
    if (!context?.organizationId) return [];

    try {
      const { data, error } = await requireSupabase()
        .from("tasks")
        .select("*")
        .eq("organization_id", context.organizationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error && (error.code === "42P01" || error.code === "PGRST200")) {
        // Table doesn't exist yet — use localStorage fallback
        return _localTasks(context.organizationId);
      }
      if (error) throw error;
      return (data || []).map(_mapTask);
    } catch (err) {
      if (err?.code === "42P01" || err?.code === "PGRST200" || String(err?.message || "").includes("does not exist")) {
        return _localTasks(context.organizationId);
      }
      throw err;
    }
  },

  createTask: async (payload) => {
    const context = await internalGetWorkspaceContext();
    if (!context?.organizationId) throw new Error("No workspace.");

    const record = {
      organization_id: context.organizationId,
      title: String(payload.title || "").trim(),
      description: payload.description || "",
      priority: payload.priority || "MEDIUM",
      status: payload.status || "PENDING",
      due_date: payload.dueDate || null,
      assigned_to: payload.assignedTo || "",
      created_by: context.email || "",
    };

    try {
      const { data, error } = await requireSupabase()
        .from("tasks")
        .insert(record)
        .select("*")
        .maybeSingle();
      if (error && (error.code === "42P01" || error.code === "PGRST200")) {
        return _localCreateTask(context.organizationId, payload);
      }
      if (error) throw error;
      return _mapTask(data);
    } catch (err) {
      if (err?.code === "42P01" || String(err?.message || "").includes("does not exist")) {
        return _localCreateTask(context.organizationId, payload);
      }
      throw err;
    }
  },

  updateTask: async (id, payload) => {
    const context = await internalGetWorkspaceContext();
    if (!context?.organizationId) throw new Error("No workspace.");

    const updates = {
      title: String(payload.title || "").trim(),
      description: payload.description || "",
      priority: payload.priority || "MEDIUM",
      status: payload.status || "PENDING",
      due_date: payload.dueDate || null,
      assigned_to: payload.assignedTo || "",
      updated_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await requireSupabase()
        .from("tasks")
        .update(updates)
        .eq("id", id)
        .eq("organization_id", context.organizationId)
        .select("*")
        .maybeSingle();
      if (error && (error.code === "42P01" || error.code === "PGRST200")) {
        return _localUpdateTask(context.organizationId, id, payload);
      }
      if (error) throw error;
      return _mapTask(data);
    } catch (err) {
      if (err?.code === "42P01" || String(err?.message || "").includes("does not exist")) {
        return _localUpdateTask(context.organizationId, id, payload);
      }
      throw err;
    }
  },

  deleteTask: async (id) => {
    const context = await internalGetWorkspaceContext();
    if (!context?.organizationId) throw new Error("No workspace.");

    try {
      const { error } = await requireSupabase()
        .from("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("organization_id", context.organizationId);
      if (error && (error.code === "42P01" || error.code === "PGRST200")) {
        return _localDeleteTask(context.organizationId, id);
      }
      if (error) throw error;
    } catch (err) {
      if (err?.code === "42P01" || String(err?.message || "").includes("does not exist")) {
        return _localDeleteTask(context.organizationId, id);
      }
      throw err;
    }
  },
};

/**
 * Wrap the entire API with a handler that normalizes errors.
 */
const platformProxy = {};
Object.keys(supabasePlatformApi).forEach((key) => {
  const original = supabasePlatformApi[key];
  if (typeof original === "function") {
    platformProxy[key] = async (...args) => {
      try {
        if (isWriteOperation(key)) {
          try { await checkServerRateLimit(key); } catch { /* RPC absent — skip */ }
        }
        return await withRetry(async () => {
          return await original(...args);
        });
      } catch (error) {
        throw normalizeError(error, `Failed to ${key.replace(/([A-Z])/g, " $1").toLowerCase()}.`);
      }
    };
  }
});

const proxiedGetWorkspaceContext = platformProxy.getWorkspaceContext;

export { 
  platformProxy as supabasePlatformApi,
  proxiedGetWorkspaceContext as getWorkspaceContext,
  resetWorkspaceContextCache 
};




