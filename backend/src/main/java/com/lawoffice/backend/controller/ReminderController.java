package com.lawoffice.backend.controller;

import org.springframework.web.bind.annotation.*;
import com.lawoffice.backend.service.ReminderService;


@RestController
@RequestMapping("/api/reminders")
public class ReminderController {

    private final ReminderService reminderService;

    public ReminderController(ReminderService reminderService) {
        this.reminderService = reminderService;
    }

    @PostMapping("/{clientId}")

    public void createReminder(@PathVariable Long clientId) {
        reminderService.createReminder(clientId);
    }
}
