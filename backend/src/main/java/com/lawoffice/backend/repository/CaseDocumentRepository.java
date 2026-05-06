package com.lawoffice.backend.repository;

import com.lawoffice.backend.model.CaseDocument;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CaseDocumentRepository extends JpaRepository<CaseDocument, Long> {

    List<CaseDocument> findByLegalCaseIdAndOrganizationIdOrderByCreatedAtDesc(Long legalCaseId, Long organizationId);
    java.util.Optional<CaseDocument> findByIdAndOrganizationId(Long id, Long organizationId);
}
