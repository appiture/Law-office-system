package com.lawoffice.backend.scheduler;

import com.lawoffice.backend.service.EmailService;
import com.lawoffice.backend.service.MonthlyReportService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import jakarta.mail.MessagingException;
import java.io.IOException;
import java.time.YearMonth;
import java.util.logging.Level;
import java.util.logging.Logger;

@Component
public class MonthlyReportScheduler {

    private static final Logger logger = Logger.getLogger(MonthlyReportScheduler.class.getName());

    private final MonthlyReportService monthlyReportService;
    private final EmailService emailService;

    @Value("${auth.otp.founder-email:}")
    private String founderEmail;

    public MonthlyReportScheduler(MonthlyReportService monthlyReportService,
                                  EmailService emailService) {
        this.monthlyReportService = monthlyReportService;
        this.emailService = emailService;
    }

    /**
     * Runs on the 1st of every month at 8:00 AM
     * Sends the previous month's report to the founder
     */
    @Scheduled(cron = "0 0 8 1 * ?")
    public void sendMonthlyReport() {
        try {
            if (founderEmail == null || founderEmail.isBlank()) {
                logger.warning("Skipping monthly report email because founder email is not configured");
                return;
            }

            logger.info("Starting monthly report generation and email...");

            // Get previous month
            YearMonth previousMonth = YearMonth.now().minusMonths(1);

            // Generate Excel report
            byte[] reportContent = monthlyReportService.generateMonthlyReportExcel(previousMonth);

            // Prepare email
            String subject = "Monthly Report - " + previousMonth;
            String body = "Dear Founder,\n\n" +
                    "Please find attached the monthly report for " + previousMonth + ".\n\n" +
                    "The report includes:\n" +
                    "1. Dashboard Report - Summary of monthly targets, received amounts, and client details\n" +
                    "2. Client Details - Detailed information of all clients with due dates in the month\n" +
                    "3. Payment Updates - All payments received during the month\n\n" +
                    "Best regards,\n" +
                    "Law Office System";

            String fileName = "monthly-report-" + previousMonth + ".xlsx";

            // Send email with attachment
            emailService.sendEmailWithAttachment(founderEmail, subject, body, reportContent, fileName);

            logger.info("Monthly report sent successfully to: " + founderEmail);

        } catch (IOException e) {
            logger.log(Level.SEVERE, "Error generating monthly report Excel file", e);
        } catch (MessagingException e) {
            logger.log(Level.SEVERE, "Error sending monthly report email", e);
        } catch (Exception e) {
            logger.log(Level.SEVERE, "Unexpected error in monthly report scheduler", e);
        }
    }
}
