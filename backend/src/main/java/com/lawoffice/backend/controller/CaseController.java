package com.lawoffice.backend.controller;

import com.lawoffice.backend.dto.PlatformRequests;
import com.lawoffice.backend.dto.PlatformResponses;
import com.lawoffice.backend.service.CasePlatformService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/cases")
public class CaseController {

    private final CasePlatformService casePlatformService;

    public CaseController(CasePlatformService casePlatformService) {
        this.casePlatformService = casePlatformService;
    }

    @GetMapping
    public List<PlatformResponses.CaseDetails> listCases() {
        return casePlatformService.listCases();
    }

    @GetMapping("/{caseId}")
    public PlatformResponses.CaseDetails getCase(@PathVariable Long caseId) {
        return casePlatformService.getCase(caseId);
    }

    @PostMapping
    public PlatformResponses.CaseDetails createCase(
            @Valid @RequestBody PlatformRequests.CasePayload payload,
            @RequestHeader(value = "X-User-Email", required = false) String actor) {
        return casePlatformService.createCase(payload, actor);
    }

    @PutMapping("/{caseId}")
    public PlatformResponses.CaseDetails updateCase(
            @PathVariable Long caseId,
            @Valid @RequestBody PlatformRequests.CasePayload payload) {
        return casePlatformService.updateCase(caseId, payload);
    }

    @GetMapping("/{caseId}/payments/charges")
    public List<PlatformResponses.ChargeItem> listChargeItems(@PathVariable Long caseId) {
        return casePlatformService.listChargeItems(caseId);
    }

    @PostMapping("/{caseId}/payments/charges")
    public PlatformResponses.CaseDetails addChargeItem(
            @PathVariable Long caseId,
            @Valid @RequestBody PlatformRequests.ChargeItemPayload payload) {
        return casePlatformService.addChargeItem(caseId, payload);
    }

    @PutMapping("/{caseId}/payments/charges/{chargeItemId}")
    public PlatformResponses.CaseDetails updateChargeItem(
            @PathVariable Long caseId,
            @PathVariable Long chargeItemId,
            @Valid @RequestBody PlatformRequests.ChargeItemPayload payload) {
        return casePlatformService.updateChargeItem(caseId, chargeItemId, payload);
    }

    @GetMapping("/{caseId}/payments/history")
    public List<PlatformResponses.PaymentEntry> listPaymentHistory(@PathVariable Long caseId) {
        return casePlatformService.listPaymentHistory(caseId);
    }

    @PostMapping("/{caseId}/payments/history")
    public PlatformResponses.CaseDetails addPayment(
            @PathVariable Long caseId,
            @Valid @RequestBody PlatformRequests.PaymentPayload payload,
            @RequestHeader(value = "X-User-Email", required = false) String actor) {
        return casePlatformService.addPayment(caseId, payload, actor);
    }

    @PostMapping("/{caseId}/documents")
    public PlatformResponses.CaseDetails addDocument(
            @PathVariable Long caseId,
            @Valid @RequestBody PlatformRequests.DocumentPayload payload,
            @RequestHeader(value = "X-User-Email", required = false) String actor) {
        return casePlatformService.addDocument(caseId, payload, actor);
    }

    @DeleteMapping("/{caseId}/documents/{documentId}")
    public void deleteDocument(@PathVariable Long caseId, @PathVariable Long documentId) {
        casePlatformService.deleteDocument(caseId, documentId);
    }

    @GetMapping("/{caseId}/followups")
    public List<PlatformResponses.FollowUpEntry> listFollowUps(@PathVariable Long caseId) {
        return casePlatformService.listFollowUps(caseId);
    }

    @PostMapping("/{caseId}/followups")
    public PlatformResponses.CaseDetails addFollowUp(
            @PathVariable Long caseId,
            @Valid @RequestBody PlatformRequests.FollowUpPayload payload,
            @RequestHeader(value = "X-User-Email", required = false) String actor) {
        return casePlatformService.addFollowUp(caseId, payload, actor);
    }

    @PutMapping("/{caseId}/followups/{followUpId}")
    public PlatformResponses.CaseDetails updateFollowUp(
            @PathVariable Long caseId,
            @PathVariable Long followUpId,
            @Valid @RequestBody PlatformRequests.FollowUpPayload payload) {
        return casePlatformService.updateFollowUp(caseId, followUpId, payload);
    }

    @DeleteMapping("/{caseId}/followups/{followUpId}")
    public void deleteFollowUp(@PathVariable Long caseId, @PathVariable Long followUpId) {
        casePlatformService.deleteFollowUp(caseId, followUpId);
    }
}
