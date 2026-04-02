package com.lawoffice.backend.controller;

import com.lawoffice.backend.dto.ClientRequest;
import com.lawoffice.backend.dto.ClientResponse;
import com.lawoffice.backend.dto.FollowUpRequest;
import com.lawoffice.backend.dto.NextDueRequest;
import com.lawoffice.backend.dto.RemarksRequest;
import com.lawoffice.backend.model.Client;
import com.lawoffice.backend.service.ClientService;

import org.springframework.http.ResponseEntity;

import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import jakarta.validation.Valid;
import java.util.List;
@RestController
@RequestMapping("/api/clients")
public class ClientController {

    private final ClientService clientService;

    public ClientController(ClientService clientService) {
        this.clientService = clientService;
    }

    @PostMapping(consumes = {"multipart/form-data"})

    public ClientResponse create(
            @ModelAttribute @Valid ClientRequest request,
            @RequestParam(value = "image", required = false) MultipartFile image,
            @RequestParam(value = "caseDetails", required = false) List<MultipartFile> caseDetails
    ){
        return clientService.create(request, image, caseDetails);
    }
    @GetMapping
    public List<ClientResponse> getAll() {
        return clientService.getAll();
    }

    // UPDATE CLIENT (Founder only)
    @PutMapping(value = "/{id}", consumes = {"application/json"})

    public ResponseEntity<Client> update(
            @PathVariable Long id,
            @Valid @RequestBody ClientRequest request) {
        return ResponseEntity.ok(clientService.update(id, request));
    }

    @PutMapping(value = "/{id}", consumes = {"multipart/form-data"})

    public ResponseEntity<ClientResponse> updateWithImage(
            @PathVariable Long id,
            @ModelAttribute @Valid ClientRequest request,
            @RequestParam(value = "image", required = false) MultipartFile image,
            @RequestParam(value = "caseDetails", required = false) List<MultipartFile> caseDetails) {
        return ResponseEntity.ok(clientService.updateWithImage(id, request, image, caseDetails));
    }

    @PutMapping(value = "/{id}/image", consumes = {"multipart/form-data"})

    public ResponseEntity<ClientResponse> updateImage(
            @PathVariable Long id,
            @RequestParam("image") MultipartFile image) {
        return ResponseEntity.ok(clientService.updateImage(id, image));
    }

    @PostMapping(value = "/{id}/image", consumes = {"multipart/form-data"})

    public ResponseEntity<ClientResponse> updateImagePost(
            @PathVariable Long id,
            @RequestParam("image") MultipartFile image) {
        return ResponseEntity.ok(clientService.updateImage(id, image));
    }

// DELETE CLIENT (Founder only)
    @DeleteMapping("/{id}")

    public ResponseEntity<?> delete(@PathVariable Long id) {
        clientService.delete(id);
        return ResponseEntity.ok().build();
    }
    @PutMapping("/{id}/next-due")

    public ResponseEntity<Client> updateNextDue(
            @PathVariable Long id,
            @Valid @RequestBody NextDueRequest request) {
        return ResponseEntity.ok(clientService.updateNextDue(id, request));
    }
    @PutMapping("/{id}/follow-up")

    public ResponseEntity<Client> followUp(
            @PathVariable Long id,
            @Valid @RequestBody FollowUpRequest request) {

        return ResponseEntity.ok(clientService.followUp(id, request));
    }

    // UPDATE REMARKS ONLY (for both ADMIN and FOUNDER)
    @PutMapping("/{id}/remarks")

    public ResponseEntity<Client> updateRemarks(
            @PathVariable Long id,
            @Valid @RequestBody RemarksRequest request) {
        return ResponseEntity.ok(clientService.updateRemarks(id, request.getRemarks()));
    }

    @DeleteMapping("/case-details/{detailId}")
    public ResponseEntity<?> deleteCaseDetail(@PathVariable Long detailId) {
        clientService.deleteCaseDetail(detailId);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{id}/case-details")
    public ResponseEntity<ClientResponse> addCaseDetail(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(clientService.addCaseDetail(id, file));
    }
}
