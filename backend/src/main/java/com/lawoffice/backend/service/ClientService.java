package com.lawoffice.backend.service;

import com.lawoffice.backend.dto.ClientRequest;
import com.lawoffice.backend.dto.ClientResponse;
import com.lawoffice.backend.dto.FollowUpRequest;
import com.lawoffice.backend.dto.NextDueRequest;
import com.lawoffice.backend.model.Client;
import org.springframework.web.multipart.MultipartFile;


import java.util.List;

public interface ClientService {

    // Create client
    ClientResponse create(ClientRequest request, MultipartFile image, List<MultipartFile> caseDetails);

    // Get all clients (DTO)
    List<ClientResponse> getAll();

    // Get all entities (for internal use if needed)
    List<Client> getAllEntities();

    // Update client
    Client update(Long id, ClientRequest request);

    // Update client with optional image in single multipart request
    ClientResponse updateWithImage(Long id, ClientRequest request, MultipartFile image, List<MultipartFile> caseDetails);

    // Re-upload client image
    ClientResponse updateImage(Long id, MultipartFile image);

    // Delete client
    void delete(Long id);

    // Update next due date & remarks
    Client updateNextDue(Long id, NextDueRequest request);

    Client followUp(Long id, FollowUpRequest request);

    // Update remarks only
    Client updateRemarks(Long id, String remarks);

    void deleteCaseDetail(Long detailId);

    ClientResponse addCaseDetail(Long clientId, MultipartFile file);
}
