/**
 * GO-LIVE API Error Handling & Monitoring Layer
 *
 * Implements exponential backoff, structured observability,
 * and critical error alerting.
 */

export const ErrorCategory = {
  AUTH: "AUTH",
  PERMISSION: "PERMISSION",
  VALIDATION: "VALIDATION",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  NETWORK: "NETWORK",
  SERVER: "SERVER",
  RATE_LIMIT: "RATE_LIMIT",
  UNKNOWN: "UNKNOWN",
};

export class AppError extends Error {
  constructor(message, { category = ErrorCategory.UNKNOWN, detail = "", original = null } = {}) {
    super(message);
    this.name = "AppError";
    this.category = category;
    this.detail = detail;
    this.original = original;
    this.timestamp = new Date().toISOString();
  }
}

/** 
 * Centralized logging & Alerting 
 * In production, this would integrate with Sentry, Datadog, or New Relic.
 */
const reportError = (error) => {
  const isCritical = 
    error.category === ErrorCategory.SERVER || 
    error.category === ErrorCategory.AUTH ||
    String(error.message).includes("SECURITY_ERROR");

  const logData = {
    message: error.message,
    category: error.category,
    detail: error.detail,
    timestamp: error.timestamp,
    isCritical,
    url: window.location.href,
    userAgent: navigator.userAgent,
  };

  if (isCritical) {
    // [ALERT] Trigger high-priority notification (PagerDuty/Slack via Webhook)
    console.warn("🚨 [CRITICAL ALERT] Reporting to monitoring service:", JSON.stringify(logData));
  } else {
    console.info("📝 [OBSERVABILITY] Logging event:", JSON.stringify(logData));
  }
};

const SUPABASE_CODE_MAP = {
  "22P02": { message: "Invalid data format.", category: ErrorCategory.VALIDATION },
  "23503": { message: "Action restricted: this record is linked to other data.", category: ErrorCategory.CONFLICT },
  "23505": { message: "A record with this information already exists.", category: ErrorCategory.CONFLICT },
  "23514": { message: "Data integrity check failed.", category: ErrorCategory.VALIDATION },
  "42501": { message: "Permission denied.", category: ErrorCategory.PERMISSION },
  PGRST116: { message: "Record not found.", category: ErrorCategory.NOT_FOUND },
};

export const normalizeError = (error, fallbackMessage = "An unexpected error occurred.") => {
  if (error instanceof AppError) return error;

  let normalized;
  const msg = String(error?.message || "").toLowerCase();

  if (msg.includes("rate_limit")) {
    normalized = new AppError("Rate limit exceeded. Please wait.", {
      category: ErrorCategory.RATE_LIMIT,
      detail: error.message,
      original: error,
    });
  } else if (msg.includes("failed to fetch") || msg.includes("networkerror")) {
    normalized = new AppError("Network unavailable. Retrying...", {
      category: ErrorCategory.NETWORK,
      detail: error.message,
      original: error,
    });
  } else if (msg.includes("jwt") || msg.includes("security_error") || error?.status === 401) {
    normalized = new AppError("Authentication failed or session expired.", {
      category: ErrorCategory.AUTH,
      detail: error.message,
      original: error,
    });
  } else {
    const mapped = SUPABASE_CODE_MAP[error?.code];
    normalized = new AppError(mapped?.message || error.message || fallbackMessage, {
      category: mapped?.category || ErrorCategory.UNKNOWN,
      detail: error.details || "",
      original: error,
    });
  }

  reportError(normalized);
  return normalized;
};

/**
 * Executes a function with Exponential Backoff retry logic.
 */
const isRetryableError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0);

  if (status >= 500) return true;
  if (message.includes("failed to fetch") || message.includes("networkerror")) return true;
  if (message.includes("timeout") || message.includes("temporarily unavailable")) return true;
  return false;
};

export const withRetry = async (fn, retries = 2, attempt = 0) => {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0 || !isRetryableError(err)) throw err;

    const delayMs = 1000 * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, delayMs));
    return withRetry(fn, retries - 1, attempt + 1);
  }
};
