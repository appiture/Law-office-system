package com.lawoffice.backend.service.impl;

import com.lawoffice.backend.model.LegalCase;
import com.lawoffice.backend.model.PutUpDate;
import com.lawoffice.backend.repository.LegalCaseRepository;
import com.lawoffice.backend.repository.OrganizationRepository;
import com.lawoffice.backend.repository.PutUpDateRepository;
import com.lawoffice.backend.security.TenantContext;
import com.lawoffice.backend.service.PutUpDateService;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class PutUpDateServiceImpl implements PutUpDateService {

    private final PutUpDateRepository putUpDateRepository;
    private final LegalCaseRepository legalCaseRepository;
    private final OrganizationRepository organizationRepository;

    public PutUpDateServiceImpl(PutUpDateRepository putUpDateRepository, 
                              LegalCaseRepository legalCaseRepository,
                              OrganizationRepository organizationRepository) {
        this.putUpDateRepository = putUpDateRepository;
        this.legalCaseRepository = legalCaseRepository;
        this.organizationRepository = organizationRepository;
    }

    @Override
    public List<PutUpDate> getAll() {
        Long orgId = TenantContext.getCurrentTenant();
        return putUpDateRepository.findByOrganizationIdOrderByPutUpDateTimeDesc(orgId);
    }

    @Override
    public List<PutUpDate> getByCaseId(Long caseId) {
        Long orgId = TenantContext.getCurrentTenant();
        return putUpDateRepository.findByCaseIdAndOrganizationIdOrderByPutUpDateTimeDesc(caseId, orgId);
    }

    @Override
    public List<PutUpDate> getByDateRange(LocalDateTime fromDate, LocalDateTime toDate) {
        Long orgId = TenantContext.getCurrentTenant();
        return putUpDateRepository.findByDateRangeAndOrganizationIdOrderByPutUpDateTimeAsc(fromDate, toDate, orgId);
    }

    @Override
    public PutUpDate getById(Long id) {
        Long orgId = TenantContext.getCurrentTenant();
        return putUpDateRepository.findByIdAndOrganizationId(id, orgId)
                .orElseThrow(() -> new EntityNotFoundException("Put up date not found"));
    }

    @Override
    public PutUpDate create(PutUpDate putUpDate, String actor) {
        String purpose = putUpDate.getPurpose() == null ? "" : putUpDate.getPurpose().trim();
        
        if (purpose.isEmpty()) {
            throw new IllegalArgumentException("Purpose is required");
        }
        if (putUpDate.getPutUpDateTime() == null) {
            throw new IllegalArgumentException("Put up date and time is required");
        }
        if (putUpDate.getLegalCase() == null || putUpDate.getLegalCase().getId() == null) {
            throw new IllegalArgumentException("Case is required");
        }

        // Verify case exists for tenant
        Long orgId = TenantContext.getCurrentTenant();
        LegalCase legalCase = legalCaseRepository.findByIdAndOrganizationId(putUpDate.getLegalCase().getId(), orgId)
                .orElseThrow(() -> new EntityNotFoundException("Case not found or does not belong to your organization"));

        putUpDate.setLegalCase(legalCase);
        putUpDate.setOrganization(organizationRepository.getReferenceById(orgId));
        putUpDate.setCreatedBy(actor);
        return putUpDateRepository.save(putUpDate);
    }

    @Override
    public PutUpDate update(Long id, PutUpDate putUpDate, String actor) {
        Long orgId = TenantContext.getCurrentTenant();
        PutUpDate existing = putUpDateRepository.findByIdAndOrganizationId(id, orgId)
                .orElseThrow(() -> new EntityNotFoundException("Put up date not found"));

        boolean changed = false;

        if (putUpDate.getPurpose() != null) {
            String purpose = putUpDate.getPurpose().trim();
            if (purpose.isEmpty()) {
                throw new IllegalArgumentException("Purpose cannot be empty");
            }
            existing.setPurpose(purpose);
            changed = true;
        }

        if (putUpDate.getPutUpDateTime() != null) {
            existing.setPutUpDateTime(putUpDate.getPutUpDateTime());
            changed = true;
        }

        if (putUpDate.getCourtName() != null) {
            existing.setCourtName(putUpDate.getCourtName());
            changed = true;
        }

        if (putUpDate.getJudgeName() != null) {
            existing.setJudgeName(putUpDate.getJudgeName());
            changed = true;
        }

        if (putUpDate.getStatus() != null) {
            existing.setStatus(putUpDate.getStatus());
            changed = true;
        }

        if (putUpDate.getNotes() != null) {
            existing.setNotes(putUpDate.getNotes());
            changed = true;
        }

        if (putUpDate.getLawyerName() != null) {
            existing.setLawyerName(putUpDate.getLawyerName());
            changed = true;
        }

        if (changed) {
            existing.setCreatedBy(actor);
        }

        return putUpDateRepository.save(existing);
    }

    @Override
    public void delete(Long id) {
        Long orgId = TenantContext.getCurrentTenant();
        PutUpDate existing = putUpDateRepository.findByIdAndOrganizationId(id, orgId)
                .orElseThrow(() -> new EntityNotFoundException("Put up date not found"));
        putUpDateRepository.delete(existing);
    }
}