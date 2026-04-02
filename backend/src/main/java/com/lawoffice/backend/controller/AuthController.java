package com.lawoffice.backend.controller;

import com.lawoffice.backend.dto.LoginRequest;
import com.lawoffice.backend.dto.OtpVerificationRequest;
import com.lawoffice.backend.model.User;
import com.lawoffice.backend.repository.UserRepository;
import com.lawoffice.backend.security.JwtUtil;
import com.lawoffice.backend.service.EmailService;
import com.lawoffice.backend.service.LoginOtpService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final EmailService emailService;
    private final JwtUtil jwtUtil;
    private final LoginOtpService loginOtpService;
    private final AuthenticationManager authenticationManager;

    @Value("${auth.otp.founder-email:}")
    private String founderEmail;

    @Value("${app.dev.mode:false}")
    private boolean devMode;

    public AuthController(UserRepository userRepository,
                          JwtUtil jwtUtil,
                          EmailService emailService,
                          LoginOtpService loginOtpService,
                          AuthenticationManager authenticationManager) {
        this.userRepository = userRepository;
        this.jwtUtil = jwtUtil;
        this.emailService = emailService;
        this.loginOtpService = loginOtpService;
        this.authenticationManager = authenticationManager;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request) {
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(
                            request.getEmail(),
                            request.getPassword()
                    )
            );
        } catch (Exception e) {
            return ResponseEntity
                    .status(HttpStatus.UNAUTHORIZED)
                    .body("Invalid email or password");
        }

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new IllegalStateException("Authenticated user record is missing"));

        if (devMode) {
            String jwt = jwtUtil.generateToken(user.getEmail(), user.getRole(), request.isRememberMe());

            return ResponseEntity.ok(Map.of(
                    "token", jwt,
                    "role", user.getRole(),
                    "email", user.getEmail()
            ));
        }

        if (founderEmail == null || founderEmail.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "Founder OTP email is not configured"));
        }

        LoginOtpService.OtpChallenge challenge = loginOtpService.createChallenge(user);

        try {
            emailService.sendLoginOtp(founderEmail, challenge.getOtp(), request.getEmail());
        } catch (Exception e) {
            loginOtpService.discard(challenge.getChallengeId());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "Unable to send OTP email"));
        }

        return ResponseEntity.ok(Map.of(
                "challengeId", challenge.getChallengeId(),
                "otpRequired", true,
                "expiresAt", challenge.getExpiresAt().toString(),
                "message", "OTP sent to the configured approver email"
        ));
    }

    @PostMapping("/verify-otp")
    public ResponseEntity<?> verifyOtp(@Valid @RequestBody OtpVerificationRequest request) {
        LoginOtpService.VerifiedLogin verifiedLogin = loginOtpService
                .verify(request.getChallengeId(), request.getOtp())
                .orElse(null);

        if (verifiedLogin == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Invalid or expired OTP"));
        }

        User user = userRepository.findByEmail(verifiedLogin.getEmail())
                .orElseThrow(() -> new IllegalStateException("Verified user record is missing"));

        String jwt = jwtUtil.generateToken(user.getEmail(), user.getRole(), request.isRememberMe());

        return ResponseEntity.ok(Map.of(
                "token", jwt,
                "role", user.getRole(),
                "email", user.getEmail()
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
}
