package com.lawoffice.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lawoffice.backend.security.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class WorkflowAuditIntegrationTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtUtil jwtUtil;

    @Test
    void createEditPaymentFollowUpAndDocumentFlowPersistsCleanly() throws Exception {
        String createdClientContent = mockMvc.perform(authenticatedPost("/api/clients", 2L, """
                        {
                          "name": "Audit Client",
                          "phone": "9876543210",
                          "altPhone": "9876501234",
                          "email": "audit.client@example.com",
                          "address": "123 Audit Street",
                          "gender": "Male",
                          "occupation": "Business",
                          "city": "Mumbai",
                          "state": "Maharashtra",
                          "pinCode": "400001",
                          "idProofType": "PAN",
                          "idProofNumber": "ABCDE1234F",
                          "notes": "Important client"
                        }
                        """))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        JsonNode createdClient = objectMapper.readTree(createdClientContent);
        Long clientId = createdClient.path("id").asLong();
        assertThat(createdClient.path("phone").asText()).isEqualTo("9876543210");
        assertThat(createdClient.path("altPhone").asText()).isEqualTo("9876501234");

        mockMvc.perform(authenticatedPut("/api/clients/" + clientId, 2L, """
                        {
                          "name": "Audit Client Updated",
                          "phone": "9876543210",
                          "altPhone": "9876501234",
                          "email": "updated.audit.client@example.com",
                          "address": "123 Audit Street",
                          "gender": "Male",
                          "occupation": "Business",
                          "city": "Mumbai",
                          "state": "Maharashtra",
                          "pinCode": "400001",
                          "idProofType": "PAN",
                          "idProofNumber": "ABCDE1234F",
                          "notes": "Updated client notes"
                        }
                        """))
                .andExpect(status().isOk());

        String createdCaseContent = mockMvc.perform(authenticatedPost("/api/cases", 2L, """
                        {
                          "clientId": %d,
                          "caseNumber": "AUD-2026-001",
                          "caseType": "Civil",
                          "courtName": "Audit Court",
                          "assignedLawyer": "Adv. Review",
                          "judgeName": "Justice Check",
                          "filingDate": "2026-04-20",
                          "firstHearingDate": "2026-04-21",
                          "nextHearingDate": "2026-04-29",
                          "opponentName": "Acme Corp",
                          "opponentLawyer": "Adv. Opponent",
                          "caseDescription": "Audit validation flow",
                          "status": "RUNNING"
                        }
                        """.formatted(clientId)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        JsonNode createdCase = objectMapper.readTree(createdCaseContent);
        Long caseId = createdCase.path("id").asLong();

        String chargedCaseContent = mockMvc.perform(authenticatedPost("/api/cases/" + caseId + "/payments/charges", 2L, """
                        {
                          "label": "Lawyer Fees",
                          "totalAmount": 50000,
                          "paidAmount": 10000,
                          "dueDate": "2026-04-30",
                          "displayOrder": 0,
                          "isLawyerFee": true,
                          "description": "Main fee item"
                        }
                        """))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        JsonNode chargedCase = objectMapper.readTree(chargedCaseContent);
        Long chargeItemId = chargedCase.path("chargeItems").get(0).path("id").asLong();

        mockMvc.perform(authenticatedPost("/api/cases/" + caseId + "/payments/history", 2L, """
                        {
                          "chargeItemId": %d,
                          "amount": 5000,
                          "paymentMode": "UPI",
                          "paymentReference": "AUDIT-UPI-001",
                          "paymentDate": "2026-04-25"
                        }
                        """.formatted(chargeItemId)))
                .andExpect(status().isOk());

        mockMvc.perform(authenticatedPost("/api/cases/" + caseId + "/followups", 2L, """
                        {
                          "type": "HEARING",
                          "title": "Audit Hearing",
                          "scheduledAt": "2026-04-29T10:30:00",
                          "status": "POSTPONED",
                          "notes": "Moved by court",
                          "postponedTo": "2026-05-02T11:00:00"
                        }
                        """))
                .andExpect(status().isOk());

        String documentCaseContent = mockMvc.perform(authenticatedPost("/api/cases/" + caseId + "/documents", 2L, """
                        {
                          "category": "Legal File",
                          "fileName": "audit-filing.pdf",
                          "fileUrl": "https://example.com/audit-filing.pdf",
                          "filePath": "org-2/case-%d/audit-filing.pdf",
                          "fileType": "application/pdf",
                          "fileSize": 1024,
                          "description": "Primary filing copy"
                        }
                        """.formatted(caseId)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        JsonNode hydratedCase = objectMapper.readTree(documentCaseContent);
        assertThat(hydratedCase.path("client").path("name").asText()).isEqualTo("Audit Client Updated");
        assertThat(hydratedCase.path("chargeItems").get(0).path("balanceAmount").decimalValue()).isEqualByComparingTo("35000.00");
        assertThat(hydratedCase.path("paymentHistory").get(0).path("paymentDate").asText()).isEqualTo("2026-04-25");
        assertThat(hydratedCase.path("followUps").get(0).path("status").asText()).isEqualTo("POSTPONED");
        assertThat(hydratedCase.path("documents").get(0).path("description").asText()).isEqualTo("Primary filing copy");
    }

    @Test
    void wizardSaveAcceptsBlankOptionalDatesWhenClientAddsNewRecord() throws Exception {
        String wizardResponse = mockMvc.perform(authenticatedPost("/api/clients/wizard/save", 2L, """
                        {
                          "client": {
                            "name": "Wizard Client",
                            "phone": "9876543211",
                            "altPhone": "",
                            "email": "wizard.client@example.com",
                            "address": "456 Wizard Street",
                            "gender": "",
                            "dateOfBirth": null,
                            "occupation": "",
                            "city": "Mumbai",
                            "state": "Maharashtra",
                            "pinCode": "",
                            "photoUrl": "",
                            "photoPath": "",
                            "idProofType": "",
                            "idProofNumber": "",
                            "idProofFileUrl": "",
                            "idProofFilePath": "",
                            "notes": ""
                          },
                          "caseData": {
                            "clientId": null,
                            "caseNumber": "WIZ-2026-001",
                            "caseType": "Civil",
                            "courtName": "",
                            "assignedLawyer": "",
                            "judgeName": "",
                            "filingDate": null,
                            "firstHearingDate": null,
                            "nextHearingDate": null,
                            "opponentName": "",
                            "opponentLawyer": "",
                            "caseDescription": "",
                            "status": "DRAFT"
                          },
                          "charges": [
                            {
                              "label": "Lawyer Fees",
                              "totalAmount": 25000,
                              "paidAmount": 0,
                              "dueDate": null,
                              "displayOrder": 0,
                              "isLawyerFee": true,
                              "description": ""
                            }
                          ],
                          "followUps": [],
                          "saveAsDraft": false,
                          "currentStep": 3
                        }
                        """))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        JsonNode savedWizard = objectMapper.readTree(wizardResponse);
        assertThat(savedWizard.path("client").path("name").asText()).isEqualTo("Wizard Client");
        assertThat(savedWizard.path("caseData").path("caseNumber").asText()).isEqualTo("WIZ-2026-001");
        assertThat(savedWizard.path("caseData").path("filingDate").isNull()).isTrue();
        assertThat(savedWizard.path("caseData").path("chargeItems").get(0).path("dueDate").isNull()).isTrue();
    }

    @Test
    void wizardSaveReturnsBadRequestForMalformedDatePayloadInsteadOfServerError() throws Exception {
        String response = mockMvc.perform(authenticatedPost("/api/clients/wizard/save", 2L, """
                        {
                          "client": {
                            "name": "Broken Wizard Client",
                            "phone": "9876543222",
                            "altPhone": "",
                            "email": "broken.wizard@example.com",
                            "dateOfBirth": "2026-99-99"
                          },
                          "caseData": {
                            "clientId": null,
                            "caseNumber": "WIZ-2026-002",
                            "caseType": "Civil",
                            "filingDate": "not-a-date"
                          },
                          "charges": [],
                          "followUps": [],
                          "saveAsDraft": false,
                          "currentStep": 3
                        }
                        """))
                .andExpect(status().isBadRequest())
                .andReturn()
                .getResponse()
                .getContentAsString();

        JsonNode errorResponse = objectMapper.readTree(response);
        assertThat(errorResponse.path("error").asText()).isNotBlank();
    }

    private MockHttpServletRequestBuilder authenticatedGet(String path, Long organizationId) {
        String token = jwtUtil.generateToken("demo@lawoffice.local", "LAWYER", organizationId);
        return get(path).header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
    }

    private MockHttpServletRequestBuilder authenticatedPost(String path, Long organizationId, String body) {
        String token = jwtUtil.generateToken("demo@lawoffice.local", "LAWYER", organizationId);
        return post(path)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType("application/json")
                .content(body);
    }

    private MockHttpServletRequestBuilder authenticatedPut(String path, Long organizationId, String body) {
        String token = jwtUtil.generateToken("demo@lawoffice.local", "LAWYER", organizationId);
        return put(path)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType("application/json")
                .content(body);
    }
}
