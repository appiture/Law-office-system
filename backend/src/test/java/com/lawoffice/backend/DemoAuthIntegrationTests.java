package com.lawoffice.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "app.dev.mode=true")
@AutoConfigureMockMvc
class DemoAuthIntegrationTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void demoLoginUsesIsolatedDemoWorkspace() throws Exception {
        String content = mockMvc.perform(post("/api/auth/demo-login")
                        .contentType("application/json")
                        .content("""
                                {
                                  "email": "demo@lawoffice.local",
                                  "password": "demo123"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        JsonNode payload = objectMapper.readTree(content);
        assertThat(payload.path("email").asText()).isEqualTo("demo@lawoffice.local");
        assertThat(payload.path("organizationId").asLong()).isEqualTo(2L);
        assertThat(payload.path("organizationName").asText()).isEqualTo("Law Office Demo Workspace");
        assertThat(payload.path("isDemoWorkspace").asBoolean()).isTrue();
        assertThat(payload.path("role").asText()).isEqualTo("ADMIN");
        assertThat(payload.path("token").asText()).isNotBlank();
    }
}
