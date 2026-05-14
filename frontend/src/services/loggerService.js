/**
 * Centralized Logger Service
 * 
 * Provides a unified interface for logging across the application.
 * In production, this can be easily integrated with external monitoring
 * like Sentry, Datadog, or an internal observability Edge Function.
 */

import { ErrorCategory, AppError, reportError } from "./apiErrorService";

const isProduction = import.meta.env.PROD;

const logger = {
  /**
   * Log an error with context.
   * If it's not already an AppError, it will be normalized.
   */
  error: (message, error = null, category = ErrorCategory.UNKNOWN) => {
    if (error instanceof AppError) {
      reportError(error);
    } else {
      const appError = new AppError(message, {
        category,
        original: error,
      });
      reportError(appError);
    }

    // Still log to console for development visibility
    if (!isProduction || (error && error.category === ErrorCategory.SERVER)) {
      console.error(`[LOGGER:ERROR] ${message}`, error);
    }
  },

  /**
   * Log informational messages.
   */
  info: (message, data = null) => {
    if (!isProduction) {
      console.info(`[LOGGER:INFO] ${message}`, data || "");
    }
    // Optional: Send to observability service
    // reportObservabilityEvent({ level: 'INFO', message, data });
  },

  /**
   * Log warnings.
   */
  warn: (message, data = null) => {
    console.warn(`[LOGGER:WARN] ${message}`, data || "");
  },

  /**
   * Log debug information.
   */
  debug: (message, data = null) => {
    if (!isProduction) {
      console.debug(`[LOGGER:DEBUG] ${message}`, data || "");
    }
  }
};

export default logger;
