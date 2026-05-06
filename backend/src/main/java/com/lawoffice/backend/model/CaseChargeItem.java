package com.lawoffice.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "case_charge_items")
public class CaseChargeItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "case_id", nullable = false)
    private LegalCase legalCase;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @Column(nullable = false, length = 120)
    private String label;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal totalAmount;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal paidAmount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal balanceAmount = BigDecimal.ZERO;

    private LocalDate dueDate;

    @Column(nullable = false, length = 40)
    private String status;

    @Column(nullable = false)
    private Integer displayOrder = 0;

    @Column(nullable = false)
    private Boolean isLawyerFee = false;

    @Column(length = 500)
    private String description;

    @CreationTimestamp
    @Column(nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    @PreUpdate
    public void syncAmounts() {
        LocalDate today = LocalDate.now();
        if (totalAmount == null) totalAmount = BigDecimal.ZERO;
        if (paidAmount == null) paidAmount = BigDecimal.ZERO;
        if (paidAmount.compareTo(BigDecimal.ZERO) < 0) paidAmount = BigDecimal.ZERO;
        if (paidAmount.compareTo(totalAmount) > 0) paidAmount = totalAmount;
        balanceAmount = totalAmount.subtract(paidAmount);
        if (balanceAmount.compareTo(BigDecimal.ZERO) <= 0) {
            status = "PAID";
        } else if (dueDate != null && dueDate.isBefore(today)) {
            status = "OVERDUE";
        } else if (paidAmount.compareTo(BigDecimal.ZERO) > 0) {
            status = "PARTIAL";
        } else if (dueDate != null && dueDate.isEqual(today)) {
            status = "PENDING";
        } else {
            status = "PENDING";
        }
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public LegalCase getLegalCase() { return legalCase; }
    public void setLegalCase(LegalCase legalCase) { this.legalCase = legalCase; }
    public Organization getOrganization() { return organization; }
    public void setOrganization(Organization organization) { this.organization = organization; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public BigDecimal getTotalAmount() { return totalAmount; }
    public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }
    public BigDecimal getPaidAmount() { return paidAmount; }
    public void setPaidAmount(BigDecimal paidAmount) { this.paidAmount = paidAmount; }
    public BigDecimal getBalanceAmount() { return balanceAmount; }
    public void setBalanceAmount(BigDecimal balanceAmount) { this.balanceAmount = balanceAmount; }
    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Integer getDisplayOrder() { return displayOrder; }
    public void setDisplayOrder(Integer displayOrder) { this.displayOrder = displayOrder; }
    public Boolean getIsLawyerFee() { return isLawyerFee; }
    public void setIsLawyerFee(Boolean isLawyerFee) { this.isLawyerFee = isLawyerFee; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
