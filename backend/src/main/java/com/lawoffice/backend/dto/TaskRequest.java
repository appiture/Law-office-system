package com.lawoffice.backend.dto;

import jakarta.validation.constraints.Size;

public class TaskRequest {
    @Size(max = 500, message = "Task title cannot exceed 500 characters")
    private String title;
    private Boolean completed;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public Boolean getCompleted() { return completed; }
    public void setCompleted(Boolean completed) { this.completed = completed; }
}
