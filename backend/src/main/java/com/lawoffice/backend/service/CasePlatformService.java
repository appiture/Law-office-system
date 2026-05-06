package com.lawoffice.backend.service;

import com.lawoffice.backend.dto.PlatformRequests;
import com.lawoffice.backend.dto.PlatformResponses;

import java.util.List;

public interface CasePlatformService {

    List<PlatformResponses.ClientSummary> listClients();

    PlatformResponses.ClientSummary getClient(Long clientId);

    PlatformResponses.ClientSummary createClient(PlatformRequests.ClientPayload payload, String actor);

    PlatformResponses.ClientSummary updateClient(Long clientId, PlatformRequests.ClientPayload payload, String actor);

    List<PlatformResponses.CaseDetails> listCases();

    PlatformResponses.CaseDetails getCase(Long caseId);

    PlatformResponses.CaseDetails createCase(PlatformRequests.CasePayload payload, String actor);

    PlatformResponses.CaseDetails updateCase(Long caseId, PlatformRequests.CasePayload payload);

    PlatformResponses.CaseDetails addDocument(Long caseId, PlatformRequests.DocumentPayload payload, String actor);

    void deleteDocument(Long caseId, Long documentId);

    List<PlatformResponses.ChargeItem> listChargeItems(Long caseId);

    PlatformResponses.CaseDetails addChargeItem(Long caseId, PlatformRequests.ChargeItemPayload payload);

    PlatformResponses.CaseDetails updateChargeItem(Long caseId, Long chargeItemId, PlatformRequests.ChargeItemPayload payload);

    List<PlatformResponses.PaymentEntry> listPaymentHistory(Long caseId);

    PlatformResponses.CaseDetails addPayment(Long caseId, PlatformRequests.PaymentPayload payload, String actor);

    List<PlatformResponses.FollowUpEntry> listFollowUps(Long caseId);

    PlatformResponses.CaseDetails addFollowUp(Long caseId, PlatformRequests.FollowUpPayload payload, String actor);

    PlatformResponses.CaseDetails updateFollowUp(Long caseId, Long followUpId, PlatformRequests.FollowUpPayload payload);

    void deleteFollowUp(Long caseId, Long followUpId);

    List<PlatformResponses.CaseDetails> listPaymentsModule();

    List<PlatformResponses.CaseDetails> listDocumentsModule();

    List<PlatformResponses.CaseDetails> listFollowUpsModule();

    PlatformResponses.DashboardSummary getDashboardSummary();

    // Wizard operations
    PlatformResponses.WizardSaveResult saveWizardStep(PlatformRequests.WizardSavePayload payload, String actor);
    PlatformResponses.ClientDrafts getClientDrafts(Long clientId);
    PlatformResponses.WizardResumeResult resumeWizard(Long clientId, String actor);
}
