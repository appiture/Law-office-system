package com.lawoffice.backend.repository;

import com.lawoffice.backend.model.PutUpDate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface PutUpDateRepository extends JpaRepository<PutUpDate, Long> {
    
    @Query("SELECT pud FROM PutUpDate pud WHERE pud.legalCase.id = :caseId AND pud.organization.id = :organizationId ORDER BY pud.putUpDateTime DESC, pud.createdAt DESC")
    List<PutUpDate> findByCaseIdAndOrganizationIdOrderByPutUpDateTimeDesc(@Param("caseId") Long caseId, @Param("organizationId") Long organizationId);
    
    @Query("SELECT pud FROM PutUpDate pud WHERE pud.putUpDateTime >= :fromDate AND pud.putUpDateTime <= :toDate AND pud.organization.id = :organizationId ORDER BY pud.putUpDateTime ASC, pud.createdAt DESC")
    List<PutUpDate> findByDateRangeAndOrganizationIdOrderByPutUpDateTimeAsc(@Param("fromDate") LocalDateTime fromDate, @Param("toDate") LocalDateTime toDate, @Param("organizationId") Long organizationId);
    
    @Query("SELECT pud FROM PutUpDate pud WHERE pud.organization.id = :organizationId ORDER BY pud.putUpDateTime DESC, pud.createdAt DESC")
    List<PutUpDate> findByOrganizationIdOrderByPutUpDateTimeDesc(@Param("organizationId") Long organizationId);
    
    @Query("SELECT pud FROM PutUpDate pud WHERE pud.id = :id AND pud.organization.id = :organizationId")
    java.util.Optional<PutUpDate> findByIdAndOrganizationId(@Param("id") Long id, @Param("organizationId") Long organizationId);
}