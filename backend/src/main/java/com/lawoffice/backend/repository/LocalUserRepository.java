package com.lawoffice.backend.repository;

import com.lawoffice.backend.model.LocalUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface LocalUserRepository extends JpaRepository<LocalUser, Long> {
    Optional<LocalUser> findByEmail(String email);
    Optional<LocalUser> findByEmailIgnoreCase(String email);
}
