package com.lawoffice.backend.repository;

import com.lawoffice.backend.model.SharedTask;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SharedTaskRepository extends JpaRepository<SharedTask, Long> {
    List<SharedTask> findAllByOrderByUpdatedAtDescIdDesc();
}
