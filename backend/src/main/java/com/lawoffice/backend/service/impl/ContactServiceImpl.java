package com.lawoffice.backend.service.impl;

import com.lawoffice.backend.model.Contact;
import com.lawoffice.backend.model.Organization;
import com.lawoffice.backend.repository.ContactRepository;
import com.lawoffice.backend.repository.OrganizationRepository;
import com.lawoffice.backend.security.TenantContext;
import com.lawoffice.backend.service.ContactService;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ContactServiceImpl implements ContactService {

    private final ContactRepository contactRepository;
    private final OrganizationRepository organizationRepository;

    public ContactServiceImpl(ContactRepository contactRepository, OrganizationRepository organizationRepository) {
        this.contactRepository = contactRepository;
        this.organizationRepository = organizationRepository;
    }

    @Override
    public List<Contact> getAll() {
        return contactRepository.findAllByTenantOrganizationIdOrderByNameAsc(currentOrganizationId());
    }

    @Override
    public Contact getById(Long id) {
        return contactRepository.findByIdAndTenantOrganizationId(id, currentOrganizationId())
                .orElseThrow(() -> new EntityNotFoundException("Contact not found"));
    }

    @Override
    public Contact create(Contact contact, String actor) {
        String name = contact.getName() == null ? "" : contact.getName().trim();
        String contactNumber = contact.getContactNumber() == null ? "" : contact.getContactNumber().trim();
        
        if (name.isEmpty()) {
            throw new IllegalArgumentException("Contact name is required");
        }
        if (contactNumber.isEmpty()) {
            throw new IllegalArgumentException("Contact number is required");
        }

        contact.setCreatedBy(actor);
        contact.setTenantOrganization(requireOrganization(currentOrganizationId()));
        return contactRepository.save(contact);
    }

    @Override
    public Contact update(Long id, Contact contact, String actor) {
        Contact existing = getById(id);

        boolean changed = false;

        if (contact.getName() != null) {
            String name = contact.getName().trim();
            if (name.isEmpty()) {
                throw new IllegalArgumentException("Contact name cannot be empty");
            }
            existing.setName(name);
            changed = true;
        }

        if (contact.getDesignation() != null) {
            existing.setDesignation(contact.getDesignation());
            changed = true;
        }

        if (contact.getContactNumber() != null) {
            String contactNumber = contact.getContactNumber().trim();
            if (contactNumber.isEmpty()) {
                throw new IllegalArgumentException("Contact number cannot be empty");
            }
            existing.setContactNumber(contactNumber);
            changed = true;
        }

        if (contact.getEmail() != null) {
            existing.setEmail(contact.getEmail());
            changed = true;
        }

        if (contact.getOrganization() != null) {
            existing.setOrganization(contact.getOrganization());
            changed = true;
        }

        if (contact.getNotes() != null) {
            existing.setNotes(contact.getNotes());
            changed = true;
        }

        if (changed) {
            existing.setCreatedBy(actor);
        }

        return contactRepository.save(existing);
    }

    @Override
    public void delete(Long id) {
        contactRepository.delete(getById(id));
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
