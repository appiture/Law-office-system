package com.lawoffice.backend.service.impl;

import com.lawoffice.backend.dto.PlatformRequests;
import com.lawoffice.backend.dto.PlatformResponses;
import com.lawoffice.backend.model.CaseChargeItem;
import com.lawoffice.backend.model.CaseDocument;
import com.lawoffice.backend.model.CaseFollowUp;
import com.lawoffice.backend.model.Client;
import com.lawoffice.backend.model.LegalCase;
import com.lawoffice.backend.model.Organization;
import com.lawoffice.backend.model.PaymentHistory;
import com.lawoffice.backend.repository.CaseChargeItemRepository;
import com.lawoffice.backend.repository.CaseDocumentRepository;
import com.lawoffice.backend.repository.CaseFollowUpRepository;
import com.lawoffice.backend.repository.ClientRepository;
import com.lawoffice.backend.repository.LegalCaseRepository;
import com.lawoffice.backend.repository.OrganizationRepository;
import com.lawoffice.backend.repository.PaymentHistoryRepository;
import com.lawoffice.backend.security.TenantContext;
import com.lawoffice.backend.service.CasePlatformService;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.stereotype.Service;
import org.springframework.security.access.AccessDeniedException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@Transactional
public class CasePlatformServiceImpl implements CasePlatformService {

    private final ClientRepository clientRepository;
    private final LegalCaseRepository legalCaseRepository;
    private final CaseDocumentRepository caseDocumentRepository;
    private final CaseChargeItemRepository caseChargeItemRepository;
    private final PaymentHistoryRepository paymentHistoryRepository;
    private final CaseFollowUpRepository caseFollowUpRepository;
    private final OrganizationRepository organizationRepository;

    public CasePlatformServiceImpl(ClientRepository clientRepository,
                                   LegalCaseRepository legalCaseRepository,
                                   CaseDocumentRepository caseDocumentRepository,
                                   CaseChargeItemRepository caseChargeItemRepository,
                                   PaymentHistoryRepository paymentHistoryRepository,
                                   CaseFollowUpRepository caseFollowUpRepository,
                                   OrganizationRepository organizationRepository) {
        this.clientRepository = clientRepository;
        this.legalCaseRepository = legalCaseRepository;
        this.caseDocumentRepository = caseDocumentRepository;
        this.caseChargeItemRepository = caseChargeItemRepository;
        this.paymentHistoryRepository = paymentHistoryRepository;
        this.caseFollowUpRepository = caseFollowUpRepository;
        this.organizationRepository = organizationRepository;
    }

