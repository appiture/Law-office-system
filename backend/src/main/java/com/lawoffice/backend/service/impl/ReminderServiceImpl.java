package com.lawoffice.backend.service.impl;

import com.lawoffice.backend.model.Client;
import com.lawoffice.backend.model.Reminder;
import com.lawoffice.backend.repository.ClientRepository;
import com.lawoffice.backend.repository.ReminderRepository;
import com.lawoffice.backend.service.ReminderService;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class ReminderServiceImpl implements ReminderService {

    private final ReminderRepository reminderRepository;
    private final ClientRepository clientRepository;

    public ReminderServiceImpl(ReminderRepository reminderRepository,
                               ClientRepository clientRepository) {
        this.reminderRepository = reminderRepository;
        this.clientRepository = clientRepository;
    }

    @Override
    public void createReminder(Long clientId) {

        Client client = clientRepository.findById(clientId)
                .orElseThrow(() -> new EntityNotFoundException("Client not found"));

        Reminder reminder = new Reminder();
        reminder.setReminderDate(client.getDueDate().minusDays(2));
        reminder.setClient(client);

        reminderRepository.save(reminder);
    }
}
