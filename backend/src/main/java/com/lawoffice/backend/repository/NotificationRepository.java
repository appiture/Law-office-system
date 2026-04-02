package com.lawoffice.backend.repository;

import com.lawoffice.backend.model.Notification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findByUserEmailAndIsReadFalse(String userEmail);

    Optional<Notification> findByIdAndUserEmail(Long id, String userEmail);

}
