package com.lawoffice.backend.service;

import com.lawoffice.backend.model.User;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Service
public class LoginOtpService {

    private static final int OTP_LENGTH = 6;
    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final long OTP_TTL_MINUTES = 5L;

    private final ConcurrentMap<String, LoginChallenge> challenges = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();

    public OtpChallenge createChallenge(User user) {
        clearExpiredChallenges();

        String challengeId = UUID.randomUUID().toString();
        String otp = generateOtp();
        Instant expiresAt = Instant.now().plus(OTP_TTL_MINUTES, ChronoUnit.MINUTES);

        LoginChallenge challenge = new LoginChallenge(
                user.getEmail(),
                user.getRole(),
                otp,
                expiresAt
        );
        challenges.put(challengeId, challenge);

        return new OtpChallenge(challengeId, otp, expiresAt);
    }

    public Optional<VerifiedLogin> verify(String challengeId, String otp) {
        if (challengeId == null || challengeId.isBlank() || otp == null || otp.isBlank()) {
            return Optional.empty();
        }

        clearExpiredChallenges();

        LoginChallenge challenge = challenges.get(challengeId);
        if (challenge == null) {
            return Optional.empty();
        }

        if (challenge.failedAttempts >= MAX_FAILED_ATTEMPTS) {
            challenges.remove(challengeId);
            return Optional.empty();
        }

        if (!challenge.otp.equals(otp.trim())) {
            challenge.failedAttempts++;
            if (challenge.failedAttempts >= MAX_FAILED_ATTEMPTS) {
                challenges.remove(challengeId);
            }
            return Optional.empty();
        }

        challenges.remove(challengeId);
        return Optional.of(new VerifiedLogin(challenge.email, challenge.role));
    }

    public void discard(String challengeId) {
        if (challengeId == null || challengeId.isBlank()) {
            return;
        }
        challenges.remove(challengeId);
    }

    private void clearExpiredChallenges() {
        Instant now = Instant.now();
        challenges.entrySet().removeIf(entry -> entry.getValue().expiresAt.isBefore(now));
    }

    private String generateOtp() {
        int upperBound = (int) Math.pow(10, OTP_LENGTH);
        int raw = random.nextInt(upperBound);
        return String.format("%0" + OTP_LENGTH + "d", raw);
    }

    public static class OtpChallenge {
        private final String challengeId;
        private final String otp;
        private final Instant expiresAt;

        public OtpChallenge(String challengeId, String otp, Instant expiresAt) {
            this.challengeId = challengeId;
            this.otp = otp;
            this.expiresAt = expiresAt;
        }

        public String getChallengeId() {
            return challengeId;
        }

        public String getOtp() {
            return otp;
        }

        public Instant getExpiresAt() {
            return expiresAt;
        }
    }

    public static class VerifiedLogin {
        private final String email;
        private final String role;

        public VerifiedLogin(String email, String role) {
            this.email = email;
            this.role = role;
        }

        public String getEmail() {
            return email;
        }

        public String getRole() {
            return role;
        }
    }

    private static class LoginChallenge {
        private final String email;
        private final String role;
        private final String otp;
        private final Instant expiresAt;
        private int failedAttempts;

        private LoginChallenge(String email, String role, String otp, Instant expiresAt) {
            this.email = email;
            this.role = role;
            this.otp = otp;
            this.expiresAt = expiresAt;
            this.failedAttempts = 0;
        }
    }
}
