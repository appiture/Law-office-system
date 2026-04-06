package com.lawoffice.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class BackendApplicationTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private ObjectMapper objectMapper;

	@Test
	void contextLoads() {
	}

	@Test
	void clientsEndpointReturnsSeededClientsWithConsistentFinancials() throws Exception {
		String content = mockMvc.perform(get("/api/clients"))
				.andExpect(status().isOk())
				.andReturn()
				.getResponse()
				.getContentAsString();

		JsonNode clients = objectMapper.readTree(content);

		assertThat(clients).hasSize(6);

		JsonNode rajesh = findClientByName(clients, "Rajesh Kumar");
		assertThat(rajesh.path("status").asText()).isEqualTo("OVERDUE");
		assertThat(rajesh.path("dueDate").asText()).isNotBlank();
		assertThat(sumPayments(rajesh)).isEqualByComparingTo("10000");

		JsonNode suresh = findClientByName(clients, "Suresh Raina");
		assertThat(suresh.path("status").asText()).isEqualTo("PAID");
		assertThat(sumPayments(suresh)).isEqualByComparingTo("35000");

		JsonNode priya = findClientByName(clients, "Priya Sharma");
		assertThat(priya.path("dueDate").asText()).isNotBlank();
		assertThat(sumPayments(priya)).isEqualByComparingTo("5000");
	}

	private JsonNode findClientByName(JsonNode clients, String name) {
		for (JsonNode client : clients) {
			if (name.equals(client.path("name").asText())) {
				return client;
			}
		}
		throw new AssertionError("Client not found: " + name);
	}

	private BigDecimal sumPayments(JsonNode client) {
		BigDecimal sum = BigDecimal.ZERO;
		for (JsonNode payment : client.path("payments")) {
			sum = sum.add(new BigDecimal(payment.path("amount").asText("0")));
		}
		return sum;
	}

}
