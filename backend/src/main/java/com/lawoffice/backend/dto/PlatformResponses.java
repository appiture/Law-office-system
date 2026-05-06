package com.lawoffice.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public final class PlatformResponses {

    private PlatformResponses() {
    }

    public record CaseSummary(
            Long id,
            String caseNumber,
            String caseType,
            String courtName,
            String assignedLawyer,
            String status,
            BigDecimal totalAmount,
            BigDecimal paidAmount,
            BigDecimal balanceAmount,
            long documentCount,
            long followUpCount
    ) {
    }

    public record ClientSummary(
            Long id,
            String name,
            String photoUrl,
            String phone,
            String altPhone,
            String email,
            String address,
            String gender,
            LocalDate dateOfBirth,
            String occupation,
            String city,
            String state,
            String pinCode,
            String idProofType,
            String idProofNumber,
            String idProofFileUrl,
            String notes,
            String createdBy,
            LocalDateTime createdAt,
            List<CaseSummary> cases
    ) {
    }

    public record CaseClient(
            Long id,
            String name,
            String photoUrl,
            String phone,
            String email
    ) {
    }

    public record ChargeItem(
            Long id,
            String label,
            BigDecimal totalAmount,
            BigDecimal paidAmount,
            BigDecimal balanceAmount,
            LocalDate dueDate,
            String status,
            Integer displayOrder,
            LocalDateTime createdAt,
            Boolean isLawyerFee,
            String description
    ) {
    }

    public record PaymentEntry(
            Long id,
            Long chargeItemId,
            String chargeLabel,
            BigDecimal amount,
            String paymentMode,
            String paymentReference,
            LocalDate paymentDate,
            String recordedBy,
            LocalDateTime createdAt
    ) {
    }

    public record DocumentEntry(
            Long id,
            String category,
            String fileName,
            String fileUrl,
            String filePath,
            String fileType,
            Long fileSize,
            String description,
            String uploadedBy,
            LocalDateTime createdAt
    ) {
    }

    public record FollowUpEntry(
            Long id,
            String type,
            String title,
            LocalDateTime scheduledAt,
            String status,
            String notes,
            LocalDateTime postponedTo,
            String createdBy,
            LocalDateTime createdAt,
            String alertLevel
    ) {
    }

    public record CaseDetails(
            Long id,
            String caseNumber,
            String caseType,
            String courtName,
            String assignedLawyer,
            String judgeName,
            LocalDate filingDate,
            LocalDate firstHearingDate,
            LocalDate nextHearingDate,
            String opponentName,
            String opponentLawyer,
            String caseDescription,
            String status,
            String createdBy,
            LocalDateTime createdAt,
            LocalDateTime updatedAt,
            CaseClient client,
            List<ChargeItem> chargeItems,
            List<PaymentEntry> paymentHistory,
            List<DocumentEntry> documents,
            List<FollowUpEntry> followUps,
            BigDecimal totalAmount,
            BigDecimal paidAmount,
            BigDecimal balanceAmount
    ) {
    }

    public record MetricPoint(
            String label,
            BigDecimal value
    ) {
    }

    public record DashboardSummary(
            BigDecimal totalRevenue,
            BigDecimal totalOutstanding,
            long totalClients,
            long totalCases,
            List<MetricPoint> revenueTrends,
            List<MetricPoint> overduePayments,
            List<MetricPoint> caseDistribution,
            List<CaseDetails> overdueAlerts,
            List<CaseDetails> todayHearings
    ) {
    }

    // =====================================================
    // Wizard-specific response types
    // =====================================================

    public record DraftResumeData(
            PlatformRequests.ClientDraftPayload client,
            PlatformRequests.CaseDraftPayload caseData,
            List<PlatformRequests.ChargeItemPayload> charges,
            List<PlatformRequests.FollowUpPayload> followUps,
            Integer lastStep
    ) {
    }

    public record ClientDrafts(
            ClientSummary client,
            DraftResumeData draftData
    ) {
    }

    public record WizardSaveResult(
            ClientSummary client,
            CaseDetails caseData,
            Integer savedStep,
            Boolean isComplete,
            Boolean isDraft
    ) {
    }

    public record WizardResumeResult(
            PlatformRequests.ClientDraftPayload client,
            PlatformRequests.CaseDraftPayload caseData,
            List<PlatformRequests.ChargeItemPayload> charges,
            List<PlatformRequests.FollowUpPayload> followUps,
            Integer lastStep
    ) {
    }
}
