export const currency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export const textOrDash = (value, fallback = "-") => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

export const sentenceCaseStatus = (value, fallback = "Pending") => {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) {
    return fallback;
  }
  const mapped = normalized === "CANCELLED" ? "POSTPONED" : normalized;
  return mapped
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export const normalizePaymentStatus = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "PAID") return "PAID";
  if (normalized === "PARTIAL") return "PARTIAL";
  if (normalized === "OVERDUE") return "OVERDUE";
  return "PENDING";
};

export const normalizeHearingStatus = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "COMPLETED") return "COMPLETED";
  if (normalized === "POSTPONED" || normalized === "CANCELLED") return "POSTPONED";
  return "PENDING";
};

export const formatDateTime = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const blankToNull = (val) => {
  if (typeof val !== "string") return val;
  return val.trim() === "" ? null : val.trim();
};
