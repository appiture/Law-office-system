package com.lawoffice.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "cases")
@JsonIgnoreProperties({"client", "documents", "chargeItems", "paymentHistory", "followUps"})
public class LegalCase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "client_id", nullable = false)
    @JsonIgnoreProperties({"cases"})
    private Client client;

    @Column(nullable = false, length = 120)
    private String caseNumber;

    @Column(nullable = false, length = 120)
    private String caseType;

    @Column(length = 180)
    private String courtName;

    @Column(length = 150)
    private String assignedLawyer;

    @Column(length = 150)
    private String judgeName;

    @Column
    private LocalDate filingDate;

    @Column
    private LocalDate firstHearingDate;

    @Column
    private LocalDate nextHearingDate;

    @Column(length = 255)
    private String opponentName;

    @Column(length = 150)
    private String opponentLawyer;

    @Column(length = 2000)
    private String caseDescription;

    @Column(nullable = false, length = 40)
    private String status;

    @Column(nullable = false, length = 150)
    private String createdBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id")
    @JsonIgnore
    private Organization organization;

    @CreationTimestamp
    @Column(nullable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "legalCase", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<CaseDocument> documents = new ArrayList<>();

    @OneToMany(mappedBy = "legalCase", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<CaseChargeItem> chargeItems = new ArrayList<>();

    @OneToMany(mappedBy = "legalCase", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<PaymentHistory> paymentHistory = new ArrayList<>();

    @OneToMany(mappedBy = "legalCase", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<CaseFollowUp> followUps = new ArrayList<>();

    @PrePersist
    public void applyDefaults() {
        if (status == null || status.isBlank()) {
            status = "RUNNING";
        }
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Client getClient() { return client; }
    public void setClient(Client client) { this.client = client; }
    public String getCaseNumber() { return caseNumber; }
    public void setCaseNumber(String caseNumber) { this.caseNumber = caseNumber; }
    public String getCaseType() { return caseType; }
    public void setCaseType(String caseType) { this.caseType = caseType; }
    public String getCourtName() { return courtName; }
    public void setCourtName(String courtName) { this.courtName = courtName; }
    public String getAssignedLawyer() { return assignedLawyer; }
    public void setAssignedLawyer(String assignedLawyer) { this.assignedLawyer = assignedLawyer; }
    public String getJudgeName() { return judgeName; }
    public void setJudgeName(String judgeName) { this.judgeName = judgeName; }
    public LocalDate getFilingDate() { return filingDate; }
    public void setFilingDate(LocalDate filingDate) { this.filingDate = filingDate; }
    public LocalDate getFirstHearingDate() { return firstHearingDate; }
    public void setFirstHearingDate(LocalDate firstHearingDate) { this.firstHearingDate = firstHearingDate; }
    public LocalDate getNextHearingDate() { return nextHearingDate; }
    public void setNextHearingDate(LocalDate nextHearingDate) { this.nextHearingDate = nextHearingDate; }
    public String getOpponentName() { return opponentName; }
    public void setOpponentName(String opponentName) { this.opponentName = opponentName; }
    public String getOpponentLawyer() { return opponentLawyer; }
    public void setOpponentLawyer(String opponentLawyer) { this.opponentLawyer = opponentLawyer; }
    public String getCaseDescription() { return caseDescription; }
    public void setCaseDescription(String caseDescription) { this.caseDescription = caseDescription; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public Organization getOrganization() { return organization; }
    public void setOrganization(Organization organization) { this.organization = organization; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    public List<CaseDocument> getDocuments() { return documents; }
    public void setDocuments(List<CaseDocument> documents) { this.documents = documents; }
    public List<CaseChargeItem> getChargeItems() { return chargeItems; }
    public void setChargeItems(List<CaseChargeItem> chargeItems) { this.chargeItems = chargeItems; }
    public List<PaymentHistory> getPaymentHistory() { return paymentHistory; }
    public void setPaymentHistory(List<PaymentHistory> paymentHistory) { this.paymentHistory = paymentHistory; }
    public List<CaseFollowUp> getFollowUps() { return followUps; }
    public void setFollowUps(List<CaseFollowUp> followUps) { this.followUps = followUps; }
}
