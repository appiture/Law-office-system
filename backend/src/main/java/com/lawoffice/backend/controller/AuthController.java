package com.lawoffice.backend.controller;

import com.lawoffice.backend.model.LocalUser;
import com.lawoffice.backend.repository.LocalUserRepository;
import com.lawoffice.backend.security.JwtUtil;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.dao.DataAccessException;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger logger = LoggerFactory.getLogger(AuthController.class);

    private final LocalUserRepository localUserRepository;
    private final JwtUtil jwtUtil;

    @Value("${app.dev.mode:false}")
    private boolean devMode;

    @Value("${app.demo.email:demo@lawoffice.local}")
    private String demoEmail;

    @Value("${app.demo.password:demo123}")
    private String demoPassword;

    public AuthController(LocalUserRepository localUserRepository, JwtUtil jwtUtil) {
        this.localUserRepository = localUserRepository;
        this.jwtUtil = jwtUtil;
    }

    @PostMapping("/demo-login")
    public ResponseEntity<?> demoLogin(@Valid @RequestBody DemoLoginRequest request) {
        if (!devMode) {
            logger.warn("Rejected demo-login request because app.dev.mode is disabled");
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Demo login is only available in development mode"));
        }

        String normalizedEmail = request.email().trim().toLowerCase();
        if (!normalizedEmail.equals(demoEmail.trim().toLowerCase())) {
            logger.warn("Rejected demo-login request for non-demo email {}", normalizedEmail);
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only the isolated demo account can use demo login"));
        }

        LocalUser localUser;
        try {
            localUser = localUserRepository.findByEmailIgnoreCase(demoEmail).orElse(null);
        } catch (DataAccessException exception) {
            logger.error("Demo login failed because local_users could not be queried", exception);
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of(
                            "error", "Demo login is not available because the local auth table is missing. Apply the latest Flyway migration and restart the backend."
                    ));
        }

        if (localUser == null) {
            logger.warn("Demo login failed because {} was not found", demoEmail);
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "Demo user not configured. Please run the database setup script."));
        }

        if (!request.password().equals(demoPassword)) {
            logger.warn("Rejected demo-login request because the supplied password did not match the demo account");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid demo credentials"));
        }

        Long orgId = (localUser.getOrganization() != null) ? localUser.getOrganization().getId() : null;
        String organizationName = localUser.getOrganization() != null ? localUser.getOrganization().getName() : "Law Office Demo Workspace";
        boolean isDemoWorkspace = localUser.getOrganization() != null && Boolean.TRUE.equals(localUser.getOrganization().getIsDemo());
        String demoRole = "ADMIN";
        String jwt = jwtUtil.generateToken(localUser.getEmail(), demoRole, orgId, false);
        logger.info("Demo login issued for {} (Org: {})", localUser.getEmail(), orgId);

        return ResponseEntity.ok(Map.of(
                "token", jwt,
                "role", demoRole,
                "email", localUser.getEmail(),
                "organizationId", orgId != null ? orgId : "",
                "orgId", orgId != null ? orgId : "",
                "organizationName", organizationName,
                "isDemoWorkspace", isDemoWorkspace
        ));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(Authentication authentication) {
        if (authentication == null
                || authentication instanceof AnonymousAuthenticationToken
                || !authentication.isAuthenticated()) {
            return ResponseEntity
                    .status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Unauthorized"));
        }

        List<String> authorities = authentication.getAuthorities()
                .stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toList());

        return ResponseEntity.ok(Map.of(
                "principal", authentication.getPrincipal(),
                "authorities", authorities
        ));
    }

    public record DemoLoginRequest(
            @NotBlank @Email String email,
            @NotBlank String password
    ) {
    }
}
