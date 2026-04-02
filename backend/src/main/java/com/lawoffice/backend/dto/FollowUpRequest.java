package com.lawoffice.backend.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;

public class FollowUpRequest {

    @DecimalMin(value = "0.01", message = "Payment amount must be greater than zero")
    @Digits(integer = 12, fraction = 2, message = "Invalid payment amount format")
    private BigDecimal paymentAmount;

    @Future(message = "Next due date must be in the future")
    private LocalDate nextDueDate;

    @Size(max = 500, message = "Remarks cannot exceed 500 characters")
    private String nextDueRemarks;

    private Boolean contacted;

    public BigDecimal getPaymentAmount() { return paymentAmount; }
    public void setPaymentAmount(BigDecimal paymentAmount) { this.paymentAmount = paymentAmount; }

    public LocalDate getNextDueDate() { return nextDueDate; }
    public void setNextDueDate(LocalDate nextDueDate) { this.nextDueDate = nextDueDate; }

    public String getNextDueRemarks() { return nextDueRemarks; }
    public void setNextDueRemarks(String nextDueRemarks) { this.nextDueRemarks = nextDueRemarks; }

    public Boolean getContacted() { return contacted; }
    public void setContacted(Boolean contacted) { this.contacted = contacted; }
}
