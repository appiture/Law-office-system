package com.lawoffice.backend.repository;

import com.lawoffice.backend.model.CaseFollowUp;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CaseFollowUpRepository extends JpaRepository<CaseFollowUp, Long> {

    List<CaseFollowUp> findByLegalCaseIdAndOrganizationIdOrderByScheduledAtAsc(Long legalCaseId, Long organizationId);
    java.util.Optional<CaseFollowUp> findByIdAndOrganizationId(Long id, Long organizationId);
}
