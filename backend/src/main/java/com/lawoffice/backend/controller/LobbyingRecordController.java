package com.lawoffice.backend.controller;

import com.lawoffice.backend.model.LobbyingRecord;
import com.lawoffice.backend.security.AuthenticatedActorResolver;
import com.lawoffice.backend.service.LobbyingRecordService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/lobbying-records")
public class LobbyingRecordController {

    private final LobbyingRecordService lobbyingRecordService;
    private final AuthenticatedActorResolver authenticatedActorResolver;

    public LobbyingRecordController(
            LobbyingRecordService lobbyingRecordService,
            AuthenticatedActorResolver authenticatedActorResolver
    ) {
        this.lobbyingRecordService = lobbyingRecordService;
        this.authenticatedActorResolver = authenticatedActorResolver;
    }

    @GetMapping
    public List<LobbyingRecord> getAll() {
        return lobbyingRecordService.getAll();
    }

    @GetMapping("/client/{clientId}")
    public List<LobbyingRecord> getByClientId(@PathVariable Long clientId) {
        return lobbyingRecordService.getByClientId(clientId);
    }

    @GetMapping("/{id}")
    public ResponseEntity<LobbyingRecord> getById(@PathVariable Long id) {
        return ResponseEntity.ok(lobbyingRecordService.getById(id));
    }

    @PostMapping
    public ResponseEntity<LobbyingRecord> create(@RequestBody LobbyingRecord record, Authentication authentication) {
        return ResponseEntity.ok(lobbyingRecordService.create(record, authenticatedActorResolver.resolve(authentication)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<LobbyingRecord> update(
            @PathVariable Long id,
            @RequestBody LobbyingRecord record,
            Authentication authentication
    ) {
        return ResponseEntity.ok(lobbyingRecordService.update(id, record, authenticatedActorResolver.resolve(authentication)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        lobbyingRecordService.delete(id);
        return ResponseEntity.ok().build();
    }
}
