package com.lawoffice.backend.model;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import org.hibernate.annotations.CreationTimestamp;
import com.fasterxml.jackson.annotation.JsonManagedReference;
@Entity
@Table(name = "clients")
public class Client {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String phone;

    private String caseType;

    @OneToMany(mappedBy = "client", cascade = CascadeType.ALL, fetch = FetchType.EAGER)
    @JsonManagedReference
    private List<Payment> payments = new ArrayList<>();

    @OneToMany(mappedBy = "client", cascade = CascadeType.ALL, fetch = FetchType.EAGER, orphanRemoval = true)
    @JsonManagedReference
    private List<CaseDetail> caseDetails = new ArrayList<>();

    @Column(nullable = false)
    private BigDecimal totalAmount;

    @Column(nullable = false)
    private BigDecimal paidAmount = BigDecimal.ZERO;

    @Column(name = "balance_amount")
    private BigDecimal balanceAmount;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "next_due_date")
    private LocalDate nextDueDate;

    @Column(name = "next_due_remarks", length = 500)
    private String nextDueRemarks;

    @Column(name = "remarks", length = 1000)
    private String remarks;

    @Column(name = "follow_up_contacted")
    private Boolean followUpContacted = false;

    @Column(name = "follow_up_updated_by")
    private String followUpUpdatedBy;

    @Column(name = "follow_up_updated_at")
    private LocalDateTime followUpUpdatedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ClientStatus status;

    @Column(nullable = false)
    private Long createdBy;

    @Column
    private String createdByName;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @Column(name = "image_url",length = 500)
    private String imageUrl;

    @Column(name = "image_public_id")
    private String imagePublicId;

    @PrePersist
    @PreUpdate
    public void calculateFinancials() {

        if (totalAmount == null) {
            totalAmount = BigDecimal.ZERO;
        }

        if (paidAmount == null) {
            paidAmount = BigDecimal.ZERO;
        }

        if (followUpContacted == null) {
            followUpContacted = false;
        }

        if (paidAmount.compareTo(BigDecimal.ZERO) < 0) {
            paidAmount = BigDecimal.ZERO;
        }

        if (paidAmount.compareTo(totalAmount) > 0) {
            paidAmount = totalAmount;
        }

        balanceAmount = totalAmount.subtract(paidAmount);

        // If fully paid
        if (balanceAmount.compareTo(BigDecimal.ZERO) == 0) {
            status = ClientStatus.PAID;
            dueDate = null;
            nextDueDate = null;
        }
        // If due date is set and has passed - mark as OVERDUE
        else if (dueDate != null && dueDate.isBefore(LocalDate.now())) {
            status = ClientStatus.OVERDUE;
        }
        // If partially paid with balance remaining
        else if (paidAmount.compareTo(BigDecimal.ZERO) > 0) {
            status = ClientStatus.PARTIAL;
        }
        // Has balance but no due date - treat as PARTIAL (not OVERDUE)
        else {
            status = ClientStatus.PARTIAL;
        }
    }

    // ================= GETTERS & SETTERS =================

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getCaseType() { return caseType; }
    public void setCaseType(String caseType) { this.caseType = caseType; }

    public BigDecimal getTotalAmount() { return totalAmount; }
    public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }

    public BigDecimal getPaidAmount() { return paidAmount; }
    public void setPaidAmount(BigDecimal paidAmount) { this.paidAmount = paidAmount; }

    public BigDecimal getBalanceAmount() {return balanceAmount;}
    public void setBalanceAmount(BigDecimal balanceAmount) {this.balanceAmount = balanceAmount;}

    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }

    public String getNextDueRemarks(){ return nextDueRemarks; }
    public void setNextDueRemarks(String nextDueRemarks) { this.nextDueRemarks = nextDueRemarks; }

    public Boolean getFollowUpContacted() { return followUpContacted; }
    public void setFollowUpContacted(Boolean followUpContacted) { this.followUpContacted = followUpContacted; }

    public String getFollowUpUpdatedBy() { return followUpUpdatedBy; }
    public void setFollowUpUpdatedBy(String followUpUpdatedBy) { this.followUpUpdatedBy = followUpUpdatedBy; }

    public LocalDateTime getFollowUpUpdatedAt() { return followUpUpdatedAt; }
    public void setFollowUpUpdatedAt(LocalDateTime followUpUpdatedAt) { this.followUpUpdatedAt = followUpUpdatedAt; }

    public LocalDate getNextDueDate() { return nextDueDate; }
    public void setNextDueDate(LocalDate nextDueDate) { this.nextDueDate = nextDueDate; }

    public ClientStatus getStatus() { return status; }
    public void setStatus(ClientStatus status) { this.status = status; }

    public String getCreatedByName(){ return createdByName; }
    public void setCreatedByName(String createdByName) { this.createdByName = createdByName; }

    public Long getCreatedBy() { return createdBy; }
    public void setCreatedBy(Long createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public List<Payment> getPayments() { return payments; }
    public void setPayments(List<Payment> payments){ this.payments = payments;}

    public List<CaseDetail> getCaseDetails() { return caseDetails; }
    public void setCaseDetails(List<CaseDetail> caseDetails) { this.caseDetails = caseDetails; }

    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }

    public String getImagePublicId() { return imagePublicId; }
    public void setImagePublicId(String imagePublicId) { this.imagePublicId = imagePublicId; }

    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }
}
