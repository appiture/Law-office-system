package com.lawoffice.backend.repository;

import com.lawoffice.backend.model.Reminder;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReminderRepository extends JpaRepository<Reminder, Long> {
}
