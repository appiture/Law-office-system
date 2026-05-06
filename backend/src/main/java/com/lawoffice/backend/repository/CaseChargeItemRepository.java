package com.lawoffice.backend.repository;

import com.lawoffice.backend.model.CaseChargeItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CaseChargeItemRepository extends JpaRepository<CaseChargeItem, Long> {

    List<CaseChargeItem> findByLegalCaseIdAndOrganizationIdOrderByDisplayOrderAsc(Long legalCaseId, Long organizationId);
    Optional<CaseChargeItem> findByIdAndOrganizationId(Long id, Long organizationId);
    Optional<CaseChargeItem> findByLegalCaseIdAndOrganizationIdAndLabel(Long legalCaseId, Long organizationId, String label);
}
