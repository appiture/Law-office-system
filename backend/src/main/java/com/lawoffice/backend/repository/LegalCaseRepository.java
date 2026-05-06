package com.lawoffice.backend.repository;

import com.lawoffice.backend.model.LegalCase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface LegalCaseRepository extends JpaRepository<LegalCase, Long> {

    List<LegalCase> findAllByOrderByUpdatedAtDesc();
    List<LegalCase> findAllByOrganizationId(Long organizationId);
    List<LegalCase> findAllByOrganizationIdAndClientId(Long organizationId, Long clientId);
    Optional<LegalCase> findByIdAndOrganizationId(Long id, Long organizationId);
    Optional<LegalCase> findByCaseNumberAndOrganizationId(String caseNumber, Long organizationId);
    Long countByIdAndOrganizationId(Long id, Long organizationId);
}
