package com.lawoffice.backend.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;

@Component
public class JwtUtil {

    private static final Logger logger = LoggerFactory.getLogger(JwtUtil.class);

    // ================= CONFIG VALUES =================

    @Value("${jwt.secret:DEFAULT_SECRET_CHANGE_THIS}")
    private String secret;

    @Value("${jwt.expiration:86400000}")
    private long expirationTime;

    @Value("${jwt.remember-expiration:2592000000}")
    private long rememberExpirationTime;

    private SecretKey key;

    // ================= INITIALIZATION =================

    @PostConstruct
    public void init() {
        if (secret == null || secret.isBlank()) {
            byte[] generatedSecret = new byte[64];
            new SecureRandom().nextBytes(generatedSecret);
            this.key = Keys.hmacShaKeyFor(generatedSecret);
            logger.warn("JWT_SECRET is not set. Generated an ephemeral in-memory JWT secret for this process only. Tokens will be invalid after restart. Set JWT_SECRET for production.");
            return;
        }

        if (secret.length() < 32) {
            throw new IllegalArgumentException("JWT secret must be at least 32 characters long");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    // ================= TOKEN GENERATION =================

    public String generateToken(String email, String role, Long orgId) {
        return generateToken(email, role, orgId, false);
    }

    public String generateToken(String email, String role, Long orgId, boolean rememberMe) {
        String normalizedRole = normalizeRole(role);
        long tokenLifetime = rememberMe && rememberExpirationTime > 0
                ? rememberExpirationTime
                : expirationTime;

        return Jwts.builder()
                .subject(email)
                .claim("role", normalizedRole)
                .claim("orgId", orgId)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + tokenLifetime))
                .signWith(key)
                .compact();
    }

    // ================= TOKEN VALIDATION =================

    public boolean validateToken(String token) {
        try {
            extractAllClaims(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // ================= CLAIM EXTRACTION =================

    public String extractEmail(String token) {
        return extractAllClaims(token).getSubject();
    }

    public String extractRole(String token) {
        return normalizeRole(
                extractAllClaims(token).get("role", String.class)
        );
    }

    public Long extractOrganizationId(String token) {
        Object orgId = extractAllClaims(token).get("orgId");
        if (orgId instanceof Number) {
            return ((Number) orgId).longValue();
        }
        return null;
    }

    // ================= AUTHORITIES =================

    public List<SimpleGrantedAuthority> getAuthorities(String role) {
        String normalizedRole = normalizeRole(role);
        if (normalizedRole.isEmpty()) {
            return Collections.emptyList();
        }
        return Collections.singletonList(
                new SimpleGrantedAuthority("ROLE_" + normalizedRole)
        );
    }

    // ================= INTERNAL METHODS =================

    private Claims extractAllClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private String normalizeRole(String role) {
        if (role == null) {
            return "";
        }
        String normalized = role.trim().toUpperCase(Locale.ROOT);
        if (normalized.startsWith("ROLE_")) {
            return normalized.substring(5);
        }
        return normalized;
    }
}
