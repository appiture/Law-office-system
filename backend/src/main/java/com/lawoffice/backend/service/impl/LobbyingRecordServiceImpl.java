package com.lawoffice.backend.service.impl;

import com.lawoffice.backend.model.Client;
import com.lawoffice.backend.model.LobbyingRecord;
import com.lawoffice.backend.model.Organization;
import com.lawoffice.backend.repository.ClientRepository;
import com.lawoffice.backend.repository.LobbyingRecordRepository;
import com.lawoffice.backend.repository.OrganizationRepository;
import com.lawoffice.backend.security.TenantContext;
import com.lawoffice.backend.service.LobbyingRecordService;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class LobbyingRecordServiceImpl implements LobbyingRecordService {

    private final LobbyingRecordRepository lobbyingRecordRepository;
    private final ClientRepository clientRepository;
    private final OrganizationRepository organizationRepository;

    public LobbyingRecordServiceImpl(LobbyingRecordRepository lobbyingRecordRepository, 
                                   ClientRepository clientRepository,
                                   OrganizationRepository organizationRepository) {
        this.lobbyingRecordRepository = lobbyingRecordRepository;
        this.clientRepository = clientRepository;
        this.organizationRepository = organizationRepository;
    }

    @Override
    public List<LobbyingRecord> getAll() {
        return lobbyingRecordRepository.findAllByOrganizationIdOrderByLobbyingDateDesc(currentOrganizationId());
    }

    @Override
    public List<LobbyingRecord> getByClientId(Long clientId) {
        return lobbyingRecordRepository.findByClientIdAndOrganizationIdOrderByLobbyingDateDesc(clientId, currentOrganizationId());
    }

    @Override
    public LobbyingRecord getById(Long id) {
        return lobbyingRecordRepository.findByIdAndOrganizationId(id, currentOrganizationId())
                .orElseThrow(() -> new EntityNotFoundException("Lobbying record not found"));
    }

    @Override
    public LobbyingRecord create(LobbyingRecord record, String actor) {
        String purpose = record.getPurpose() == null ? "" : record.getPurpose().trim();
        
        if (purpose.isEmpty()) {
            throw new IllegalArgumentException("Lobbying purpose is required");
        }
        if (record.getClient() == null || record.getClient().getId() == null) {
            throw new IllegalArgumentException("Client is required");
        }

        // Verify client exists
        Long orgId = currentOrganizationId();
        Client client = clientRepository.findByIdAndOrganizationId(record.getClient().getId(), orgId)
                .orElseThrow(() -> new EntityNotFoundException("Client not found"));

        record.setClient(client);
        record.setCreatedBy(actor);
        record.setOrganization(requireOrganization(orgId));
        return lobbyingRecordRepository.save(record);
    }

    @Override
    public LobbyingRecord update(Long id, LobbyingRecord record, String actor) {
        LobbyingRecord existing = lobbyingRecordRepository.findByIdAndOrganizationId(id, currentOrganizationId())
                .orElseThrow(() -> new EntityNotFoundException("Lobbying record not found"));

        boolean changed = false;

        if (record.getPurpose() != null) {
            String purpose = record.getPurpose().trim();
            if (purpose.isEmpty()) {
                throw new IllegalArgumentException("Lobbying purpose cannot be empty");
            }
            existing.setPurpose(purpose);
            changed = true;
        }

        if (record.getLobbyingDate() != null) {
            existing.setLobbyingDate(record.getLobbyingDate());
            changed = true;
        }

        if (record.getStatus() != null) {
            existing.setStatus(record.getStatus());
            changed = true;
        }

        if (record.getNotes() != null) {
            existing.setNotes(record.getNotes());
            changed = true;
        }

        if (record.getLobbyingOfficer() != null) {
            existing.setLobbyingOfficer(record.getLobbyingOfficer());
            changed = true;
        }

        if (changed) {
            existing.setCreatedBy(actor);
        }

        return lobbyingRecordRepository.save(existing);
    }

    @Override
    public void delete(Long id) {
        lobbyingRecordRepository.delete(getById(id));
    }

    private Long currentOrganizationId() {
        Long orgId = TenantContext.getCurrentTenant();
        if (orgId == null) {
            throw new AccessDeniedException("No organization context is available for this request");
        }
        return orgId;
    }

    private Organization requireOrganization(Long orgId) {
        return organizationRepository.findById(orgId)
                .orElseThrow(() -> new EntityNotFoundException("Organization not found"));
    }
}
