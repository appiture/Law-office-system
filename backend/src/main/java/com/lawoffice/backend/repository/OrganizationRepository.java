package com.lawoffice.backend.repository;

import com.lawoffice.backend.model.Organization;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrganizationRepository extends JpaRepository<Organization, Long> {
}
