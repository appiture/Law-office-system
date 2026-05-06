package com.lawoffice.backend.repository;

import com.lawoffice.backend.model.PaymentHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PaymentHistoryRepository extends JpaRepository<PaymentHistory, Long> {

    List<PaymentHistory> findByLegalCaseIdAndOrganizationIdOrderByCreatedAtDesc(Long legalCaseId, Long organizationId);
}
