package com.lawoffice.backend.controller;

import com.lawoffice.backend.dto.PlatformRequests;
import com.lawoffice.backend.dto.PlatformResponses;
import com.lawoffice.backend.service.CasePlatformService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/clients")
public class ClientController {

    private final CasePlatformService casePlatformService;

    public ClientController(CasePlatformService casePlatformService) {
        this.casePlatformService = casePlatformService;
    }

    @GetMapping
    public List<PlatformResponses.ClientSummary> listClients() {
        return casePlatformService.listClients();
    }

    @GetMapping("/{clientId}")
    public PlatformResponses.ClientSummary getClient(@PathVariable Long clientId) {
        return casePlatformService.getClient(clientId);
    }

    @PostMapping
    public PlatformResponses.ClientSummary createClient(
            @Valid @RequestBody PlatformRequests.ClientPayload payload,
            @RequestHeader(value = "X-User-Email", required = false) String actor) {
        return casePlatformService.createClient(payload, actor);
    }

    @PutMapping("/{clientId}")
    public PlatformResponses.ClientSummary updateClient(
            @PathVariable Long clientId,
            @Valid @RequestBody PlatformRequests.ClientPayload payload,
            @RequestHeader(value = "X-User-Email", required = false) String actor) {
        return casePlatformService.updateClient(clientId, payload, actor);
    }

    @PostMapping("/wizard/save")
    public PlatformResponses.WizardSaveResult saveWizardStep(
            @Valid @RequestBody PlatformRequests.WizardSavePayload payload,
            @RequestHeader(value = "X-User-Email", required = false) String actor) {
        return casePlatformService.saveWizardStep(payload, actor);
    }

    @GetMapping("/{clientId}/drafts")
    public PlatformResponses.ClientDrafts getClientDrafts(@PathVariable Long clientId) {
        return casePlatformService.getClientDrafts(clientId);
    }

    @PutMapping("/{clientId}/resume")
    public PlatformResponses.WizardResumeResult resumeWizard(
            @PathVariable Long clientId,
            @RequestHeader(value = "X-User-Email", required = false) String actor) {
        return casePlatformService.resumeWizard(clientId, actor);
    }
}
