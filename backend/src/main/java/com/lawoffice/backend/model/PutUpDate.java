package com.lawoffice.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
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
@Table(name = "put_up_dates")
public class PutUpDate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne
    @JoinColumn(name = "case_id", nullable = false)
    @JsonIgnoreProperties({"client", "documents", "chargeItems", "paymentHistory", "followUps"})
    private LegalCase legalCase;

    @Column(nullable = false)
    private LocalDateTime putUpDateTime;

    @Column(nullable = false, length = 200)
    private String purpose;

    @Column(length = 150)
    private String courtName;

    @Column(length = 100)
    private String judgeName;

    @Column(length = 50)
    private String status;

    @Column(length = 500)
    private String notes;

    @Column(length = 150)
    private String lawyerName;

    @Column(nullable = false, length = 150)
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
    
    public LegalCase getLegalCase() { return legalCase; }
    public void setLegalCase(LegalCase legalCase) { this.legalCase = legalCase; }
    
    public LocalDateTime getPutUpDateTime() { return putUpDateTime; }
    public void setPutUpDateTime(LocalDateTime putUpDateTime) { this.putUpDateTime = putUpDateTime; }
    
    public String getPurpose() { return purpose; }
    public void setPurpose(String purpose) { this.purpose = purpose; }
    
    public String getCourtName() { return courtName; }
    public void setCourtName(String courtName) { this.courtName = courtName; }
    
    public String getJudgeName() { return judgeName; }
    public void setJudgeName(String judgeName) { this.judgeName = judgeName; }
    
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    
    public String getLawyerName() { return lawyerName; }
    public void setLawyerName(String lawyerName) { this.lawyerName = lawyerName; }
    
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public Organization getOrganization() { return organization; }
    public void setOrganization(Organization organization) { this.organization = organization; }
}
