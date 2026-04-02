package com.lawoffice.backend.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import java.security.SecureRandom;

@Service
public class EmailService {

    @Autowired
    private JavaMailSender mailSender;

    @Value("${mail.from}")
    private String fromEmail;

    private final SecureRandom random = new SecureRandom();

    // Generate 6-digit OTP
    public String generateOtp() {
        return String.format("%06d", random.nextInt(1000000));
    }

    // Generic email sender
    public void sendEmail(String to, String subject, String body) {

        SimpleMailMessage message = new SimpleMailMessage();

        message.setFrom(fromEmail);
        message.setTo(to);
        message.setSubject(subject);
        message.setText(body);

        mailSender.send(message);
    }

    // Send OTP to founder for login approval
    public void sendLoginOtp(String founderEmail, String otp, String userEmail) {

        SimpleMailMessage message = new SimpleMailMessage();

        message.setFrom(fromEmail);
        message.setTo(founderEmail);
        message.setSubject("Law Office Login OTP");

        message.setText(
                "A login attempt was made from: " + userEmail + "\n\n" +
                "Your OTP for approval: " + otp + "\n\n" +
                "This OTP expires in 5 minutes.\n" +
                "Share this OTP with the user to complete login."
        );

        mailSender.send(message);
    }

    // Send email with attachment
    public void sendEmailWithAttachment(String to, String subject, String body, 
                                       byte[] attachmentContent, String attachmentName) throws MessagingException {
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true);

        helper.setFrom(fromEmail);
        helper.setTo(to);
        helper.setSubject(subject);
        helper.setText(body);
        helper.addAttachment(attachmentName, new org.springframework.core.io.ByteArrayResource(attachmentContent));

        mailSender.send(message);
    }
}

