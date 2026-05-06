package com.lawoffice.backend.controller;

import com.lawoffice.backend.model.PutUpDate;
import com.lawoffice.backend.security.AuthenticatedActorResolver;
import com.lawoffice.backend.service.PutUpDateService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/put-up-dates")
public class PutUpDateController {

    private final PutUpDateService putUpDateService;
    private final AuthenticatedActorResolver authenticatedActorResolver;

    public PutUpDateController(
            PutUpDateService putUpDateService,
            AuthenticatedActorResolver authenticatedActorResolver
    ) {
        this.putUpDateService = putUpDateService;
        this.authenticatedActorResolver = authenticatedActorResolver;
    }

    @GetMapping
    public List<PutUpDate> getAll() {
        return putUpDateService.getAll();
    }

    @GetMapping("/case/{caseId}")
    public List<PutUpDate> getByCaseId(@PathVariable Long caseId) {
        return putUpDateService.getByCaseId(caseId);
    }

    @GetMapping("/range")
    public List<PutUpDate> getByDateRange(
            @RequestParam LocalDateTime fromDate,
            @RequestParam LocalDateTime toDate) {
        return putUpDateService.getByDateRange(fromDate, toDate);
    }

    @GetMapping("/{id}")
    public ResponseEntity<PutUpDate> getById(@PathVariable Long id) {
        return ResponseEntity.ok(putUpDateService.getById(id));
    }

    @PostMapping
    public ResponseEntity<PutUpDate> create(@RequestBody PutUpDate putUpDate, Authentication authentication) {
        return ResponseEntity.ok(putUpDateService.create(putUpDate, authenticatedActorResolver.resolve(authentication)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<PutUpDate> update(
            @PathVariable Long id,
            @RequestBody PutUpDate putUpDate,
            Authentication authentication
    ) {
        return ResponseEntity.ok(putUpDateService.update(id, putUpDate, authenticatedActorResolver.resolve(authentication)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        putUpDateService.delete(id);
        return ResponseEntity.ok().build();
    }
}