    @Override
    public List<PlatformResponses.ClientSummary> listClients() {
        Long orgId = currentOrganizationId();
        return clientRepository.findAllByOrganizationId(orgId).stream()
                .sorted(Comparator.comparing(Client::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toClientSummary)
                .toList();
    }

    @Override
    public PlatformResponses.ClientSummary getClient(Long clientId) {
        return toClientSummary(requireClient(clientId));
    }

    @Override
    public PlatformResponses.ClientSummary createClient(PlatformRequests.ClientPayload payload, String actor) {
        Long orgId = currentOrganizationId();
        Client client = new Client();
        client.setOrganization(requireOrganization(orgId));
        applyClientPayload(client, payload, actor);
        return toClientSummary(clientRepository.save(client));
    }

    @Override
    public PlatformResponses.ClientSummary updateClient(Long clientId, PlatformRequests.ClientPayload payload, String actor) {
        Client client = requireClient(clientId);
        applyClientPayload(client, payload, client.getCreatedBy() == null || client.getCreatedBy().isBlank() ? actor : client.getCreatedBy());
        return toClientSummary(clientRepository.save(client));
    }

    @Override
    public List<PlatformResponses.CaseDetails> listCases() {
        Long orgId = currentOrganizationId();
        return legalCaseRepository.findAllByOrganizationId(orgId).stream()
                .sorted(Comparator.comparing(LegalCase::getUpdatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toCaseDetails)
                .toList();
    }

    @Override
    public PlatformResponses.CaseDetails getCase(Long caseId) {
        return toCaseDetails(requireCase(caseId));
    }

    @Override
    public PlatformResponses.CaseDetails createCase(PlatformRequests.CasePayload payload, String actor) {
        Long orgId = currentOrganizationId();
        Client client = requireClient(payload.clientId());
        LegalCase legalCase = new LegalCase();
        legalCase.setClient(client);
        legalCase.setOrganization(requireOrganization(orgId));
        legalCase.setCreatedBy(isBlank(actor) ? "lawyer@local.demo" : actor);
        applyCasePayload(legalCase, payload);
        return toCaseDetails(legalCaseRepository.save(legalCase));
    }

    @Override
    public PlatformResponses.CaseDetails updateCase(Long caseId, PlatformRequests.CasePayload payload) {
        LegalCase legalCase = requireCase(caseId);
        Client client = requireClient(payload.clientId());
        if (!sameOrganization(client.getOrganization(), legalCase.getOrganization())) {
            throw new IllegalArgumentException("Case client must belong to the same organization as the case");
        }
        legalCase.setClient(client);
        applyCasePayload(legalCase, payload);
        return toCaseDetails(legalCaseRepository.save(legalCase));
    }

    @Override
    public PlatformResponses.CaseDetails addDocument(Long caseId, PlatformRequests.DocumentPayload payload, String actor) {
        LegalCase legalCase = requireCase(caseId);
        Long orgId = currentOrganizationId();
        CaseDocument document = new CaseDocument();
        document.setLegalCase(legalCase);
        document.setOrganization(legalCase.getOrganization());
        document.setCategory(normalizeUpper(payload.category()));
        document.setFileName(payload.fileName());
        document.setFileUrl(payload.fileUrl());
        document.setFilePath(payload.filePath());
        document.setFileType(payload.fileType());
        document.setFileSize(payload.fileSize());
        document.setDescription(trimToNull(payload.description()));
        document.setUploadedBy(isBlank(actor) ? "lawyer@local.demo" : actor);
        validateDocumentStoragePath(payload.filePath(), orgId, legalCase.getId());
        caseDocumentRepository.save(document);
        return toCaseDetails(legalCase);
    }

    @Override
    public void deleteDocument(Long caseId, Long documentId) {
        LegalCase legalCase = requireCase(caseId);
        CaseDocument document = requireDocument(documentId);
        if (!document.getLegalCase().getId().equals(legalCase.getId())) {
            throw new EntityNotFoundException("Document does not belong to case");
        }
        caseDocumentRepository.delete(document);
    }

    @Override
    public List<PlatformResponses.ChargeItem> listChargeItems(Long caseId) {
        requireCase(caseId);
        Long orgId = currentOrganizationId();
        return caseChargeItemRepository.findByLegalCaseIdAndOrganizationIdOrderByDisplayOrderAsc(caseId, orgId)
                .stream()
                .map(this::toChargeItem)
                .toList();
    }

    @Override
    public PlatformResponses.CaseDetails addChargeItem(Long caseId, PlatformRequests.ChargeItemPayload payload) {
        LegalCase legalCase = requireCase(caseId);
        CaseChargeItem item = new CaseChargeItem();
        item.setLegalCase(legalCase);
        item.setOrganization(legalCase.getOrganization());
        applyChargePayload(item, payload);
        caseChargeItemRepository.save(item);
        return toCaseDetails(legalCase);
    }

    @Override
    public PlatformResponses.CaseDetails updateChargeItem(Long caseId, Long chargeItemId, PlatformRequests.ChargeItemPayload payload) {
        LegalCase legalCase = requireCase(caseId);
        CaseChargeItem item = requireChargeItem(chargeItemId);
        if (!item.getLegalCase().getId().equals(legalCase.getId())) {
            throw new EntityNotFoundException("Charge item does not belong to case");
        }
        applyChargePayload(item, payload);
        caseChargeItemRepository.save(item);
        return toCaseDetails(legalCase);
    }

    @Override
    public List<PlatformResponses.PaymentEntry> listPaymentHistory(Long caseId) {
        requireCase(caseId);
        Long orgId = currentOrganizationId();
        return paymentHistoryRepository.findByLegalCaseIdAndOrganizationIdOrderByCreatedAtDesc(caseId, orgId)
                .stream()
                .map(this::toPaymentEntry)
                .toList();
    }

    @Override
    public PlatformResponses.CaseDetails addPayment(Long caseId, PlatformRequests.PaymentPayload payload, String actor) {
        LegalCase legalCase = requireCase(caseId);
        CaseChargeItem item = requireChargeItem(payload.chargeItemId());
        if (!item.getLegalCase().getId().equals(legalCase.getId())) {
            throw new EntityNotFoundException("Charge item does not belong to case");
        }
        if (payload.amount().compareTo(item.getBalanceAmount()) > 0) {
            throw new IllegalArgumentException("Payment amount cannot exceed remaining balance");
        }

        PaymentHistory history = new PaymentHistory();
        history.setLegalCase(legalCase);
        history.setChargeItem(item);
        history.setOrganization(legalCase.getOrganization());
        history.setAmount(payload.amount());
        history.setPaymentMode(requiredTrimmed(payload.paymentMode(), "Payment mode"));
        history.setPaymentReference(trimToNull(payload.paymentReference()));
        history.setPaymentDate(payload.paymentDate() == null ? LocalDate.now() : payload.paymentDate());
        history.setRecordedBy(isBlank(actor) ? "lawyer@local.demo" : actor);
        paymentHistoryRepository.save(history);

        item.setPaidAmount(item.getPaidAmount().add(payload.amount()));
        caseChargeItemRepository.save(item);
        return toCaseDetails(legalCase);
    }

    @Override
    public List<PlatformResponses.FollowUpEntry> listFollowUps(Long caseId) {
        requireCase(caseId);
        Long orgId = currentOrganizationId();
        return caseFollowUpRepository.findByLegalCaseIdAndOrganizationIdOrderByScheduledAtAsc(caseId, orgId)
                .stream()
                .map(this::toFollowUpEntry)
                .toList();
    }

    @Override
    public PlatformResponses.CaseDetails addFollowUp(Long caseId, PlatformRequests.FollowUpPayload payload, String actor) {
        LegalCase legalCase = requireCase(caseId);
        CaseFollowUp followUp = new CaseFollowUp();
        followUp.setLegalCase(legalCase);
        followUp.setOrganization(legalCase.getOrganization());
        followUp.setCreatedBy(isBlank(actor) ? "lawyer@local.demo" : actor);
        applyFollowUpPayload(followUp, payload);
        caseFollowUpRepository.save(followUp);
        return toCaseDetails(legalCase);
    }

    @Override
    public PlatformResponses.CaseDetails updateFollowUp(Long caseId, Long followUpId, PlatformRequests.FollowUpPayload payload) {
        LegalCase legalCase = requireCase(caseId);
        CaseFollowUp followUp = requireFollowUp(followUpId);
        if (!followUp.getLegalCase().getId().equals(legalCase.getId())) {
            throw new EntityNotFoundException("Follow-up does not belong to case");
        }
        applyFollowUpPayload(followUp, payload);
        caseFollowUpRepository.save(followUp);
        return toCaseDetails(legalCase);
    }

    @Override
    public void deleteFollowUp(Long caseId, Long followUpId) {
        LegalCase legalCase = requireCase(caseId);
        CaseFollowUp followUp = requireFollowUp(followUpId);
        if (!followUp.getLegalCase().getId().equals(legalCase.getId())) {
            throw new EntityNotFoundException("Follow-up does not belong to case");
        }
        caseFollowUpRepository.delete(followUp);
    }

    @Override
    public List<PlatformResponses.CaseDetails> listPaymentsModule() { return listCases(); }

    @Override
    public List<PlatformResponses.CaseDetails> listDocumentsModule() { return listCases(); }

    @Override
    public List<PlatformResponses.CaseDetails> listFollowUpsModule() { return listCases(); }

    @Override
    public PlatformResponses.DashboardSummary getDashboardSummary() {
        List<PlatformResponses.CaseDetails> cases = listCases();
        BigDecimal totalRevenue = cases.stream()
                .map(caseDetails -> sumChargeItems(caseDetails, PlatformResponses.ChargeItem::paidAmount))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalOutstanding = cases.stream()
                .map(caseDetails -> sumChargeItems(caseDetails, PlatformResponses.ChargeItem::balanceAmount))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<YearMonth, BigDecimal> revenueByMonth = new LinkedHashMap<>();
        cases.stream()
                .flatMap(caseDetails -> caseDetails.paymentHistory().stream())
                .sorted(Comparator.comparing(PlatformResponses.PaymentEntry::createdAt))
                .filter(payment -> isLawyerFeeItem(payment.chargeLabel()))
                .forEach(payment -> revenueByMonth.merge(YearMonth.from(payment.createdAt()), payment.amount(), BigDecimal::add));

        List<PlatformResponses.MetricPoint> revenueTrend = revenueByMonth.entrySet().stream()
                .map(entry -> new PlatformResponses.MetricPoint(entry.getKey().format(DateTimeFormatter.ofPattern("MMM yyyy")), entry.getValue()))
                .toList();

        Map<String, BigDecimal> overdueByCase = listCases().stream()
                .flatMap(caseDetails -> caseDetails.chargeItems().stream()
                        .filter(item -> isLawyerFeeItem(item.label()) && "OVERDUE".equalsIgnoreCase(item.status()))
                        .map(item -> Map.entry(caseDetails.caseNumber(), item.balanceAmount())))
                .collect(Collectors.groupingBy(Map.Entry::getKey, LinkedHashMap::new,
                        Collectors.mapping(Map.Entry::getValue, Collectors.reducing(BigDecimal.ZERO, BigDecimal::add))));

        List<PlatformResponses.MetricPoint> overduePayments = overdueByCase.entrySet().stream()
                .map(entry -> new PlatformResponses.MetricPoint(entry.getKey(), entry.getValue()))
                .toList();

        List<PlatformResponses.MetricPoint> caseDistribution = cases.stream()
                .collect(Collectors.groupingBy(PlatformResponses.CaseDetails::caseType, LinkedHashMap::new, Collectors.counting()))
                .entrySet().stream()
                .map(entry -> new PlatformResponses.MetricPoint(entry.getKey(), BigDecimal.valueOf(entry.getValue())))
                .toList();

        LocalDate today = LocalDate.now();
        List<PlatformResponses.CaseDetails> overdueAlerts = cases.stream()
                .filter(caseDetails -> caseDetails.chargeItems().stream()
                        .anyMatch(item -> isLawyerFeeItem(item.label()) && "OVERDUE".equalsIgnoreCase(item.status())))
                .toList();
        List<PlatformResponses.CaseDetails> todayHearings = cases.stream()
                .filter(caseDetails -> caseDetails.followUps().stream().anyMatch(followUp ->
                        "HEARING".equalsIgnoreCase(followUp.type()) && followUp.scheduledAt().toLocalDate().isEqual(today)))
                .toList();

        return new PlatformResponses.DashboardSummary(
                totalRevenue,
                totalOutstanding,
                (long) listClients().size(),
                (long) cases.size(),
                revenueTrend,
                overduePayments,
                caseDistribution,
                overdueAlerts,
                todayHearings
        );
    }

    private Client requireClient(Long clientId) {
        Long orgId = currentOrganizationId();
        return clientRepository.findByIdAndOrganizationId(clientId, orgId)
                .orElseThrow(() -> new EntityNotFoundException("Client not found or not in your organization"));
    }

    private LegalCase requireCase(Long caseId) {
        Long orgId = currentOrganizationId();
        return legalCaseRepository.findByIdAndOrganizationId(caseId, orgId)
                .orElseThrow(() -> new EntityNotFoundException("Case not found or not in your organization"));
    }

    private void applyClientPayload(Client client, PlatformRequests.ClientPayload payload, String actor) {
        String clientName = requiredTrimmed(payload.name(), "Client name");
        String phone = digitsOnly(payload.phone());
        if (!phone.matches("^\\d{10}$")) {
            throw new IllegalArgumentException("Phone number must be exactly 10 digits");
        }

        String email = trimToNull(payload.email());
        if (email != null && !email.matches("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")) {
            throw new IllegalArgumentException("Email must be a valid email address");
        }
        String altPhone = digitsOnly(payload.altPhone());
        if (!isBlank(payload.altPhone()) && !altPhone.matches("^\\d{10}$")) {
            throw new IllegalArgumentException("Alternate phone number must be exactly 10 digits");
        }
        String pinCode = trimToNull(payload.pinCode());
        if (pinCode != null && !pinCode.matches("^\\d{6}$")) {
            throw new IllegalArgumentException("PIN code must be exactly 6 digits");
        }

        client.setName(clientName);
        client.setPhone(phone);
        client.setAltPhone(isBlank(payload.altPhone()) ? null : altPhone);
        client.setEmail(email == null ? null : email.toLowerCase(Locale.ROOT));
        client.setAddress(trimToNull(payload.address()));
        client.setGender(trimToNull(payload.gender()));
        client.setDateOfBirth(payload.dateOfBirth());
        client.setOccupation(trimToNull(payload.occupation()));
        client.setCity(trimToNull(payload.city()));
        client.setState(trimToNull(payload.state()));
        client.setPinCode(pinCode);
        client.setPhotoUrl(trimToNull(payload.photoUrl()));
        client.setPhotoPath(trimToNull(payload.photoPath()));
        client.setIdProofType(trimToNull(payload.idProofType()));
        client.setIdProofNumber(trimToNull(payload.idProofNumber()));
        client.setIdProofFileUrl(trimToNull(payload.idProofFileUrl()));
        client.setIdProofFilePath(trimToNull(payload.idProofFilePath()));
        client.setNotes(trimToNull(payload.notes()));
        client.setCreatedBy(isBlank(actor) ? "lawyer@local.demo" : actor);
    }

    private void applyCasePayload(LegalCase legalCase, PlatformRequests.CasePayload payload) {
        Long orgId = currentOrganizationId();
        String caseNumber = requiredTrimmed(payload.caseNumber(), "Case number");
        String caseType = requiredTrimmed(payload.caseType(), "Case type");

        legalCaseRepository.findByCaseNumberAndOrganizationId(caseNumber, orgId)
                .filter(existing -> !existing.getId().equals(legalCase.getId()))
                .ifPresent(existing -> {
                    throw new IllegalArgumentException("Case number already exists in your organization");
                });

        legalCase.setCaseNumber(caseNumber);
        legalCase.setCaseType(caseType);
        legalCase.setCourtName(trimToNull(payload.courtName()));
        legalCase.setAssignedLawyer(trimToNull(payload.assignedLawyer()));
        legalCase.setJudgeName(trimToNull(payload.judgeName()));
        legalCase.setFilingDate(payload.filingDate());
        legalCase.setFirstHearingDate(payload.firstHearingDate());
        legalCase.setNextHearingDate(payload.nextHearingDate());
        legalCase.setOpponentName(trimToNull(payload.opponentName()));
        legalCase.setOpponentLawyer(trimToNull(payload.opponentLawyer()));
        legalCase.setCaseDescription(trimToNull(payload.caseDescription()));
        legalCase.setStatus(normalizeCaseStatus(payload.status(), "RUNNING"));
    }

    private void applyChargePayload(CaseChargeItem item, PlatformRequests.ChargeItemPayload payload) {
        item.setLabel(requiredTrimmed(payload.label(), "Fee category label"));
        item.setTotalAmount(payload.totalAmount());
        item.setPaidAmount(payload.paidAmount() == null ? BigDecimal.ZERO : payload.paidAmount());
        item.setDueDate(payload.dueDate());
        item.setDisplayOrder(payload.displayOrder() == null ? 0 : payload.displayOrder());
        item.setIsLawyerFee(Boolean.TRUE.equals(payload.isLawyerFee()) || isLawyerFeeItem(payload.label()));
        item.setDescription(trimToNull(payload.description()));
        if (item.getPaidAmount().compareTo(item.getTotalAmount()) > 0) {
            throw new IllegalArgumentException("Paid amount cannot exceed total amount");
        }
    }

    private void applyFollowUpPayload(CaseFollowUp followUp, PlatformRequests.FollowUpPayload payload) {
        followUp.setType(normalizeUpper(payload.type()));
        followUp.setTitle(requiredTrimmed(payload.title(), "Follow-up title"));
        followUp.setScheduledAt(payload.scheduledAt());
        followUp.setStatus(normalizeFollowUpStatus(payload.status()));
        followUp.setNotes(trimToNull(payload.notes()));
        followUp.setPostponedTo(payload.postponedTo());
        if ("POSTPONED".equalsIgnoreCase(followUp.getStatus()) && followUp.getPostponedTo() == null) {
            throw new IllegalArgumentException("A postponed follow-up must include the postponed date");
        }
    }

    private PlatformResponses.ClientSummary toClientSummary(Client client) {
        Long orgId = currentOrganizationId();
        List<PlatformResponses.CaseSummary> cases = legalCaseRepository.findAllByOrganizationId(orgId).stream()
                .filter(legalCase -> legalCase.getClient().getId().equals(client.getId()))
                .sorted(Comparator.comparing(LegalCase::getUpdatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(legalCase -> new PlatformResponses.CaseSummary(
                        legalCase.getId(),
                        legalCase.getCaseNumber(),
                        legalCase.getCaseType(),
                        legalCase.getCourtName(),
                        legalCase.getAssignedLawyer(),
                        legalCase.getStatus(),
                        sumTotal(legalCase),
                        sumPaid(legalCase),
                        sumBalance(legalCase),
                        legalCase.getDocuments().size(),
                        legalCase.getFollowUps().size()
                ))
                .toList();

        return new PlatformResponses.ClientSummary(
                client.getId(),
                client.getName(),
                client.getPhotoUrl(),
                client.getPhone(),
                client.getAltPhone(),
                client.getEmail(),
                client.getAddress(),
                client.getGender(),
                client.getDateOfBirth(),
                client.getOccupation(),
                client.getCity(),
                client.getState(),
                client.getPinCode(),
                client.getIdProofType(),
                client.getIdProofNumber(),
                client.getIdProofFileUrl(),
                client.getNotes(),
                client.getCreatedBy(),
                client.getCreatedAt(),
                cases
        );
    }

    private PlatformResponses.CaseDetails toCaseDetails(LegalCase legalCase) {
        Long orgId = currentOrganizationId();
        List<PlatformResponses.ChargeItem> chargeItems = caseChargeItemRepository
                .findByLegalCaseIdAndOrganizationIdOrderByDisplayOrderAsc(legalCase.getId(), orgId)
                .stream()
                .sorted(Comparator.comparing(CaseChargeItem::getDisplayOrder).thenComparing(CaseChargeItem::getId))
                .map(this::toChargeItem)
                .toList();
        List<PlatformResponses.PaymentEntry> payments = paymentHistoryRepository
                .findByLegalCaseIdAndOrganizationIdOrderByCreatedAtDesc(legalCase.getId(), orgId)
                .stream()
                .sorted(Comparator.comparing(PaymentHistory::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toPaymentEntry)
                .toList();
        List<PlatformResponses.DocumentEntry> documents = caseDocumentRepository
                .findByLegalCaseIdAndOrganizationIdOrderByCreatedAtDesc(legalCase.getId(), orgId)
                .stream()
                .sorted(Comparator.comparing(CaseDocument::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(document -> new PlatformResponses.DocumentEntry(
                        document.getId(),
                        document.getCategory(),
                        document.getFileName(),
                        document.getFileUrl(),
                        document.getFilePath(),
                        document.getFileType(),
                        document.getFileSize(),
                        document.getDescription(),
                        document.getUploadedBy(),
                        document.getCreatedAt()))
                .toList();
        List<PlatformResponses.FollowUpEntry> followUps = caseFollowUpRepository
                .findByLegalCaseIdAndOrganizationIdOrderByScheduledAtAsc(legalCase.getId(), orgId)
                .stream()
                .sorted(Comparator.comparing(CaseFollowUp::getScheduledAt))
                .map(this::toFollowUpEntry)
                .toList();

        return new PlatformResponses.CaseDetails(
                legalCase.getId(),
                legalCase.getCaseNumber(),
                legalCase.getCaseType(),
                legalCase.getCourtName(),
                legalCase.getAssignedLawyer(),
                legalCase.getJudgeName(),
                legalCase.getFilingDate(),
                legalCase.getFirstHearingDate(),
                legalCase.getNextHearingDate(),
                legalCase.getOpponentName(),
                legalCase.getOpponentLawyer(),
                legalCase.getCaseDescription(),
                legalCase.getStatus(),
                legalCase.getCreatedBy(),
                legalCase.getCreatedAt(),
                legalCase.getUpdatedAt(),
                new PlatformResponses.CaseClient(
                        legalCase.getClient().getId(),
                        legalCase.getClient().getName(),
                        legalCase.getClient().getPhotoUrl(),
                        legalCase.getClient().getPhone(),
                        legalCase.getClient().getEmail()
                ),
                chargeItems,
                payments,
                documents,
                followUps,
                sumTotal(legalCase),
                sumPaid(legalCase),
                sumBalance(legalCase)
        );
    }

    private PlatformResponses.ChargeItem toChargeItem(CaseChargeItem item) {
        return new PlatformResponses.ChargeItem(item.getId(), item.getLabel(), item.getTotalAmount(), item.getPaidAmount(), item.getBalanceAmount(), item.getDueDate(), item.getStatus(), item.getDisplayOrder(), item.getCreatedAt(), item.getIsLawyerFee(), item.getDescription());
    }

    private PlatformResponses.PaymentEntry toPaymentEntry(PaymentHistory paymentHistory) {
        return new PlatformResponses.PaymentEntry(paymentHistory.getId(), paymentHistory.getChargeItem().getId(), paymentHistory.getChargeItem().getLabel(), paymentHistory.getAmount(), paymentHistory.getPaymentMode(), paymentHistory.getPaymentReference(), paymentHistory.getPaymentDate(), paymentHistory.getRecordedBy(), paymentHistory.getCreatedAt());
    }

    private PlatformResponses.FollowUpEntry toFollowUpEntry(CaseFollowUp followUp) {
        return new PlatformResponses.FollowUpEntry(followUp.getId(), followUp.getType(), followUp.getTitle(), followUp.getScheduledAt(), followUp.getStatus(), followUp.getNotes(), followUp.getPostponedTo(), followUp.getCreatedBy(), followUp.getCreatedAt(), deriveAlertLevel(followUp));
    }

    private String deriveAlertLevel(CaseFollowUp followUp) {
        LocalDate today = LocalDate.now();
        LocalDate scheduledDate = "POSTPONED".equalsIgnoreCase(followUp.getStatus()) && followUp.getPostponedTo() != null
                ? followUp.getPostponedTo().toLocalDate()
                : followUp.getScheduledAt().toLocalDate();
        if ("COMPLETED".equalsIgnoreCase(followUp.getStatus())) return "completed";
        if (scheduledDate.isBefore(today)) return "missed";
        if (scheduledDate.isEqual(today)) return "today";
        if (!scheduledDate.isAfter(today.plusDays(3))) return "upcoming";
        return "planned";
    }

    private BigDecimal sumTotal(LegalCase legalCase) {
        return legalCase.getChargeItems().stream().map(CaseChargeItem::getTotalAmount).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal sumPaid(LegalCase legalCase) {
        return legalCase.getChargeItems().stream().map(CaseChargeItem::getPaidAmount).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal sumBalance(LegalCase legalCase) {
        return legalCase.getChargeItems().stream().map(CaseChargeItem::getBalanceAmount).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal sumChargeItems(PlatformResponses.CaseDetails caseDetails,
                                      java.util.function.Function<PlatformResponses.ChargeItem, BigDecimal> extractor) {
        return caseDetails.chargeItems().stream()
                .filter(item -> isLawyerFeeItem(item.label()))
                .map(extractor)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
    }

    private boolean isLawyerFeeItem(String label) {
        if (label == null || label.isBlank()) {
            return false;
        }
        if ("lawyer fees".equalsIgnoreCase(label.trim())) {
            return true;
        }
        String normalized = label.trim().toLowerCase();
        return normalized.contains("lawyer")
                || normalized.contains("advocate")
                || normalized.contains("attorney")
                || normalized.contains("counsel")
                || normalized.contains("retainer")
                || normalized.contains("advisory")
                || normalized.contains("professional fee");
    }

    private String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String normalizeUpper(String value) {
        return value == null ? null : value.trim().toUpperCase();
    }

    private String normalizeCaseStatus(String value, String fallback) {
        String normalized = normalizeUpper(value);
        if (isBlank(normalized)) {
            return fallback;
        }
        return switch (normalized) {
            case "OPEN" -> "RUNNING";
            default -> normalized;
        };
    }

    private String normalizeFollowUpStatus(String value) {
        String normalized = normalizeUpper(value);
        if (isBlank(normalized)) {
            return "PENDING";
        }
        return switch (normalized) {
            case "CANCELLED" -> "POSTPONED";
            default -> normalized;
        };
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private Long currentOrganizationId() {
        Long orgId = TenantContext.getCurrentTenant();
        if (orgId == null) {
            throw new AccessDeniedException("No organization context is available for this request");
        }
        return orgId;
    }

    private Organization requireOrganization(Long orgId) {
        return organizationRepository.findById(orgId)
                .orElseThrow(() -> new EntityNotFoundException("Organization not found"));
    }

    private CaseDocument requireDocument(Long documentId) {
        Long orgId = currentOrganizationId();
        return caseDocumentRepository.findByIdAndOrganizationId(documentId, orgId)
                .orElseThrow(() -> new EntityNotFoundException("Document not found in your organization"));
    }

    private CaseChargeItem requireChargeItem(Long chargeItemId) {
        Long orgId = currentOrganizationId();
        return caseChargeItemRepository.findByIdAndOrganizationId(chargeItemId, orgId)
                .orElseThrow(() -> new EntityNotFoundException("Charge item not found in your organization"));
    }

    private CaseFollowUp requireFollowUp(Long followUpId) {
        Long orgId = currentOrganizationId();
        return caseFollowUpRepository.findByIdAndOrganizationId(followUpId, orgId)
                .orElseThrow(() -> new EntityNotFoundException("Follow-up not found in your organization"));
    }

    private void validateDocumentStoragePath(String filePath, Long orgId, Long caseId) {
        if (isBlank(filePath)) {
            return;
        }

        String expectedPrefix = "org-" + orgId + "/case-" + caseId + "/";
        if (!filePath.startsWith(expectedPrefix)) {
            throw new IllegalArgumentException("Document storage path must stay inside the current organization and case folder");
        }
    }

    private String requiredTrimmed(String value, String label) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            throw new IllegalArgumentException(label + " is required");
        }
        return trimmed;
    }

    private String digitsOnly(String value) {
        return value == null ? "" : value.replaceAll("\\D", "");
    }

    private boolean sameOrganization(Organization left, Organization right) {
        return left != null && right != null && left.getId() != null && left.getId().equals(right.getId());
    }

    // =====================================
    // Wizard Operations
    // =====================================

    @Override
    @Transactional
    public PlatformResponses.WizardSaveResult saveWizardStep(
            PlatformRequests.WizardSavePayload payload, String actor) {
        
        Long orgId = currentOrganizationId();
        String normalizedActor = isBlank(actor) ? "lawyer@local.demo" : actor;
        
        // Save/Update Client
        Client client = null;
        if (payload.client() != null) {
            PlatformRequests.ClientDraftPayload clientPayload = payload.client();
            if (clientPayload.id() != null) {
                client = requireClient(clientPayload.id());
                if (!sameOrganization(client.getOrganization(), requireOrganization(orgId))) {
                    throw new IllegalArgumentException("Client does not belong to your organization");
                }
                applyClientPayload(client, clientPayload, normalizedActor);
            } else {
                client = new Client();
                client.setOrganization(requireOrganization(orgId));
                applyClientPayload(client, clientPayload, normalizedActor);
            }
            if (payload.saveAsDraft() != null && payload.saveAsDraft()) {
                client.setIsDraft(true);
            }
            client = clientRepository.save(client);
        }

        // Save/Update Case
        LegalCase legalCase = null;
        if (payload.caseData() != null && client != null) {
            PlatformRequests.CaseDraftPayload casePayload = payload.caseData();
            if (casePayload.id() != null) {
                legalCase = requireCase(casePayload.id());
                if (!legalCase.getClient().getId().equals(client.getId())) {
                    throw new IllegalArgumentException("Case does not belong to the specified client");
                }
                if (!sameOrganization(legalCase.getOrganization(), requireOrganization(orgId))) {
                    throw new IllegalArgumentException("Case does not belong to your organization");
                }
                legalCase.setClient(client);
                applyCasePayload(legalCase, casePayload);
            } else {
                legalCase = new LegalCase();
                legalCase.setClient(client);
                legalCase.setOrganization(requireOrganization(orgId));
                legalCase.setCreatedBy(normalizedActor);
                applyCasePayload(legalCase, casePayload);
            }
            if (payload.saveAsDraft() != null && payload.saveAsDraft()) {
                // Mark case as incomplete/draft via status if needed
                if (legalCase.getStatus() == null) {
                    legalCase.setStatus("DRAFT");
                }
            }
            legalCase = legalCaseRepository.save(legalCase);

            // Ensure payment shell exists
            ensurePaymentShell(orgId, legalCase.getId());
        }

        // Save charge items
        if (payload.charges() != null && !payload.charges().isEmpty() && legalCase != null) {
            for (PlatformRequests.ChargeItemPayload chargePayload : payload.charges()) {
                CaseChargeItem existing = caseChargeItemRepository
                        .findByLegalCaseIdAndOrganizationIdAndLabel(legalCase.getId(), orgId, chargePayload.label())
                        .orElse(null);
                if (existing != null) {
                    applyChargePayload(existing, chargePayload);
                    caseChargeItemRepository.save(existing);
                } else {
                    CaseChargeItem item = new CaseChargeItem();
                    item.setLegalCase(legalCase);
                    item.setOrganization(requireOrganization(orgId));
                    applyChargePayload(item, chargePayload);
                    caseChargeItemRepository.save(item);
                }
            }
        }

        // Save follow-ups
        if (payload.followUps() != null && !payload.followUps().isEmpty() && legalCase != null) {
            for (PlatformRequests.FollowUpPayload followUpPayload : payload.followUps()) {
                applyFollowUpPayloadForWizard(legalCase, followUpPayload, orgId, normalizedActor);
            }
        }

        Boolean isComplete = payload.saveAsDraft() != null && !payload.saveAsDraft();

        return new PlatformResponses.WizardSaveResult(
                client != null ? toClientSummary(client) : null,
                legalCase != null ? toCaseDetails(legalCase) : null,
                payload.currentStep(),
                isComplete,
                payload.saveAsDraft()
        );
    }

    @Override
    @Transactional(readOnly = true)
    public PlatformResponses.ClientDrafts getClientDrafts(Long clientId) {
        Client client = requireClient(clientId);
        if (!Boolean.TRUE.equals(client.getIsDraft())) {
            throw new IllegalArgumentException("Client is not a draft");
        }

        PlatformResponses.ClientSummary clientSummary = toClientSummary(client);
        
        // Get the first case (if any) for draft data
        List<LegalCase> clientCases = legalCaseRepository.findAllByOrganizationIdAndClientId(
                currentOrganizationId(), clientId);
        
         PlatformResponses.DraftResumeData draftData = null;
        if (!clientCases.isEmpty()) {
            LegalCase draftCase = clientCases.get(0);
            List<CaseChargeItem> chargeItems = caseChargeItemRepository
                    .findByLegalCaseIdAndOrganizationIdOrderByDisplayOrderAsc(draftCase.getId(), currentOrganizationId());
            List<CaseFollowUp> followUps = caseFollowUpRepository
                    .findByLegalCaseIdAndOrganizationIdOrderByScheduledAtAsc(draftCase.getId(), currentOrganizationId());
            
             draftData = new PlatformResponses.DraftResumeData(
                    new PlatformRequests.ClientDraftPayload(
                            client.getId(),
                            client.getName(),
                            client.getPhone(),
                            client.getAltPhone(),
                            client.getEmail(),
                            client.getAddress(),
                            client.getGender(),
                            client.getDateOfBirth(),
                            client.getOccupation(),
                            client.getCity(),
                            client.getState(),
                            client.getPinCode(),
                            client.getPhotoUrl(),
                            client.getPhotoPath(),
                            client.getIdProofType(),
                            client.getIdProofNumber(),
                            client.getIdProofFileUrl(),
                            client.getIdProofFilePath(),
                            client.getNotes(),
                            client.getIsDraft()
                    ),
                    new PlatformRequests.CaseDraftPayload(
                            draftCase.getId(),
                            draftCase.getClient().getId(),
                            draftCase.getCaseNumber(),
                            draftCase.getCaseType(),
                            draftCase.getCourtName(),
                            draftCase.getAssignedLawyer(),
                            draftCase.getJudgeName(),
                            draftCase.getFilingDate(),
                            draftCase.getFirstHearingDate(),
                            draftCase.getNextHearingDate(),
                            draftCase.getOpponentName(),
                            draftCase.getOpponentLawyer(),
                            draftCase.getCaseDescription(),
                            draftCase.getStatus(),
                            client.getIsDraft()
                    ),
                    chargeItems.stream().map(item -> 
                        new PlatformRequests.ChargeItemPayload(
                                item.getLabel(),
                                item.getTotalAmount(),
                                item.getPaidAmount(),
                                item.getDueDate(),
                                item.getDisplayOrder(),
                                item.getIsLawyerFee(),
                                item.getDescription()
                        )).toList(),
                    followUps.stream().map(fu ->
                        new PlatformRequests.FollowUpPayload(
                                fu.getType(),
                                fu.getTitle(),
                                fu.getScheduledAt(),
                                fu.getStatus(),
                                fu.getNotes(),
                                fu.getPostponedTo()
                        )).toList(),
                    1  // Default to step 1 for resume
            );
        }

        return new PlatformResponses.ClientDrafts(clientSummary, draftData);
    }

    @Override
    @Transactional(readOnly = true)
    public PlatformResponses.WizardResumeResult resumeWizard(Long clientId, String actor) {
        PlatformResponses.ClientDrafts clientDrafts = getClientDrafts(clientId);
        if (clientDrafts.draftData() == null) {
            throw new IllegalArgumentException("No draft data found for this client");
        }
        return new PlatformResponses.WizardResumeResult(
                clientDrafts.draftData().client(),
                clientDrafts.draftData().caseData(),
                clientDrafts.draftData().charges(),
                clientDrafts.draftData().followUps(),
                clientDrafts.draftData().lastStep()
        );
    }

    // =====================================
    // Helper Methods for Wizard
    // =====================================

    private void applyClientPayload(Client client, PlatformRequests.ClientDraftPayload payload, String actor) {
        String clientName = requiredTrimmed(payload.name(), "Client name");
        String phone = digitsOnly(payload.phone());
        if (!phone.matches("^\\d{10}$")) {
            throw new IllegalArgumentException("Phone number must be exactly 10 digits");
        }

        String email = trimToNull(payload.email());
        if (email != null && !email.matches("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")) {
            throw new IllegalArgumentException("Email must be a valid email address");
        }
        String altPhone = digitsOnly(payload.altPhone());
        if (!isBlank(payload.altPhone()) && !altPhone.matches("^\\d{10}$")) {
            throw new IllegalArgumentException("Alternate phone number must be exactly 10 digits");
        }
        String pinCode = trimToNull(payload.pinCode());
        if (pinCode != null && !pinCode.matches("^\\d{6}$")) {
            throw new IllegalArgumentException("PIN code must be exactly 6 digits");
        }

        client.setName(clientName);
        client.setPhone(phone);
        client.setAltPhone(isBlank(payload.altPhone()) ? null : altPhone);
        client.setEmail(email == null ? null : email.toLowerCase(java.util.Locale.ROOT));
        client.setAddress(trimToNull(payload.address()));
        client.setGender(trimToNull(payload.gender()));
        client.setDateOfBirth(payload.dateOfBirth());
        client.setOccupation(trimToNull(payload.occupation()));
        client.setCity(trimToNull(payload.city()));
        client.setState(trimToNull(payload.state()));
        client.setPinCode(pinCode);
        client.setPhotoUrl(trimToNull(payload.photoUrl()));
        client.setPhotoPath(trimToNull(payload.photoPath()));
        client.setIdProofType(trimToNull(payload.idProofType()));
        client.setIdProofNumber(trimToNull(payload.idProofNumber()));
        client.setIdProofFileUrl(trimToNull(payload.idProofFileUrl()));
        client.setIdProofFilePath(trimToNull(payload.idProofFilePath()));
        client.setNotes(trimToNull(payload.notes()));
        if (client.getCreatedBy() == null || client.getCreatedBy().isBlank()) {
            client.setCreatedBy(isBlank(actor) ? "lawyer@local.demo" : actor);
        }
    }

    private void applyCasePayload(LegalCase legalCase, PlatformRequests.CaseDraftPayload payload) {
        String caseNumber = requiredTrimmed(payload.caseNumber(), "Case number");
        String caseType = requiredTrimmed(payload.caseType(), "Case type");

        legalCaseRepository.findByCaseNumberAndOrganizationId(caseNumber, currentOrganizationId())
                .filter(existing -> !existing.getId().equals(legalCase.getId()))
                .ifPresent(existing -> {
                    throw new IllegalArgumentException("Case number already exists in your organization");
                });

        legalCase.setCaseNumber(caseNumber);
        legalCase.setCaseType(caseType);
        legalCase.setCourtName(trimToNull(payload.courtName()));
        legalCase.setAssignedLawyer(trimToNull(payload.assignedLawyer()));
        legalCase.setJudgeName(trimToNull(payload.judgeName()));
        legalCase.setFilingDate(payload.filingDate());
        legalCase.setFirstHearingDate(payload.firstHearingDate());
        legalCase.setNextHearingDate(payload.nextHearingDate());
        legalCase.setOpponentName(trimToNull(payload.opponentName()));
        legalCase.setOpponentLawyer(trimToNull(payload.opponentLawyer()));
        legalCase.setCaseDescription(trimToNull(payload.caseDescription()));
        legalCase.setStatus(normalizeCaseStatus(payload.status(), "DRAFT"));
    }

    private void applyFollowUpPayloadForWizard(LegalCase legalCase, 
                                               PlatformRequests.FollowUpPayload payload,
                                               Long orgId, String actor) {
        CaseFollowUp followUp = new CaseFollowUp();
        followUp.setLegalCase(legalCase);
        followUp.setOrganization(requireOrganization(orgId));
        followUp.setCreatedBy(isBlank(actor) ? "lawyer@local.demo" : actor);
        applyFollowUpPayload(followUp, payload);
        caseFollowUpRepository.save(followUp);
    }

    private void ensurePaymentShell(Long orgId, Long caseId) {
        Long existing = legalCaseRepository.countByIdAndOrganizationId(caseId, orgId);
        if (existing == 0) return;
        // In Supabase implementation, this creates a payment shell
        // In legacy JPA, payment history is created directly
    }
}
