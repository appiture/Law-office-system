/**
 * statuses.js
 * 
 * Centralized status constants for consistency across the application.
 */

export const CASE_STATUS = {
  DRAFT: "DRAFT",
  RUNNING: "RUNNING",
  PENDING: "PENDING",
  WAITING: "WAITING",
  CLOSED_WON: "CLOSED_WON",
  CLOSED_LOST: "CLOSED_LOST",
  CLOSED: "CLOSED",
  ON_HOLD: "ON_HOLD",
  OPEN: "OPEN", // For legacy/general use
};

export const HEARING_STATUS = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  POSTPONED: "POSTPONED",
  CANCELLED: "CANCELLED",
};

export const TASK_STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

export const PAYMENT_STATUS = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  PAID: "PAID",
  PARTIAL: "PARTIAL",
  OVERDUE: "OVERDUE",
};

export const TEAM_STATUS = {
  ACTIVE: "ACTIVE",
  PENDING: "PENDING",
  INACTIVE: "INACTIVE",
};
