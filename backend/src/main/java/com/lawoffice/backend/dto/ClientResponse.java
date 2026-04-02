package com.lawoffice.backend.dto;

import com.lawoffice.backend.model.CaseDetail;
import com.lawoffice.backend.model.ClientStatus;
import com.lawoffice.backend.model.Payment;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class ClientResponse {

    private Long id;
    private String name;
    private String phone;
    private String caseType;

    private BigDecimal totalAmount;
    private BigDecimal paidAmount;
    private BigDecimal balanceAmount;

    private LocalDate dueDate;
    private LocalDate nextDueDate;
    private String nextDueRemarks;
    private Boolean followUpContacted;
    private String followUpUpdatedBy;
    private LocalDateTime followUpUpdatedAt;

    private ClientStatus status;

    private String createdByName;
    private LocalDateTime createdAt;

    private String imageUrl;
    private String imagePublicId;

    private List<Payment> payments;
    private List<CaseDetail> caseDetails;

    // ===== GETTERS & SETTERS =====

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

    public BigDecimal getBalanceAmount() { return balanceAmount; }
    public void setBalanceAmount(BigDecimal balanceAmount) { this.balanceAmount = balanceAmount; }

    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }

    public LocalDate getNextDueDate() { return nextDueDate; }
    public void setNextDueDate(LocalDate nextDueDate) { this.nextDueDate = nextDueDate; }

    public String getNextDueRemarks() { return nextDueRemarks; }
    public void setNextDueRemarks(String nextDueRemarks) { this.nextDueRemarks = nextDueRemarks; }

    public Boolean getFollowUpContacted() { return followUpContacted; }
    public void setFollowUpContacted(Boolean followUpContacted) { this.followUpContacted = followUpContacted; }

    public String getFollowUpUpdatedBy() { return followUpUpdatedBy; }
    public void setFollowUpUpdatedBy(String followUpUpdatedBy) { this.followUpUpdatedBy = followUpUpdatedBy; }

    public LocalDateTime getFollowUpUpdatedAt() { return followUpUpdatedAt; }
    public void setFollowUpUpdatedAt(LocalDateTime followUpUpdatedAt) { this.followUpUpdatedAt = followUpUpdatedAt; }

    public ClientStatus getStatus() { return status; }
    public void setStatus(ClientStatus status) { this.status = status; }

    public String getCreatedByName() { return createdByName; }
    public void setCreatedByName(String createdByName) { this.createdByName = createdByName; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }

    public String getImagePublicId() { return imagePublicId; }
    public void setImagePublicId(String imagePublicId) { this.imagePublicId = imagePublicId; }

    public List<Payment> getPayments() { return payments; }
    public void setPayments(List<Payment> payments) { this.payments = payments; }

    public List<CaseDetail> getCaseDetails() { return caseDetails; }
    public void setCaseDetails(List<CaseDetail> caseDetails) { this.caseDetails = caseDetails; }

    private String remarks;
    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }
}
