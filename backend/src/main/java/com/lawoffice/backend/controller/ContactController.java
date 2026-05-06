package com.lawoffice.backend.controller;

import com.lawoffice.backend.model.Contact;
import com.lawoffice.backend.security.AuthenticatedActorResolver;
import com.lawoffice.backend.service.ContactService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/contacts")
public class ContactController {

    private final ContactService contactService;
    private final AuthenticatedActorResolver authenticatedActorResolver;

    public ContactController(
            ContactService contactService,
            AuthenticatedActorResolver authenticatedActorResolver
    ) {
        this.contactService = contactService;
        this.authenticatedActorResolver = authenticatedActorResolver;
    }

    @GetMapping
    public List<Contact> getAll() {
        return contactService.getAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Contact> getById(@PathVariable Long id) {
        return ResponseEntity.ok(contactService.getById(id));
    }

    @PostMapping
    public ResponseEntity<Contact> create(@RequestBody Contact contact, Authentication authentication) {
        return ResponseEntity.ok(contactService.create(contact, authenticatedActorResolver.resolve(authentication)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Contact> update(
            @PathVariable Long id,
            @RequestBody Contact contact,
            Authentication authentication
    ) {
        return ResponseEntity.ok(contactService.update(id, contact, authenticatedActorResolver.resolve(authentication)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        contactService.delete(id);
        return ResponseEntity.ok().build();
    }
}
