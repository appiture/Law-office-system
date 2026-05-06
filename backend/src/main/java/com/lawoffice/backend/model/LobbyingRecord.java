package com.lawoffice.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "lobbying_records")
public class LobbyingRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "client_id", nullable = false)
    private Client client;

    @Column(nullable = false, length = 200)
    private String purpose;

    @Column(nullable = false)
    private LocalDateTime lobbyingDate;

    @Column(length = 50)
    private String status;

    @Column(length = 500)
    private String notes;

    @Column(length = 150)
    private String lobbyingOfficer;

    @Column(length = 150)
    private String createdBy;

    @CreationTimestamp
    @Column(nullable = false)
    private LocalDateTime createdAt;

    @ManyToOne(fetch = jakarta.persistence.FetchType.LAZY)
    @JoinColumn(name = "organization_id")
    @JsonIgnore
    private Organization organization;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    
    public Client getClient() { return client; }
    public void setClient(Client client) { this.client = client; }
    
    public String getPurpose() { return purpose; }
    public void setPurpose(String purpose) { this.purpose = purpose; }
    
    public LocalDateTime getLobbyingDate() { return lobbyingDate; }
    public void setLobbyingDate(LocalDateTime lobbyingDate) { this.lobbyingDate = lobbyingDate; }
    
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    
    public String getLobbyingOfficer() { return lobbyingOfficer; }
    public void setLobbyingOfficer(String lobbyingOfficer) { this.lobbyingOfficer = lobbyingOfficer; }
    
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public Organization getOrganization() { return organization; }
    public void setOrganization(Organization organization) { this.organization = organization; }
}
