package com.lawoffice.backend.repository;

import com.lawoffice.backend.model.Contact;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ContactRepository extends JpaRepository<Contact, Long> {
    List<Contact> findAllByTenantOrganizationIdOrderByNameAsc(Long organizationId);
    Optional<Contact> findByIdAndTenantOrganizationId(Long id, Long organizationId);
}