package com.lawoffice.backend.controller;

import com.lawoffice.backend.service.PaymentService;
import jakarta.validation.constraints.DecimalMin;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import org.springframework.validation.annotation.Validated;

import java.math.BigDecimal;

@RestController
@RequestMapping("/api/payments")
@Validated
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @PostMapping("/{clientId}")

    public ResponseEntity<?> addPayment(@PathVariable Long clientId,
                                        @RequestParam
                                        @DecimalMin(value = "0.01", message = "Payment amount must be greater than zero")
                                        BigDecimal amount,
                                        @RequestParam(required = false, defaultValue = "Cash")
                                        String paymentMode,
                                        @RequestParam(required = false)
                                        String paymentId) {

        paymentService.addPayment(clientId, amount, paymentMode, paymentId);
        return ResponseEntity.ok(java.util.Map.of("message", "Payment added successfully"));
    }
}
