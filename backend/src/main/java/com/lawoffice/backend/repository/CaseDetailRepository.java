package com.lawoffice.backend.repository;

import com.lawoffice.backend.model.CaseDetail;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CaseDetailRepository extends JpaRepository<CaseDetail, Long> {
}
