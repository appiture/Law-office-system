package com.lawoffice.backend.service.impl;

import com.lawoffice.backend.dto.ClientRequest;
import com.lawoffice.backend.dto.ClientResponse;
import com.lawoffice.backend.dto.FollowUpRequest;
import com.lawoffice.backend.dto.NextDueRequest;
import com.lawoffice.backend.model.CaseDetail;
import com.lawoffice.backend.model.Client;
import com.lawoffice.backend.model.Payment;
import com.lawoffice.backend.model.ClientStatus;
import com.lawoffice.backend.repository.CaseDetailRepository;
import com.lawoffice.backend.repository.ClientRepository;
import com.lawoffice.backend.repository.PaymentRepository;
import com.lawoffice.backend.repository.UserRepository;
import com.lawoffice.backend.service.ClientService;
import com.lawoffice.backend.service.ImageService;
import jakarta.persistence.EntityNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class ClientServiceImpl implements ClientService {

    private static final Logger logger = LoggerFactory.getLogger(ClientServiceImpl.class);

    private final ClientRepository clientRepository;
    private final PaymentRepository paymentRepository;
    private final CaseDetailRepository caseDetailRepository;
    private final ImageService imageService;
    private final UserRepository userRepository;

    public ClientServiceImpl(
            ClientRepository clientRepository,
            PaymentRepository paymentRepository,
            CaseDetailRepository caseDetailRepository,
            ImageService imageService,
            UserRepository userRepository
    ) {
        this.clientRepository = clientRepository;
        this.paymentRepository = paymentRepository;
        this.caseDetailRepository = caseDetailRepository;
        this.imageService = imageService;
        this.userRepository = userRepository;
    }

    @Override
    public ClientResponse create(ClientRequest request, MultipartFile image, List<MultipartFile> caseDetails) {
        String actor = "founder@lawoffice.com";
        BigDecimal initialPaidAmount = request.getPaidAmount() == null
                ? BigDecimal.ZERO
                : request.getPaidAmount();
        String validPhone = normalizeAndValidatePhone(request.getPhone());
        validatePaidAmount(request.getTotalAmount(), initialPaidAmount);

        Client client = new Client();
        applyClientRequest(client, request, validPhone);
        client.setPaidAmount(BigDecimal.ZERO);
        client.setCreatedBy(resolveActorId(actor));
        client.setCreatedByName(actor);

        try {
            if (image != null && !image.isEmpty()) {
                Map<String, Object> uploadResult = imageService.uploadImage(image);
                client.setImageUrl((String) uploadResult.get("secure_url"));
                client.setImagePublicId((String) uploadResult.get("public_id"));
            }
            
            // Handle multiple case details files
            if (caseDetails != null && !caseDetails.isEmpty()) {
                for (MultipartFile file : caseDetails) {
                    if (file != null && !file.isEmpty()) {
                        Map<String, Object> uploadRes = imageService.uploadImage(file);
                        CaseDetail cd = new CaseDetail();
                        cd.setClient(client);
                        cd.setFileName(file.getOriginalFilename());
                        cd.setFileUrl((String) uploadRes.get("secure_url"));
                        cd.setPublicId((String) uploadRes.get("public_id"));
                        client.getCaseDetails().add(cd);
                    }
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("File Upload Failed");
        }

        Client savedClient = clientRepository.save(client);

        if (initialPaidAmount.compareTo(BigDecimal.ZERO) > 0) {
            Payment initialPayment = new Payment();
            initialPayment.setClient(savedClient);
            initialPayment.setAmount(initialPaidAmount);
            initialPayment.setPaymentDate(LocalDate.now());
            initialPayment.setUpdatedBy(actor);
            initialPayment.setUpdatedAt(LocalDateTime.now());
            paymentRepository.save(initialPayment);

            savedClient.setPaidAmount(initialPaidAmount);
            savedClient = clientRepository.save(savedClient);
        }

        Client refreshed = clientRepository.findById(savedClient.getId())
                .orElse(savedClient);
        return convertToResponse(refreshed);
    }

    @Override
    public List<ClientResponse> getAll() {
        List<Client> clients = clientRepository.findAll();
        // Recalculate status for all clients
        for (Client client : clients) {
            calculateClientStatus(client);
        }
        return clients.stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());
    }

    @Override
    public List<Client> getAllEntities() {
        return clientRepository.findAll();
    }

    @Override
    public Client update(Long id, ClientRequest request) {
        Client existing = clientRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Client not found"));
        String validPhone = normalizeAndValidatePhone(request.getPhone());
        BigDecimal paidAmount = request.getPaidAmount() == null ? BigDecimal.ZERO : request.getPaidAmount();

        validatePaidAmount(request.getTotalAmount(), paidAmount);
        applyClientRequest(existing, request, validPhone);
        existing.setPaidAmount(paidAmount);

        return clientRepository.save(existing);
    }

    @Override
    public ClientResponse updateWithImage(Long id, ClientRequest request, MultipartFile image, List<MultipartFile> caseDetails) {
        Client existing = clientRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Client not found"));
        String validPhone = normalizeAndValidatePhone(request.getPhone());
        BigDecimal paidAmount = request.getPaidAmount() == null ? BigDecimal.ZERO : request.getPaidAmount();

        validatePaidAmount(request.getTotalAmount(), paidAmount);
        applyClientRequest(existing, request, validPhone);
        existing.setPaidAmount(paidAmount);

        // Handle new case details if any
        if (caseDetails != null && !caseDetails.isEmpty()) {
            try {
                for (MultipartFile file : caseDetails) {
                    if (file != null && !file.isEmpty()) {
                        Map<String, Object> uploadRes = imageService.uploadImage(file);
                        CaseDetail cd = new CaseDetail();
                        cd.setClient(existing);
                        cd.setFileName(file.getOriginalFilename());
                        cd.setFileUrl((String) uploadRes.get("secure_url"));
                        cd.setPublicId((String) uploadRes.get("public_id"));
                        existing.getCaseDetails().add(cd);
                    }
                }
            } catch (Exception e) {
                throw new RuntimeException("File upload failed", e);
            }
        }

        Client savedClient;
        if (image != null && !image.isEmpty()) {
            savedClient = saveClientWithReplacementImage(existing, image);
        } else {
            savedClient = clientRepository.save(existing);
        }

        return convertToResponse(savedClient);
    }

    @Override
    public ClientResponse updateImage(Long id, MultipartFile image) {
        if (image == null || image.isEmpty()) {
            throw new IllegalArgumentException("Image file is required");
        }

        Client existing = clientRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Client not found"));

        Client savedClient = saveClientWithReplacementImage(existing, image);
        return convertToResponse(savedClient);
    }

    @Override
    public void delete(Long id) {
        Client existing = clientRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Client not found"));

        try {
            if (existing.getImagePublicId() != null && !existing.getImagePublicId().isBlank()) {
                imageService.deleteImage(existing.getImagePublicId());
            }
        } catch (Exception e) {
            throw new IllegalStateException("Unable to delete client image", e);
        }

        clientRepository.delete(existing);
    }

    @Override
    public Client updateNextDue(Long id, NextDueRequest request) {
        Client client = clientRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Client not found"));

        if (request.getNextDueDate() != null) {
            client.setDueDate(request.getNextDueDate());
            client.setNextDueDate(request.getNextDueDate());
        }

        if (request.getNextDueRemarks() != null) {
            client.setNextDueRemarks(request.getNextDueRemarks());
        }

        return clientRepository.save(client);
    }

    @Override
    public Client followUp(Long id, FollowUpRequest request) {
        Client client = clientRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Client not found"));

        boolean updated = false;

        if (request.getPaymentAmount() != null) {
            throw new IllegalArgumentException("Use the payments endpoint to record payments");
        }

        if (request.getNextDueDate() != null) {
            client.setDueDate(request.getNextDueDate());
            client.setNextDueDate(request.getNextDueDate());
            updated = true;
        }

        if (request.getNextDueRemarks() != null) {
            client.setNextDueRemarks(request.getNextDueRemarks());
            updated = true;
        }

        if (request.getContacted() != null) {
            client.setFollowUpContacted(request.getContacted());
            updated = true;
        }

        if (updated) {
            String userEmail = "founder@lawoffice.com";
            client.setFollowUpUpdatedBy(userEmail);
            client.setFollowUpUpdatedAt(LocalDateTime.now());
        }

        return clientRepository.save(client);
    }

    @Override
    public Client updateRemarks(Long id, String remarks) {
        Client client = clientRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Client not found"));
        
        client.setRemarks(remarks);
        return clientRepository.save(client);
    }

    private Client saveClientWithReplacementImage(Client client, MultipartFile image) {
        String previousImageUrl = client.getImageUrl();
        String previousPublicId = client.getImagePublicId();
        String uploadedPublicId = null;

        try {
            Map<String, Object> uploadResult = imageService.uploadImage(image);
            uploadedPublicId = (String) uploadResult.get("public_id");
            client.setImageUrl((String) uploadResult.get("secure_url"));
            client.setImagePublicId(uploadedPublicId);

            Client savedClient = clientRepository.save(client);
            deleteImageQuietly(previousPublicId, uploadedPublicId, "previous");
            return savedClient;
        } catch (Exception e) {
            client.setImageUrl(previousImageUrl);
            client.setImagePublicId(previousPublicId);
            deleteImageQuietly(uploadedPublicId, null, "uploaded cleanup");
            throw new RuntimeException("Image upload failed", e);
        }
    }

    private void deleteImageQuietly(String publicId, String currentPublicId, String label) {
        if (publicId == null || publicId.isBlank() || publicId.equals(currentPublicId)) {
            return;
        }

        try {
            imageService.deleteImage(publicId);
        } catch (Exception ex) {
            logger.warn("Failed to delete {} image {}", label, publicId, ex);
        }
    }

    private void applyClientRequest(Client client, ClientRequest request, String validPhone) {
        client.setName(request.getName());
        client.setPhone(validPhone);
        client.setCaseType(request.getCaseType());
        client.setTotalAmount(request.getTotalAmount());
        client.setDueDate(request.getDueDate());
        client.setRemarks(request.getRemarks());
    }

    private void validatePaidAmount(BigDecimal totalAmount, BigDecimal paidAmount) {
        if (totalAmount != null && paidAmount != null && paidAmount.compareTo(totalAmount) > 0) {
            throw new IllegalArgumentException("Paid amount cannot exceed total amount");
        }
    }

    private Long resolveActorId(String actorEmail) {
        return userRepository.findByEmail(actorEmail)
                .map(user -> user.getId())
                .orElse(1L);
    }

    private ClientResponse convertToResponse(Client client) {
        ClientResponse response = new ClientResponse();

        response.setId(client.getId());
        response.setName(client.getName());
        response.setPhone(client.getPhone());
        response.setCaseType(client.getCaseType());
        response.setTotalAmount(client.getTotalAmount());
        response.setPaidAmount(client.getPaidAmount());
        response.setBalanceAmount(client.getBalanceAmount());
        response.setDueDate(client.getDueDate());
        response.setNextDueDate(client.getNextDueDate());
        response.setNextDueRemarks(client.getNextDueRemarks());
        response.setFollowUpContacted(Boolean.TRUE.equals(client.getFollowUpContacted()));
        response.setFollowUpUpdatedBy(client.getFollowUpUpdatedBy());
        response.setFollowUpUpdatedAt(client.getFollowUpUpdatedAt());
        response.setStatus(client.getStatus());
        response.setCreatedByName(client.getCreatedByName());
        response.setCreatedAt(client.getCreatedAt());
        response.setImageUrl(client.getImageUrl());
        response.setImagePublicId(client.getImagePublicId());
        response.setPayments(client.getPayments());
        response.setCaseDetails(client.getCaseDetails());
        response.setRemarks(client.getRemarks());

        return response;
    }

    @Override
    public void deleteCaseDetail(Long detailId) {
        CaseDetail detail = caseDetailRepository.findById(detailId)
                .orElseThrow(() -> new EntityNotFoundException("Case detail not found"));
        
        // Mock image deletion from cloud if it were real
        if (detail.getPublicId() != null) {
            try {
                imageService.deleteImage(detail.getPublicId());
            } catch (Exception e) {
                // Log and continue
            }
        }
        
        caseDetailRepository.delete(detail);
    }

    @Override
    public ClientResponse addCaseDetail(Long clientId, MultipartFile file) {
        Client client = clientRepository.findById(clientId)
                .orElseThrow(() -> new EntityNotFoundException("Client not found"));
        
        if (file != null && !file.isEmpty()) {
            try {
                Map<String, Object> uploadResult = imageService.uploadImage(file);
                CaseDetail detail = new CaseDetail();
                detail.setFileName(file.getOriginalFilename());
                detail.setFileUrl((String) uploadResult.get("secure_url"));
                detail.setPublicId((String) uploadResult.get("public_id"));
                detail.setCreatedAt(LocalDateTime.now());
                detail.setClient(client);
                
                caseDetailRepository.save(detail); // Explicitly save to ensure link is created
                client.getCaseDetails().add(detail);
            } catch (Exception e) {
                throw new RuntimeException("Failed to upload document", e);
            }
        }
        
        Client savedClient = clientRepository.save(client);
        return convertToResponse(savedClient);
    }

    private String normalizeAndValidatePhone(String phone) {
        String digits = phone == null ? "" : phone.replaceAll("\\D", "");
        if (digits.length() != 10) {
            throw new IllegalArgumentException("Phone number must be exactly 10 digits");
        }
        return digits;
    }

    private void calculateClientStatus(Client client) {
        if (client.getTotalAmount() == null) {
            client.setTotalAmount(BigDecimal.ZERO);
        }
        if (client.getPaidAmount() == null) {
            client.setPaidAmount(BigDecimal.ZERO);
        }
        
        // Calculate balance
        BigDecimal balance = client.getTotalAmount().subtract(client.getPaidAmount());
        if (balance.compareTo(BigDecimal.ZERO) < 0) {
            balance = BigDecimal.ZERO;
        }
        client.setBalanceAmount(balance);
        
        // Determine status
        if (balance.compareTo(BigDecimal.ZERO) == 0) {
            client.setStatus(ClientStatus.PAID);
        } else if (client.getDueDate() != null && client.getDueDate().isBefore(LocalDate.now())) {
            client.setStatus(ClientStatus.OVERDUE);
        } else if (client.getPaidAmount().compareTo(BigDecimal.ZERO) > 0) {
            client.setStatus(ClientStatus.PARTIAL);
        } else {
            client.setStatus(ClientStatus.PARTIAL);
        }
        
    }
}
