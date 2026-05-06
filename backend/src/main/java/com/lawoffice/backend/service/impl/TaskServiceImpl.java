package com.lawoffice.backend.service.impl;

import com.lawoffice.backend.dto.TaskRequest;
import com.lawoffice.backend.dto.TaskResponse;
import com.lawoffice.backend.model.SharedTask;
import com.lawoffice.backend.repository.SharedTaskRepository;
import com.lawoffice.backend.security.AuthenticatedActorResolver;
import com.lawoffice.backend.service.TaskService;
import com.lawoffice.backend.repository.OrganizationRepository;
import com.lawoffice.backend.security.TenantContext;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class TaskServiceImpl implements TaskService {

    private final SharedTaskRepository sharedTaskRepository;
    private final AuthenticatedActorResolver authenticatedActorResolver;
    private final OrganizationRepository organizationRepository;

    public TaskServiceImpl(
            SharedTaskRepository sharedTaskRepository,
            AuthenticatedActorResolver authenticatedActorResolver,
            OrganizationRepository organizationRepository
    ) {
        this.sharedTaskRepository = sharedTaskRepository;
        this.authenticatedActorResolver = authenticatedActorResolver;
        this.organizationRepository = organizationRepository;
    }

    @Override
    public List<TaskResponse> getAll() {
        Long orgId = TenantContext.getCurrentTenant();
        return sharedTaskRepository.findAllByOrganizationIdOrderByUpdatedAtDescIdDesc(orgId)
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
        Long orgId = TenantContext.getCurrentTenant();

        SharedTask task = new SharedTask();
        task.setTitle(title);
        task.setDescription(request.getDescription());
        task.setCompleted(Boolean.FALSE);
        task.setPriority(request.getPriority());
        task.setAssignedTo(request.getAssignedTo());
        task.setAssignedBy(request.getAssignedBy());
        task.setDueDate(request.getDueDate());
        task.setOrganization(organizationRepository.getReferenceById(orgId));
        task.setCreatedBy(userEmail);
        task.setUpdatedBy(userEmail);

        return toResponse(sharedTaskRepository.save(task));
    }

    @Override
    public TaskResponse update(Long id, TaskRequest request) {
        Long orgId = TenantContext.getCurrentTenant();
        SharedTask existing = sharedTaskRepository.findByIdAndOrganizationId(id, orgId)
                .orElseThrow(() -> new EntityNotFoundException("Task not found in your organization"));

        boolean changed = false;

        if (request.getTitle() != null) {
            String title = request.getTitle().trim();
            if (title.isEmpty()) {
                throw new IllegalArgumentException("Task title cannot be empty");
            }
            existing.setTitle(title);
            changed = true;
        }

        if (request.getDescription() != null) {
            existing.setDescription(request.getDescription());
            changed = true;
        }

        if (request.getCompleted() != null) {
            existing.setCompleted(request.getCompleted());
            changed = true;
        }

        if (request.getPriority() != null) {
            existing.setPriority(request.getPriority());
            changed = true;
        }

        if (request.getAssignedTo() != null) {
            existing.setAssignedTo(request.getAssignedTo());
            changed = true;
        }

        if (request.getAssignedBy() != null) {
            existing.setAssignedBy(request.getAssignedBy());
            changed = true;
        }

        if (request.getDueDate() != null) {
            existing.setDueDate(request.getDueDate());
            changed = true;
        }

        if (changed) {
            existing.setUpdatedBy(getCurrentUserEmail());
        }

        return toResponse(sharedTaskRepository.save(existing));
    }

    @Override
    public void delete(Long id) {
        Long orgId = TenantContext.getCurrentTenant();
        SharedTask task = sharedTaskRepository.findByIdAndOrganizationId(id, orgId)
                .orElseThrow(() -> new EntityNotFoundException("Task not found in your organization"));
        sharedTaskRepository.delete(task);
    }

    private String getCurrentUserEmail() {
        return authenticatedActorResolver.resolveCurrentActor();
    }

    private TaskResponse toResponse(SharedTask task) {
        TaskResponse response = new TaskResponse();
        response.setId(task.getId());
        response.setTitle(task.getTitle());
        response.setDescription(task.getDescription());
        response.setCompleted(Boolean.TRUE.equals(task.getCompleted()));
        response.setPriority(task.getPriority());
        response.setAssignedTo(task.getAssignedTo());
        response.setAssignedBy(task.getAssignedBy());
        response.setDueDate(task.getDueDate());
        response.setCreatedBy(task.getCreatedBy());
        response.setUpdatedBy(task.getUpdatedBy());
        response.setCreatedAt(task.getCreatedAt());
        response.setUpdatedAt(task.getUpdatedAt());
        return response;
    }
}
