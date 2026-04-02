package com.lawoffice.backend.service;

import com.lawoffice.backend.dto.TaskRequest;
import com.lawoffice.backend.dto.TaskResponse;

import java.util.List;

public interface TaskService {
    List<TaskResponse> getAll();
    TaskResponse create(TaskRequest request);
    TaskResponse update(Long id, TaskRequest request);
    void delete(Long id);
}
