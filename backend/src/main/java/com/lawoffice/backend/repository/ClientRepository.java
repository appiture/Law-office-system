package com.lawoffice.backend.repository;

import com.lawoffice.backend.model.Client;
import com.lawoffice.backend.model.ClientStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;
import java.util.List;

public interface ClientRepository extends JpaRepository<Client, Long> {

    List<Client> findByDueDateAndStatusNot(LocalDate dueDate, ClientStatus status);
}
