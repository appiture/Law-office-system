package com.lawoffice.backend.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

@Component
public class AuthenticatedActorResolver {

    private final String fallbackActorEmail;

    public AuthenticatedActorResolver(
            @Value("${app.audit.fallback-email:system@lawoffice.local}") String fallbackActorEmail
    ) {
        this.fallbackActorEmail = fallbackActorEmail;
    }

    public String resolve(Authentication authentication) {
        if (authentication == null
                || authentication instanceof AnonymousAuthenticationToken
                || !authentication.isAuthenticated()) {
            return fallbackActorEmail;
        }

        Object principal = authentication.getPrincipal();

        if (principal instanceof UserDetails userDetails && hasText(userDetails.getUsername())) {
            return userDetails.getUsername();
        }

        if (principal instanceof String principalValue
                && hasText(principalValue)
                && !"anonymousUser".equalsIgnoreCase(principalValue)) {
            return principalValue;
        }

        String name = authentication.getName();
        return hasText(name) && !"anonymousUser".equalsIgnoreCase(name) ? name : fallbackActorEmail;
    }

    public String resolveCurrentActor() {
        return resolve(SecurityContextHolder.getContext().getAuthentication());
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
