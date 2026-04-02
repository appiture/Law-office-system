
package com.lawoffice.backend.controller;

import com.lawoffice.backend.service.EmailService;
import com.lawoffice.backend.service.MonthlyReportService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import org.springframework.web.bind.annotation.*;

import jakarta.mail.MessagingException;
import java.io.IOException;
import java.time.YearMonth;

@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final MonthlyReportService monthlyReportService;
    private final EmailService emailService;

    @Value("${auth.otp.founder-email:}")
    private String founderEmail;

    public ReportController(MonthlyReportService monthlyReportService,
                           EmailService emailService) {
        this.monthlyReportService = monthlyReportService;
        this.emailService = emailService;
    }

    /**
     * Download monthly report for a specific month
     * Format: YYYY-MM (e.g., 2024-01)
     */
    @GetMapping("/monthly/{yearMonth}")

    public ResponseEntity<byte[]> downloadMonthlyReport(@PathVariable String yearMonth) {
        try {
            YearMonth month = YearMonth.parse(yearMonth);
            byte[] reportContent = monthlyReportService.generateMonthlyReportExcel(month);

            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, 
                            "attachment; filename=\"monthly-report-" + yearMonth + ".xlsx\"")
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .body(reportContent);
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Send monthly report to founder email
     * Format: YYYY-MM (e.g., 2024-01)
     */
    @PostMapping("/monthly/{yearMonth}/send")

    public ResponseEntity<String> sendMonthlyReportEmail(@PathVariable String yearMonth) {
        if (founderEmail == null || founderEmail.isBlank()) {
            return ResponseEntity.status(503).body("Founder report email is not configured");
        }

        try {
            YearMonth month = YearMonth.parse(yearMonth);
            byte[] reportContent = monthlyReportService.generateMonthlyReportExcel(month);

            String subject = "Monthly Report - " + month;
            String body = "Dear Founder,\n\n" +
                    "Please find attached the monthly report for " + month + ".\n\n" +
                    "The report includes:\n" +
                    "1. Dashboard Report - Summary of monthly targets, received amounts, and client details\n" +
                    "2. Client Details - Detailed information of all clients with due dates in the month\n" +
                    "3. Payment Updates - All payments received during the month\n\n" +
                    "Best regards,\n" +
                    "Law Office System";

            String fileName = "monthly-report-" + month + ".xlsx";

            emailService.sendEmailWithAttachment(founderEmail, subject, body, reportContent, fileName);

            return ResponseEntity.ok("Report sent successfully to " + founderEmail);
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("Error generating report");
        } catch (MessagingException e) {
            return ResponseEntity.internalServerError().body("Error sending email");
        }
    }
}
