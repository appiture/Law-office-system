package com.lawoffice.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import com.lawoffice.backend.security.JwtUtil;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class BackendApplicationTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private ObjectMapper objectMapper;

	@Autowired
	private JwtUtil jwtUtil;

	@Test
	void contextLoads() {
	}

	@Test
	void clientsEndpointReturnsCaseSummaries() throws Exception {
		String content = mockMvc.perform(authenticatedGet("/api/clients", 2L))
				.andExpect(status().isOk())
				.andReturn()
				.getResponse()
				.getContentAsString();

		JsonNode clients = objectMapper.readTree(content);

		assertThat(clients).hasSize(3);

		JsonNode rajesh = findClientByName(clients, "Rajesh Kumar");
		assertThat(rajesh).isNotNull();
		assertThat(rajesh.path("cases")).hasSize(1);
		assertThat(rajesh.path("cases").get(0).path("caseNumber").asText()).isEqualTo("LAW-CR-2026-001");
		assertThat(rajesh.path("cases").get(0).path("balanceAmount").decimalValue()).isEqualByComparingTo("40000.00");

		JsonNode suresh = findClientByName(clients, "Suresh Raina");
		assertThat(suresh).isNotNull();
		assertThat(suresh.path("cases").get(0).path("paidAmount").decimalValue()).isEqualByComparingTo("35000.00");
	}

	@Test
	void caseDetailsEndpointReturnsUnifiedCaseView() throws Exception {
		String content = mockMvc.perform(authenticatedGet("/api/cases/1", 2L))
				.andExpect(status().isOk())
				.andReturn()
				.getResponse()
				.getContentAsString();

		JsonNode legalCase = objectMapper.readTree(content);
		assertThat(legalCase.path("caseNumber").asText()).isEqualTo("LAW-CR-2026-001");
		assertThat(legalCase.path("client").path("name").asText()).isEqualTo("Rajesh Kumar");
		assertThat(legalCase.path("chargeItems")).hasSize(2);
		assertThat(legalCase.path("paymentHistory")).hasSize(2);
		assertThat(legalCase.path("documents")).hasSize(2);
		assertThat(legalCase.path("followUps")).hasSize(2);
		assertThat(legalCase.path("balanceAmount").decimalValue()).isEqualByComparingTo("40000.00");
	}

	@Test
	void dashboardSummaryExposesAlertsAndCharts() throws Exception {
		String content = mockMvc.perform(authenticatedGet("/api/dashboard/summary", 2L))
				.andExpect(status().isOk())
				.andReturn()
				.getResponse()
				.getContentAsString();

		JsonNode summary = objectMapper.readTree(content);
		assertThat(summary.path("totalClients").asLong()).isEqualTo(3);
		assertThat(summary.path("totalCases").asLong()).isEqualTo(3);
		assertThat(summary.path("overdueAlerts").isArray()).isTrue();
		assertThat(summary.path("caseDistribution").isArray()).isTrue();
		assertThat(summary.path("todayHearings").isArray()).isTrue();
	}

	@Test
	void legacySupportEndpointsReturnData() throws Exception {
		String contactsContent = mockMvc.perform(authenticatedGet("/api/contacts", 2L))
				.andExpect(status().isOk())
				.andReturn()
				.getResponse()
				.getContentAsString();
		JsonNode contacts = objectMapper.readTree(contactsContent);
		assertThat(contacts.isArray()).isTrue();
		assertThat(contacts.size()).isGreaterThanOrEqualTo(1);

		String lobbyingContent = mockMvc.perform(authenticatedGet("/api/lobbying-records", 2L))
				.andExpect(status().isOk())
				.andReturn()
				.getResponse()
				.getContentAsString();
		JsonNode lobbyingRecords = objectMapper.readTree(lobbyingContent);
		assertThat(lobbyingRecords.isArray()).isTrue();
		assertThat(lobbyingRecords.size()).isGreaterThanOrEqualTo(1);

		String putUpDatesContent = mockMvc.perform(authenticatedGet("/api/put-up-dates", 2L))
				.andExpect(status().isOk())
				.andReturn()
				.getResponse()
				.getContentAsString();
		JsonNode putUpDates = objectMapper.readTree(putUpDatesContent);
		assertThat(putUpDates.isArray()).isTrue();
		assertThat(putUpDates.size()).isGreaterThanOrEqualTo(1);

		String tasksContent = mockMvc.perform(authenticatedGet("/api/tasks", 2L))
				.andExpect(status().isOk())
				.andReturn()
				.getResponse()
				.getContentAsString();
		JsonNode tasks = objectMapper.readTree(tasksContent);
		assertThat(tasks.isArray()).isTrue();
		assertThat(tasks.size()).isGreaterThanOrEqualTo(1);
	}

	@Test
	void demoLoginIsForbiddenOutsideDevMode() throws Exception {
		mockMvc.perform(post("/api/auth/demo-login")
						.contentType("application/json")
						.content("""
								{
								  "email": "demo@lawoffice.local",
								  "password": "demo123"
								}
								"""))
				.andExpect(status().isForbidden());
	}

	@Test
	void organizationsCannotSeeEachOthersClientData() throws Exception {
		String createdClient = mockMvc.perform(
						authenticatedPost("/api/clients", 1L, """
								{
								  "name": "Org One Client",
								  "phone": "9999988888",
								  "email": "orgone@example.com",
								  "address": "Kolkata"
								}
								"""))
				.andExpect(status().isOk())
				.andReturn()
				.getResponse()
				.getContentAsString();

		JsonNode orgOneClient = objectMapper.readTree(createdClient);
		assertThat(orgOneClient.path("name").asText()).isEqualTo("Org One Client");

		String orgOneContent = mockMvc.perform(authenticatedGet("/api/clients", 1L))
				.andExpect(status().isOk())
				.andReturn()
				.getResponse()
				.getContentAsString();
		JsonNode orgOneClients = objectMapper.readTree(orgOneContent);
		assertThat(findClientByName(orgOneClients, "Org One Client")).isNotNull();

		String demoOrgContent = mockMvc.perform(authenticatedGet("/api/clients", 2L))
				.andExpect(status().isOk())
				.andReturn()
				.getResponse()
				.getContentAsString();
		JsonNode demoOrgClients = objectMapper.readTree(demoOrgContent);
		assertThat(hasClientNamed(demoOrgClients, "Org One Client")).isFalse();

		mockMvc.perform(authenticatedGet("/api/cases/1", 1L))
				.andExpect(status().isNotFound());
	}

	@Test
	void validationBlocksInvalidClientPhoneNumbers() throws Exception {
		mockMvc.perform(
						authenticatedPost("/api/clients", 2L, """
								{
								  "name": "Broken Client",
								  "phone": "12345",
								  "email": "broken@example.com"
								}
								"""))
				.andExpect(status().isBadRequest());
	}

	private JsonNode findClientByName(JsonNode clients, String name) {
		for (JsonNode client : clients) {
			if (name.equals(client.path("name").asText())) {
				return client;
			}
		}
		return null;
	}

	private boolean hasClientNamed(JsonNode clients, String name) {
		return findClientByName(clients, name) != null;
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

}
