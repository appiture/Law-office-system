package com.lawoffice.backend.service.impl;

import com.lawoffice.backend.dto.TaskRequest;
import com.lawoffice.backend.dto.TaskResponse;
import com.lawoffice.backend.model.SharedTask;
import com.lawoffice.backend.repository.SharedTaskRepository;
import com.lawoffice.backend.service.TaskService;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class TaskServiceImpl implements TaskService {

    private final SharedTaskRepository sharedTaskRepository;

    public TaskServiceImpl(SharedTaskRepository sharedTaskRepository) {
        this.sharedTaskRepository = sharedTaskRepository;
    }

    @Override
    public List<TaskResponse> getAll() {
        return sharedTaskRepository.findAllByOrderByUpdatedAtDescIdDesc()
                .stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Override
    public TaskResponse create(TaskRequest request) {
        String title = request.getTitle() == null ? "" : request.getTitle().trim();
        if (title.isEmpty()) {
            throw new IllegalArgumentException("Task title is required");
        }

        String userEmail = getCurrentUserEmail();

        SharedTask task = new SharedTask();
        task.setTitle(title);
        task.setCompleted(Boolean.FALSE);
        task.setCreatedBy(userEmail);
        task.setUpdatedBy(userEmail);

        return toResponse(sharedTaskRepository.save(task));
    }

    @Override
    public TaskResponse update(Long id, TaskRequest request) {
        SharedTask existing = sharedTaskRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Task not found"));

        boolean changed = false;

        if (request.getTitle() != null) {
            String title = request.getTitle().trim();
            if (title.isEmpty()) {
                throw new IllegalArgumentException("Task title cannot be empty");
            }
            existing.setTitle(title);
            changed = true;
        }

        if (request.getCompleted() != null) {
            existing.setCompleted(request.getCompleted());
            changed = true;
        }

        if (changed) {
            existing.setUpdatedBy(getCurrentUserEmail());
        }

        return toResponse(sharedTaskRepository.save(existing));
    }

    @Override
    public void delete(Long id) {
        if (!sharedTaskRepository.existsById(id)) {
            throw new EntityNotFoundException("Task not found");
        }
        sharedTaskRepository.deleteById(id);
    }

    private String getCurrentUserEmail() {
        return "founder@lawoffice.com";
    }

    private TaskResponse toResponse(SharedTask task) {
        TaskResponse response = new TaskResponse();
        response.setId(task.getId());
        response.setTitle(task.getTitle());
        response.setCompleted(Boolean.TRUE.equals(task.getCompleted()));
        response.setCreatedBy(task.getCreatedBy());
        response.setUpdatedBy(task.getUpdatedBy());
        response.setCreatedAt(task.getCreatedAt());
        response.setUpdatedAt(task.getUpdatedAt());
        return response;
    }
}
