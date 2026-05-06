package com.lawoffice.backend.controller;

import com.lawoffice.backend.dto.PlatformResponses;
import com.lawoffice.backend.service.CasePlatformService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class ModuleController {

    private final CasePlatformService casePlatformService;

    public ModuleController(CasePlatformService casePlatformService) {
        this.casePlatformService = casePlatformService;
    }

    @GetMapping("/api/payments")
    public List<PlatformResponses.CaseDetails> paymentsModule() {
        return casePlatformService.listPaymentsModule();
    }

    @GetMapping("/api/documents")
    public List<PlatformResponses.CaseDetails> documentsModule() {
        return casePlatformService.listDocumentsModule();
    }

    @GetMapping("/api/followups")
    public List<PlatformResponses.CaseDetails> followUpsModule() {
        return casePlatformService.listFollowUpsModule();
    }

    @GetMapping("/api/dashboard/summary")
    public PlatformResponses.DashboardSummary dashboardSummary() {
        return casePlatformService.getDashboardSummary();
    }
}
