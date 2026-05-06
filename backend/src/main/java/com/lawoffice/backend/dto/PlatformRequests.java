package com.lawoffice.backend.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public final class PlatformRequests {

    private PlatformRequests() {
    }

    public record ClientPayload(
            @NotBlank @Size(max = 150) String name,
            @NotBlank @Pattern(regexp = "^\\d{10}$", message = "Phone number must be exactly 10 digits") String phone,
            @Pattern(regexp = "^\\d{10}$", message = "Alternate phone number must be exactly 10 digits") String altPhone,
            @Size(max = 150) @Email(message = "Email must be a valid email address") String email,
            @Size(max = 255) String address,
            @Size(max = 30) String gender,
            LocalDate dateOfBirth,
            @Size(max = 150) String occupation,
            @Size(max = 120) String city,
            @Size(max = 120) String state,
            @Pattern(regexp = "^\\d{6}$", message = "PIN code must be exactly 6 digits") String pinCode,
            @Size(max = 500) String photoUrl,
            @Size(max = 255) String photoPath,
            @Size(max = 100) String idProofType,
            @Size(max = 150) String idProofNumber,
            @Size(max = 500) String idProofFileUrl,
            @Size(max = 255) String idProofFilePath,
            @Size(max = 2000) String notes
    ) {
    }

    public record CasePayload(
            @NotNull Long clientId,
            @NotBlank @Size(max = 120) String caseNumber,
            @NotBlank @Size(max = 120) String caseType,
            @Size(max = 180) String courtName,
            @Size(max = 150) String assignedLawyer,
            @Size(max = 150) String judgeName,
            LocalDate filingDate,
            LocalDate firstHearingDate,
            LocalDate nextHearingDate,
            @Size(max = 255) String opponentName,
            @Size(max = 150) String opponentLawyer,
            @Size(max = 2000) String caseDescription,
            @Size(max = 40) String status
    ) {
    }

    public record DocumentPayload(
            @NotBlank @Size(max = 40) String category,
            @NotBlank @Size(max = 255) String fileName,
            @NotBlank @Size(max = 500) String fileUrl,
            @Size(max = 255) String filePath,
            @Size(max = 120) String fileType,
            Long fileSize,
            @Size(max = 2000) String description
    ) {
    }

    public record ChargeItemPayload(
            @NotBlank @Size(max = 120) String label,
            @NotNull @DecimalMin("0.01") BigDecimal totalAmount,
            @DecimalMin("0.0") BigDecimal paidAmount,
            LocalDate dueDate,
            @Min(0) @Max(1000) Integer displayOrder,
            Boolean isLawyerFee,
            @Size(max = 500) String description
    ) {
    }

    public record PaymentPayload(
            @NotNull Long chargeItemId,
            @NotNull @DecimalMin("0.01") BigDecimal amount,
            @NotBlank @Size(max = 60) String paymentMode,
            @Size(max = 120) String paymentReference,
            LocalDate paymentDate
    ) {
    }

    public record FollowUpPayload(
            @NotBlank @Size(max = 40) String type,
            @NotBlank @Size(max = 160) String title,
            @NotNull LocalDateTime scheduledAt,
            @NotBlank @Size(max = 40) String status,
            @Size(max = 2000) String notes,
            LocalDateTime postponedTo
    ) {
    }

    public record ClientDraftPayload(
            Long id,
            @NotBlank @Size(max = 150) String name,
            @NotBlank @Pattern(regexp = "^\\d{10}$", message = "Phone number must be exactly 10 digits") String phone,
            @Pattern(regexp = "^\\d{10}$", message = "Alternate phone number must be exactly 10 digits") String altPhone,
            @Size(max = 150) @Email(message = "Email must be a valid email address") String email,
            @Size(max = 255) String address,
            @Size(max = 30) String gender,
            LocalDate dateOfBirth,
            @Size(max = 150) String occupation,
            @Size(max = 120) String city,
            @Size(max = 120) String state,
            @Pattern(regexp = "^\\d{6}$", message = "PIN code must be exactly 6 digits") String pinCode,
            @Size(max = 500) String photoUrl,
            @Size(max = 255) String photoPath,
            @Size(max = 100) String idProofType,
            @Size(max = 150) String idProofNumber,
            @Size(max = 500) String idProofFileUrl,
            @Size(max = 255) String idProofFilePath,
            @Size(max = 2000) String notes,
            Boolean isDraft
    ) {
    }

    public record CaseDraftPayload(
            Long id,
            @NotNull Long clientId,
            @NotBlank @Size(max = 120) String caseNumber,
            @NotBlank @Size(max = 120) String caseType,
            @Size(max = 180) String courtName,
            @Size(max = 150) String assignedLawyer,
            @Size(max = 150) String judgeName,
            LocalDate filingDate,
            LocalDate firstHearingDate,
            LocalDate nextHearingDate,
            @Size(max = 255) String opponentName,
            @Size(max = 150) String opponentLawyer,
            @Size(max = 2000) String caseDescription,
            @Size(max = 40) String status,
            Boolean isDraft
    ) {
    }

    public record WizardSavePayload(
            ClientDraftPayload client,
            CaseDraftPayload caseData,
            List<ChargeItemPayload> charges,
            List<FollowUpPayload> followUps,
            Boolean saveAsDraft,
            Integer currentStep
    ) {
    }
}
