package com.lawoffice.backend.service;

import java.math.BigDecimal;
import com.lawoffice.backend.model.Payment;

public interface PaymentService {

    Payment addPayment(Long clientId, BigDecimal amount, String paymentMode, String paymentId);
}
