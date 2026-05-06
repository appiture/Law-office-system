package com.lawoffice.backend.dto;

import jakarta.validation.constraints.Size;

public class TaskRequest {
    @Size(max = 500, message = "Task title cannot exceed 500 characters")
    private String title;
    
    @Size(max = 2000, message = "Task description cannot exceed 2000 characters")
    private String description;
    
    private Boolean completed;
    
    @Size(max = 100, message = "Priority cannot exceed 100 characters")
    private String priority;
    
    @Size(max = 150, message = "Assigned to cannot exceed 150 characters")
    private String assignedTo;
    
    @Size(max = 150, message = "Assigned by cannot exceed 150 characters")
    private String assignedBy;
    
    private java.time.LocalDateTime dueDate;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Boolean getCompleted() { return completed; }
    public void setCompleted(Boolean completed) { this.completed = completed; }

    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }

    public String getAssignedTo() { return assignedTo; }
    public void setAssignedTo(String assignedTo) { this.assignedTo = assignedTo; }

    public String getAssignedBy() { return assignedBy; }
    public void setAssignedBy(String assignedBy) { this.assignedBy = assignedBy; }

    public java.time.LocalDateTime getDueDate() { return dueDate; }
    public void setDueDate(java.time.LocalDateTime dueDate) { this.dueDate = dueDate; }
}
