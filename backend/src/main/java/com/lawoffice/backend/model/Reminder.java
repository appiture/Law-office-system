package com.lawoffice.backend.model;

import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
@Table(name = "reminders")
public class Reminder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private LocalDate reminderDate;

    private Boolean sentToClient = false;
    private Boolean sentToAdmin = false;
    private Boolean sentToFounder = false;

    @ManyToOne
    @JoinColumn(name = "client_id")
    private Client client;

    // ===== GETTERS & SETTERS =====

    public Long getId() {
        return id;
    }

    public LocalDate getReminderDate() {
        return reminderDate;
    }

    public void setReminderDate(LocalDate reminderDate) {
        this.reminderDate = reminderDate;
    }

    public Boolean getSentToClient() {
        return sentToClient;
    }

    public void setSentToClient(Boolean sentToClient) {
        this.sentToClient = sentToClient;
    }

    public Boolean getSentToAdmin() {
        return sentToAdmin;
    }

    public void setSentToAdmin(Boolean sentToAdmin) {
        this.sentToAdmin = sentToAdmin;
    }

    public Boolean getSentToFounder() {
        return sentToFounder;
    }

    public void setSentToFounder(Boolean sentToFounder) {
        this.sentToFounder = sentToFounder;
    }

    public Client getClient() {
        return client;
    }

    public void setClient(Client client) {
        this.client = client;
    }
}
