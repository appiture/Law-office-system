package com.lawoffice.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class RemarksRequest {

    @NotBlank(message = "Remarks are required")
    @Size(max = 1000, message = "Remarks cannot exceed 1000 characters")
    private String remarks;

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
    }
}
