package com.lawoffice.backend.scheduler;

import com.lawoffice.backend.model.Client;
import com.lawoffice.backend.model.ClientStatus;
import com.lawoffice.backend.model.Notification;
import com.lawoffice.backend.repository.ClientRepository;
import com.lawoffice.backend.repository.NotificationRepository;
import com.lawoffice.backend.service.EmailService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;

@Component
public class ReminderScheduler {

    private static final Logger logger = Logger.getLogger(ReminderScheduler.class.getName());
    private static final String REMINDER_SUBJECT = "Daily Payment Due Summary";

    private final ClientRepository clientRepository;
    private final NotificationRepository notificationRepository;
    private final EmailService emailService;

    @Value("${app.notification.admin-email:}")
    private String adminEmail;

    @Value("${auth.otp.founder-email:}")
    private String founderEmail;

    public ReminderScheduler(ClientRepository clientRepository,
                             NotificationRepository notificationRepository,
                             EmailService emailService) {
        this.clientRepository = clientRepository;
        this.notificationRepository = notificationRepository;
        this.emailService = emailService;
    }

    @Scheduled(cron = "${app.reminder.daily-cron:0 0 8 * * ?}")
    public void sendDueReminders() {
        LocalDate today = LocalDate.now();
        LocalDate tomorrow = today.plusDays(1);
        List<Client> dueTodayClients = clientRepository.findByDueDateAndStatusNot(today, ClientStatus.PAID);
        List<Client> dueTomorrowClients = clientRepository.findByDueDateAndStatusNot(tomorrow, ClientStatus.PAID);

        if (dueTodayClients.isEmpty() && dueTomorrowClients.isEmpty()) {
            return;
        }

        Set<String> recipients = new LinkedHashSet<>();
        addRecipient(recipients, adminEmail);
        addRecipient(recipients, founderEmail);

        if (recipients.isEmpty()) {
            return;
        }

        String notificationMessage = buildNotificationMessage(dueTodayClients.size(), dueTomorrowClients.size());
        String emailMessage = buildEmailMessage(today, dueTodayClients, dueTomorrowClients);

        for (String recipient : recipients) {
            createNotification(recipient, notificationMessage);

            try {
                emailService.sendEmail(recipient, REMINDER_SUBJECT, emailMessage);
            } catch (Exception ex) {
                logger.log(Level.WARNING, "Failed to send reminder email to " + recipient, ex);
            }
        }
    }

    private String buildNotificationMessage(int dueTodayCount, int dueTomorrowCount) {
        return "Daily reminder summary: "
                + dueTodayCount
                + " due today, "
                + dueTomorrowCount
                + " due tomorrow.";
    }

    private String buildEmailMessage(LocalDate today, List<Client> dueTodayClients, List<Client> dueTomorrowClients) {
        StringBuilder message = new StringBuilder();
        message.append("Daily payment due summary for ").append(today).append(".\n\n");
        appendClientSection(message, "Due Today", dueTodayClients);
        message.append("\n");
        appendClientSection(message, "Due Tomorrow", dueTomorrowClients);
        return message.toString().trim();
    }

    private void appendClientSection(StringBuilder message, String heading, List<Client> clients) {
        message.append(heading).append(":\n");
        if (clients.isEmpty()) {
            message.append("- None\n");
            return;
        }

        for (Client client : clients) {
            message.append("- ")
                    .append(client.getName())
                    .append(" | Due: ")
                    .append(client.getDueDate())
                    .append(" | Balance: ")
                    .append(client.getBalanceAmount())
                    .append("\n");
        }
    }

    private void createNotification(String email, String message) {
        Notification notification = new Notification();
        notification.setUserEmail(email);
        notification.setMessage(message);

        notificationRepository.save(notification);
    }

    private void addRecipient(Set<String> recipients, String email) {
        if (email != null && !email.isBlank()) {
            recipients.add(email.trim());
        }
    }
}
