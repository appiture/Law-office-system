package com.lawoffice.backend.dto;

import jakarta.validation.constraints.*;
import java.time.LocalDate;

public class NextDueRequest {

    @Future(message = "Next due date must be in the future")
    private LocalDate nextDueDate;

    @Size(max = 500, message = "Remarks cannot exceed 500 characters")
    private String nextDueRemarks;

    public LocalDate getNextDueDate() {
        return nextDueDate;
    }

    public void setNextDueDate(LocalDate nextDueDate) {
        this.nextDueDate = nextDueDate;
    }

    public String getNextDueRemarks() {
        return nextDueRemarks;
    }

    public void setNextDueRemarks(String nextDueRemarks) {
        this.nextDueRemarks = nextDueRemarks;
    }
}
