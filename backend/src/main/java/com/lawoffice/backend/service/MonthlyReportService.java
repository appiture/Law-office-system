package com.lawoffice.backend.service;

import com.lawoffice.backend.model.Client;
import com.lawoffice.backend.model.Payment;
import com.lawoffice.backend.repository.ClientRepository;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
public class MonthlyReportService {

    private final ClientRepository clientRepository;

    public MonthlyReportService(ClientRepository clientRepository) {
        this.clientRepository = clientRepository;
    }

    /**
     * Generate monthly report Excel file for the previous month
     */
    public byte[] generateMonthlyReportExcel(YearMonth reportMonth) throws IOException {
        List<Client> allClients = clientRepository.findAll();
        
        // Recalculate status for all clients
        for (Client client : allClients) {
            calculateClientStatus(client);
        }

        // Filter clients with due date in the report month
        List<Client> monthlyClients = allClients.stream()
                .filter(client -> {
                    LocalDate dueDate = client.getDueDate();
                    if (dueDate == null) return false;
                    YearMonth clientMonth = YearMonth.from(dueDate);
                    return clientMonth.equals(reportMonth);
                })
                .collect(Collectors.toList());

        // Get all payments for the report month
        List<Payment> monthlyPayments = allClients.stream()
                .flatMap(client -> {
                    List<Payment> payments = client.getPayments();
                    return payments != null ? payments.stream() : Stream.empty();
                })
                .filter(payment -> {
                    LocalDate paymentDate = payment.getPaymentDate();
                    if (paymentDate == null) return false;
                    YearMonth paymentMonth = YearMonth.from(paymentDate);
                    return paymentMonth.equals(reportMonth);
                })
                .collect(Collectors.toList());

        // Calculate totals
        BigDecimal monthlyTarget = monthlyClients.stream()
                .map(Client::getTotalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal monthlyReceived = monthlyPayments.stream()
                .map(Payment::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal targetAchieved = monthlyTarget.compareTo(BigDecimal.ZERO) > 0
                ? monthlyReceived.multiply(BigDecimal.valueOf(100)).divide(monthlyTarget, 2, java.math.RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            // Create Dashboard Report Sheet
            createDashboardReportSheet(workbook, monthlyClients, monthlyPayments, 
                    monthlyTarget, monthlyReceived, targetAchieved, reportMonth);

            // Create Client Details Sheet
            createClientDetailsSheet(workbook, monthlyClients, reportMonth);

            // Create Payment Updates Sheet
            createPaymentUpdatesSheet(workbook, monthlyPayments, reportMonth);

            // Create Payment History Sheet (all transactions)
            createPaymentHistorySheet(workbook, allClients);

            // Write to byte array
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            workbook.write(outputStream);
            return outputStream.toByteArray();
        }
    }

    private void createDashboardReportSheet(XSSFWorkbook workbook, List<Client> clients,
                                           List<Payment> payments, BigDecimal target,
                                           BigDecimal received, BigDecimal percentage,
                                           YearMonth reportMonth) {
        Sheet sheet = workbook.createSheet("Dashboard Report");
        CellStyle titleStyle = createTitleStyle(workbook);
        CellStyle headerStyle = createHeaderStyle(workbook);
        CellStyle dataStyle = createDataStyle(workbook);
        CellStyle currencyStyle = createCurrencyStyle(workbook);
        CellStyle summaryStyle = createSummaryStyle(workbook);
        CellStyle summaryCurrencyStyle = createSummaryCurrencyStyle(workbook);

        int rowNum = 0;

        // Title
        Row titleRow = sheet.createRow(rowNum++);
        Cell titleCell = titleRow.createCell(0);
        titleCell.setCellValue("Monthly Dashboard Report - " + reportMonth);
        titleCell.setCellStyle(titleStyle);
        sheet.addMergedRegion(new org.apache.poi.ss.util.CellRangeAddress(0, 0, 0, 11));

        rowNum++; // Empty row

        // Summary Section
        Row summaryLabelRow = sheet.createRow(rowNum++);
        Cell summaryLabel1 = summaryLabelRow.createCell(0);
        summaryLabel1.setCellValue("Monthly Target");
        summaryLabel1.setCellStyle(summaryStyle);
        Cell summaryValue1 = summaryLabelRow.createCell(1);
        summaryValue1.setCellValue(target.doubleValue());
        summaryValue1.setCellStyle(summaryCurrencyStyle);

        Row receivedRow = sheet.createRow(rowNum++);
        Cell receivedLabel = receivedRow.createCell(0);
        receivedLabel.setCellValue("Monthly Received");
        receivedLabel.setCellStyle(summaryStyle);
        Cell receivedValue = receivedRow.createCell(1);
        receivedValue.setCellValue(received.doubleValue());
        receivedValue.setCellStyle(summaryCurrencyStyle);

        Row percentRow = sheet.createRow(rowNum++);
        Cell percentLabel = percentRow.createCell(0);
        percentLabel.setCellValue("Target Achieved (%)");
        percentLabel.setCellStyle(summaryStyle);
        Cell percentValue = percentRow.createCell(1);
        percentValue.setCellValue(percentage.doubleValue());
        percentValue.setCellStyle(summaryStyle);

        rowNum++; // Empty row

        // Client Details Header
        Row headerRow = sheet.createRow(rowNum++);
        String[] headers = {"Client Name", "Case Type", "Phone", "Due Date", "Total Amount",
                "Paid Amount", "Balance Amount", "Status", "Follow-up Contacted", "Follow-up Updated By"};
        for (int i = 0; i < headers.length; i++) {
            Cell cell = headerRow.createCell(i);
            cell.setCellValue(headers[i]);
            cell.setCellStyle(headerStyle);
        }

        // Client Data
        for (Client client : clients) {
            Row dataRow = sheet.createRow(rowNum++);
            dataRow.createCell(0).setCellValue(client.getName());
            dataRow.getCell(0).setCellStyle(dataStyle);
            dataRow.createCell(1).setCellValue(client.getCaseType() != null ? client.getCaseType() : "");
            dataRow.getCell(1).setCellStyle(dataStyle);
            dataRow.createCell(2).setCellValue(client.getPhone());
            dataRow.getCell(2).setCellStyle(dataStyle);
            dataRow.createCell(3).setCellValue(client.getDueDate() != null ? client.getDueDate().toString() : "");
            dataRow.getCell(3).setCellStyle(dataStyle);
            Cell totalCell = dataRow.createCell(4);
            totalCell.setCellValue(client.getTotalAmount().doubleValue());
            totalCell.setCellStyle(currencyStyle);
            Cell paidCell = dataRow.createCell(5);
            paidCell.setCellValue(client.getPaidAmount().doubleValue());
            paidCell.setCellStyle(currencyStyle);
            Cell balanceCell = dataRow.createCell(6);
            balanceCell.setCellValue(client.getBalanceAmount().doubleValue());
            balanceCell.setCellStyle(currencyStyle);
            dataRow.createCell(7).setCellValue(client.getStatus().toString());
            dataRow.getCell(7).setCellStyle(dataStyle);
            dataRow.createCell(8).setCellValue(client.getFollowUpContacted() ? "Yes" : "No");
            dataRow.getCell(8).setCellStyle(dataStyle);
            dataRow.createCell(9).setCellValue(client.getFollowUpUpdatedBy() != null ? client.getFollowUpUpdatedBy() : "");
            dataRow.getCell(9).setCellStyle(dataStyle);
        }

        // Auto-size columns
        for (int i = 0; i < headers.length; i++) {
            sheet.autoSizeColumn(i);
        }
    }

    private void createClientDetailsSheet(XSSFWorkbook workbook, List<Client> clients, YearMonth reportMonth) {
        Sheet sheet = workbook.createSheet("Client Details");
        CellStyle titleStyle = createTitleStyle(workbook);
        CellStyle headerStyle = createHeaderStyle(workbook);
        CellStyle dataStyle = createDataStyle(workbook);
        CellStyle currencyStyle = createCurrencyStyle(workbook);

        int rowNum = 0;

        // Title
        Row titleRow = sheet.createRow(rowNum++);
        Cell titleCell = titleRow.createCell(0);
        titleCell.setCellValue("Client Details - " + reportMonth);
        titleCell.setCellStyle(titleStyle);
        sheet.addMergedRegion(new org.apache.poi.ss.util.CellRangeAddress(0, 0, 0, 10));

        rowNum++; // Empty row

        // Headers
        Row headerRow = sheet.createRow(rowNum++);
        String[] headers = {"Name", "Case Type", "Phone", "Due Date", "Total Amount", "Paid Amount",
                "Balance Amount", "Status", "Created By", "Created At", "Remarks"};
        for (int i = 0; i < headers.length; i++) {
            Cell cell = headerRow.createCell(i);
            cell.setCellValue(headers[i]);
            cell.setCellStyle(headerStyle);
        }

        // Data
        for (Client client : clients) {
            Row dataRow = sheet.createRow(rowNum++);
            dataRow.createCell(0).setCellValue(client.getName());
            dataRow.getCell(0).setCellStyle(dataStyle);
            dataRow.createCell(1).setCellValue(client.getCaseType() != null ? client.getCaseType() : "");
            dataRow.getCell(1).setCellStyle(dataStyle);
            dataRow.createCell(2).setCellValue(client.getPhone());
            dataRow.getCell(2).setCellStyle(dataStyle);
            dataRow.createCell(3).setCellValue(client.getDueDate() != null ? client.getDueDate().toString() : "");
            dataRow.getCell(3).setCellStyle(dataStyle);
            Cell totalCell = dataRow.createCell(4);
            totalCell.setCellValue(client.getTotalAmount().doubleValue());
            totalCell.setCellStyle(currencyStyle);
            Cell paidCell = dataRow.createCell(5);
            paidCell.setCellValue(client.getPaidAmount().doubleValue());
            paidCell.setCellStyle(currencyStyle);
            Cell balanceCell = dataRow.createCell(6);
            balanceCell.setCellValue(client.getBalanceAmount().doubleValue());
            balanceCell.setCellStyle(currencyStyle);
            dataRow.createCell(7).setCellValue(client.getStatus().toString());
            dataRow.getCell(7).setCellStyle(dataStyle);
            dataRow.createCell(8).setCellValue(client.getCreatedByName() != null ? client.getCreatedByName() : "");
            dataRow.getCell(8).setCellStyle(dataStyle);
            dataRow.createCell(9).setCellValue(client.getCreatedAt() != null ? client.getCreatedAt().toString() : "");
            dataRow.getCell(9).setCellStyle(dataStyle);
            dataRow.createCell(10).setCellValue(client.getNextDueRemarks() != null ? client.getNextDueRemarks() : "");
            dataRow.getCell(10).setCellStyle(dataStyle);
        }

        // Auto-size columns
        for (int i = 0; i < headers.length; i++) {
            sheet.autoSizeColumn(i);
        }
    }

    private void createPaymentUpdatesSheet(XSSFWorkbook workbook, List<Payment> payments, YearMonth reportMonth) {
        Sheet sheet = workbook.createSheet("Payment Updates");
        CellStyle titleStyle = createTitleStyle(workbook);
        CellStyle headerStyle = createHeaderStyle(workbook);
        CellStyle dataStyle = createDataStyle(workbook);
        CellStyle currencyStyle = createCurrencyStyle(workbook);
        CellStyle summaryStyle = createSummaryStyle(workbook);
        CellStyle summaryCurrencyStyle = createSummaryCurrencyStyle(workbook);

        int[] rowNum = {0}; // Use array to allow modification in lambda

        // Title
        Row titleRow = sheet.createRow(rowNum[0]++);
        Cell titleCell = titleRow.createCell(0);
        titleCell.setCellValue("Common Payment Updates - " + reportMonth);
        titleCell.setCellStyle(titleStyle);
        sheet.addMergedRegion(new org.apache.poi.ss.util.CellRangeAddress(0, 0, 0, 5));

        rowNum[0]++; // Empty row

        // Summary
        BigDecimal totalReceived = payments.stream()
                .map(Payment::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Row summaryRow = sheet.createRow(rowNum[0]++);
        Cell summaryLabel = summaryRow.createCell(0);
        summaryLabel.setCellValue("Total Received");
        summaryLabel.setCellStyle(summaryStyle);
        Cell summaryValue = summaryRow.createCell(1);
        summaryValue.setCellValue(totalReceived.doubleValue());
        summaryValue.setCellStyle(summaryCurrencyStyle);

        rowNum[0]++; // Empty row

        // Headers
        Row headerRow = sheet.createRow(rowNum[0]++);
        String[] headers = {"Client Name", "Amount", "Payment Date", "Updated By", "Updated At", "Payment ID"};
        for (int i = 0; i < headers.length; i++) {
            Cell cell = headerRow.createCell(i);
            cell.setCellValue(headers[i]);
            cell.setCellStyle(headerStyle);
        }

        // Data - sorted by payment date descending
        payments.stream()
                .sorted(Comparator.comparing(Payment::getPaymentDate).reversed())
                .forEach(payment -> {
                    Row dataRow = sheet.createRow(rowNum[0]++);
                    
                    // Get client name
                    String clientName = payment.getClient() != null ? payment.getClient().getName() : "Unknown";
                    
                    dataRow.createCell(0).setCellValue(clientName);
                    dataRow.getCell(0).setCellStyle(dataStyle);
                    Cell amountCell = dataRow.createCell(1);
                    amountCell.setCellValue(payment.getAmount().doubleValue());
                    amountCell.setCellStyle(currencyStyle);
                    dataRow.createCell(2).setCellValue(payment.getPaymentDate() != null ? payment.getPaymentDate().toString() : "");
                    dataRow.getCell(2).setCellStyle(dataStyle);
                    dataRow.createCell(3).setCellValue(payment.getUpdatedBy() != null ? payment.getUpdatedBy() : "");
                    dataRow.getCell(3).setCellStyle(dataStyle);
                    dataRow.createCell(4).setCellValue(payment.getUpdatedAt() != null ? payment.getUpdatedAt().toString() : "");
                    dataRow.getCell(4).setCellStyle(dataStyle);
                    dataRow.createCell(5).setCellValue(payment.getId());
                    dataRow.getCell(5).setCellStyle(dataStyle);
                });

        // Auto-size columns
        for (int i = 0; i < headers.length; i++) {
            sheet.autoSizeColumn(i);
        }
    }

    private void createPaymentHistorySheet(XSSFWorkbook workbook, List<Client> allClients) {
        Sheet sheet = workbook.createSheet("Payment History");
        CellStyle titleStyle = createTitleStyle(workbook);
        CellStyle headerStyle = createHeaderStyle(workbook);
        CellStyle dataStyle = createDataStyle(workbook);
        CellStyle currencyStyle = createCurrencyStyle(workbook);
        CellStyle summaryStyle = createSummaryStyle(workbook);
        CellStyle summaryCurrencyStyle = createSummaryCurrencyStyle(workbook);

        int rowNum = 0;

        // Title
        Row titleRow = sheet.createRow(rowNum++);
        Cell titleCell = titleRow.createCell(0);
        titleCell.setCellValue("Complete Payment History - All Transactions");
        titleCell.setCellStyle(titleStyle);
        sheet.addMergedRegion(new org.apache.poi.ss.util.CellRangeAddress(0, 0, 0, 8));

        rowNum++; // Empty row

        // Summary - Total of all payments
        BigDecimal totalAllPayments = allClients.stream()
                .flatMap(client -> {
                    List<Payment> payments = client.getPayments();
                    return payments != null ? payments.stream() : Stream.empty();
                })
                .map(Payment::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Row summaryRow = sheet.createRow(rowNum++);
        Cell summaryLabel = summaryRow.createCell(0);
        summaryLabel.setCellValue("Total All Payments");
        summaryLabel.setCellStyle(summaryStyle);
        Cell summaryValue = summaryRow.createCell(1);
        summaryValue.setCellValue(totalAllPayments.doubleValue());
        summaryValue.setCellStyle(summaryCurrencyStyle);

        rowNum++; // Empty row

        // Headers
        Row headerRow = sheet.createRow(rowNum++);
        String[] headers = {"Client Name", "Case Type", "Phone", "Amount", "Payment Date", 
                "Updated By", "Updated At", "Payment ID", "Client Status"};
        for (int i = 0; i < headers.length; i++) {
            Cell cell = headerRow.createCell(i);
            cell.setCellValue(headers[i]);
            cell.setCellStyle(headerStyle);
        }

        // Collect all payments from all clients
        List<PaymentRecord> allPaymentRecords = new ArrayList<>();
        for (Client client : allClients) {
            List<Payment> payments = client.getPayments();
            if (payments != null) {
                for (Payment payment : payments) {
                    allPaymentRecords.add(new PaymentRecord(
                            client.getName(),
                            client.getCaseType(),
                            client.getPhone(),
                            payment.getAmount(),
                            payment.getPaymentDate(),
                            payment.getUpdatedBy(),
                            payment.getUpdatedAt(),
                            payment.getId(),
                            client.getStatus().toString()
                    ));
                }
            }
        }

        // Sort by payment date descending
        allPaymentRecords.sort((a, b) -> {
            if (a.paymentDate == null && b.paymentDate == null) return 0;
            if (a.paymentDate == null) return 1;
            if (b.paymentDate == null) return -1;
            return b.paymentDate.compareTo(a.paymentDate);
        });

        // Add data rows
        for (PaymentRecord record : allPaymentRecords) {
            Row dataRow = sheet.createRow(rowNum++);
            dataRow.createCell(0).setCellValue(record.clientName);
            dataRow.getCell(0).setCellStyle(dataStyle);
            dataRow.createCell(1).setCellValue(record.caseType != null ? record.caseType : "");
            dataRow.getCell(1).setCellStyle(dataStyle);
            dataRow.createCell(2).setCellValue(record.phone);
            dataRow.getCell(2).setCellStyle(dataStyle);
            Cell amountCell = dataRow.createCell(3);
            amountCell.setCellValue(record.amount.doubleValue());
            amountCell.setCellStyle(currencyStyle);
            dataRow.createCell(4).setCellValue(record.paymentDate != null ? record.paymentDate.toString() : "");
            dataRow.getCell(4).setCellStyle(dataStyle);
            dataRow.createCell(5).setCellValue(record.updatedBy != null ? record.updatedBy : "");
            dataRow.getCell(5).setCellStyle(dataStyle);
            dataRow.createCell(6).setCellValue(record.updatedAt != null ? record.updatedAt.toString() : "");
            dataRow.getCell(6).setCellStyle(dataStyle);
            dataRow.createCell(7).setCellValue(record.paymentId);
            dataRow.getCell(7).setCellStyle(dataStyle);
            dataRow.createCell(8).setCellValue(record.clientStatus);
            dataRow.getCell(8).setCellStyle(dataStyle);
        }

        // Auto-size columns
        for (int i = 0; i < headers.length; i++) {
            sheet.autoSizeColumn(i);
        }
    }

    private CellStyle createHeaderStyle(XSSFWorkbook workbook) {
        CellStyle style = workbook.createCellStyle();
        Font font = workbook.createFont();
        font.setBold(true);
        font.setColor(IndexedColors.WHITE.getIndex());
        font.setFontHeightInPoints((short) 12);
        style.setFont(font);
        style.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
        return style;
    }

    private CellStyle createDataStyle(XSSFWorkbook workbook) {
        CellStyle style = workbook.createCellStyle();
        style.setAlignment(HorizontalAlignment.LEFT);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
        return style;
    }

    private CellStyle createCurrencyStyle(XSSFWorkbook workbook) {
        CellStyle style = workbook.createCellStyle();
        style.setDataFormat(workbook.createDataFormat().getFormat("#,##0.00"));
        style.setAlignment(HorizontalAlignment.RIGHT);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
        return style;
    }

    private CellStyle createSummaryStyle(XSSFWorkbook workbook) {
        CellStyle style = workbook.createCellStyle();
        Font font = workbook.createFont();
        font.setBold(true);
        font.setFontHeightInPoints((short) 11);
        style.setFont(font);
        style.setFillForegroundColor(IndexedColors.LIGHT_BLUE.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.LEFT);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
        return style;
    }

    private CellStyle createSummaryCurrencyStyle(XSSFWorkbook workbook) {
        CellStyle style = workbook.createCellStyle();
        Font font = workbook.createFont();
        font.setBold(true);
        font.setFontHeightInPoints((short) 11);
        style.setFont(font);
        style.setFillForegroundColor(IndexedColors.LIGHT_BLUE.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setDataFormat(workbook.createDataFormat().getFormat("#,##0.00"));
        style.setAlignment(HorizontalAlignment.RIGHT);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
        return style;
    }

    private CellStyle createTitleStyle(XSSFWorkbook workbook) {
        CellStyle style = workbook.createCellStyle();
        Font font = workbook.createFont();
        font.setBold(true);
        font.setFontHeightInPoints((short) 14);
        font.setColor(IndexedColors.WHITE.getIndex());
        style.setFont(font);
        style.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
        return style;
    }

    private void calculateClientStatus(Client client) {
        if (client.getTotalAmount() == null) {
            client.setTotalAmount(BigDecimal.ZERO);
        }
        if (client.getPaidAmount() == null) {
            client.setPaidAmount(BigDecimal.ZERO);
        }
        
        BigDecimal balance = client.getTotalAmount().subtract(client.getPaidAmount());
        if (balance.compareTo(BigDecimal.ZERO) < 0) {
            balance = BigDecimal.ZERO;
        }
        client.setBalanceAmount(balance);
    }

    // Inner class to hold payment record data
    private static class PaymentRecord {
        String clientName;
        String caseType;
        String phone;
        BigDecimal amount;
        LocalDate paymentDate;
        String updatedBy;
        java.time.LocalDateTime updatedAt;
        Long paymentId;
        String clientStatus;

        PaymentRecord(String clientName, String caseType, String phone, BigDecimal amount,
                     LocalDate paymentDate, String updatedBy, java.time.LocalDateTime updatedAt,
                     Long paymentId, String clientStatus) {
            this.clientName = clientName;
            this.caseType = caseType;
            this.phone = phone;
            this.amount = amount;
            this.paymentDate = paymentDate;
            this.updatedBy = updatedBy;
            this.updatedAt = updatedAt;
            this.paymentId = paymentId;
            this.clientStatus = clientStatus;
        }
    }
}
