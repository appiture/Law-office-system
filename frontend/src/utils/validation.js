import { normalizeHearingStatus, normalizePaymentStatus } from "../utils/formatters";

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export const normalizeDigits = (value, maxLength = 10) =>
  String(value || "")
    .replace(/\D/g, "")
    .slice(0, maxLength);

export const isTenDigitPhone = (value) => /^\d{10}$/.test(String(value || "").trim());

export const isValidEmail = (value) => {
  const normalized = String(value || "").trim();
  return !normalized || EMAIL_REGEX.test(normalized);
};

export const requiredText = (value) => String(value || "").trim();

export { normalizeHearingStatus, normalizePaymentStatus };

export const splitOtherSelection = (value, options, otherOption = "Other") => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return { selected: "", custom: "" };
  }

  const matchedOption = options.find(
    (option) => String(option).trim().toLowerCase() === normalized.toLowerCase()
  );

  if (matchedOption && String(matchedOption).trim().toLowerCase() !== otherOption.toLowerCase()) {
    return { selected: matchedOption, custom: "" };
  }

  return {
    selected: otherOption,
    custom: matchedOption ? "" : normalized,
  };
};

export const resolveOtherSelection = (selectedValue, customValue, otherOption = "Other") => {
  const normalizedSelected = String(selectedValue || "").trim();
  if (!normalizedSelected) {
    return "";
  }

  if (normalizedSelected.toLowerCase() !== otherOption.toLowerCase()) {
    return normalizedSelected;
  }

  return String(customValue || "").trim();
};

export const getApiErrorMessage = (error, fallback = "Request failed.") => {
  const data = error?.response?.data;
  if (data?.details && typeof data.details === "object") {
    return Object.values(data.details).join("; ");
  }
  if (Array.isArray(data?.errors)) {
    return data.errors.map((item) => item?.defaultMessage || item?.message).filter(Boolean).join("; ");
  }
  if (data?.error) {
    return data.error;
  }
  if (data?.message) {
    return data.message;
  }
  return error?.message || fallback;
};

export const assertClientPayload = (payload) => {
  if (!requiredText(payload.client_name)) {
    throw new Error("Client name is required.");
  }
  if (!isTenDigitPhone(payload.phone)) {
    throw new Error("Primary phone number must be exactly 10 digits.");
  }
  if (!isValidEmail(payload.email)) {
    throw new Error("Email address is not valid.");
  }
};

export const assertCasePayload = (payload) => {
  if (!payload?.clientId) {
    throw new Error("A client must be selected.");
  }
  if (!requiredText(payload.caseNumber)) {
    throw new Error("Case number is required.");
  }
  if (!requiredText(payload.case_title)) {
    throw new Error("Case title is required.");
  }
};

export const assertChargePayload = (payload) => {
  if (!requiredText(payload.label)) {
    throw new Error("Fee category label is required.");
  }
  const totalAmount = Number(payload.totalAmount || 0);
  const paidAmount = Number(payload.paidAmount || 0);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error("Total amount must be greater than zero.");
  }
  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    throw new Error("Paid amount cannot be negative.");
  }
  if (paidAmount > totalAmount) {
    throw new Error("Paid amount cannot exceed the total amount.");
  }
  if (payload.description && String(payload.description).trim().length > 500) {
    throw new Error("Fee description must be 500 characters or less.");
  }
};

export const assertPaymentPayload = (payload, balanceAmount) => {
  if (!payload?.chargeItemId) {
    throw new Error("A fee category must be selected.");
  }
  const amount = Number(payload.amount || 0);
  const remainingBalance = Number(balanceAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }
  if (!Number.isFinite(remainingBalance)) {
    throw new Error("Remaining balance is unavailable. Please reselect the fee category.");
  }
  if (amount > remainingBalance) {
    throw new Error("Payment amount cannot exceed the remaining balance.");
  }
  if (!requiredText(payload.paymentMode)) {
    throw new Error("Payment mode is required.");
  }
  if (payload.paymentReference && String(payload.paymentReference).trim().length > 120) {
    throw new Error("Payment reference must be 120 characters or less.");
  }
};

export const assertDocumentPayload = (payload) => {
  if (!requiredText(payload.category)) {
    throw new Error("Document category is required.");
  }
  if (!requiredText(payload.fileName)) {
    throw new Error("Document title is required.");
  }
  if (!requiredText(payload.filePath) && !requiredText(payload.fileUrl)) {
    throw new Error("A stored document path or URL is required.");
  }
  if (payload.description && String(payload.description).trim().length > 2000) {
    throw new Error("Document description must be 2000 characters or less.");
  }
};

export const assertHearingPayload = (payload) => {
  if (!requiredText(payload.type)) {
    throw new Error("Event type is required.");
  }
  if (!requiredText(payload.case_title)) {
    throw new Error("Event title is required.");
  }
  if (!requiredText(payload.hearing_date)) {
    throw new Error("Scheduled date and time is required.");
  }
  if (normalizeHearingStatus(payload.status) === "POSTPONED" && !requiredText(payload.postponedTo)) {
    throw new Error("A postponed event must include the new date and time.");
  }
};




