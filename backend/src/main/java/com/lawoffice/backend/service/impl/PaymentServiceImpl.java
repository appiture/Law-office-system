package com.lawoffice.backend.service.impl;

import com.lawoffice.backend.model.Client;
import com.lawoffice.backend.model.Payment;
import com.lawoffice.backend.repository.ClientRepository;
import com.lawoffice.backend.repository.PaymentRepository;
import com.lawoffice.backend.service.PaymentService;

import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Service
public class PaymentServiceImpl implements PaymentService {

    private final PaymentRepository paymentRepository;
    private final ClientRepository clientRepository;

    public PaymentServiceImpl(PaymentRepository paymentRepository,
                              ClientRepository clientRepository) {
        this.paymentRepository = paymentRepository;
        this.clientRepository = clientRepository;
    }

    @Override
    public Payment addPayment(Long clientId, BigDecimal amount, String paymentMode, String paymentId) {

        Client client = clientRepository.findById(clientId)
                .orElseThrow(() -> new EntityNotFoundException("Client not found"));
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Payment amount must be greater than zero");
        }

        BigDecimal paid = client.getPaidAmount() == null ? BigDecimal.ZERO : client.getPaidAmount();
        BigDecimal total = client.getTotalAmount() == null ? BigDecimal.ZERO : client.getTotalAmount();
        BigDecimal balance = client.getBalanceAmount() == null ? total.subtract(paid) : client.getBalanceAmount();
        if (amount.compareTo(balance) > 0) {
            throw new IllegalArgumentException("Payment amount cannot exceed balance amount");
        }

        String actor = "founder@lawoffice.com";

        Payment payment = new Payment();
        payment.setClient(client);
        payment.setAmount(amount);
        payment.setPaymentMode(paymentMode);
        payment.setPaymentId(paymentId);
        payment.setPaymentDate(LocalDate.now());

        payment.setUpdatedAt(LocalDateTime.now());
        payment.setUpdatedBy(actor);

        paymentRepository.save(payment);
        client.setPaidAmount(paid.add(amount));
        client.setBalanceAmount(total.subtract(client.getPaidAmount()));
        if (client.getBalanceAmount().compareTo(BigDecimal.ZERO) <= 0) {
            client.setDueDate(null);
            client.setNextDueDate(null);
        }

        clientRepository.save(client);

        return payment;
    }
}
