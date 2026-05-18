/**
 * Standardized Notification Schema for the Law Office System
 */

import { ROUTES, getHearingDetailsRoute } from "../constants/routes";

export const NOTIFICATION_TYPES = {
  // Export System
  EXPORT_READY: "EXPORT_READY",
  EXPORT_FAILED: "EXPORT_FAILED",
  EXPORT_COMPLETED: "EXPORT_COMPLETED",

  // Operations
  HEARING_REMINDER: "HEARING_REMINDER",
  TASK_ASSIGNED: "TASK_ASSIGNED",
  TASK_COMPLETED: "TASK_COMPLETED",
  
  // Finance
  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  PAYMENT_OVERDUE: "PAYMENT_OVERDUE",
  
  // Administrative
  SYSTEM_ANNOUNCEMENT: "SYSTEM_ANNOUNCEMENT",
  USER_INVITED: "USER_INVITED"
};

/**
 * Resolves notification data into displayable components
 * @param {Object} notification 
 * @returns {Object} { title, body, icon, link, color }
 */
export const resolveNotification = (notification) => {
  const { type, message, payload = {} } = notification;

  const defaults = {
    title: "Notification",
    body: message || "You have a new update",
    icon: "bell",
    link: ROUTES.DASHBOARD,
    color: "blue"
  };

  switch (type) {
    case NOTIFICATION_TYPES.EXPORT_READY:
    case NOTIFICATION_TYPES.EXPORT_COMPLETED:
      return {
        ...defaults,
        title: "Report Ready",
        icon: "file-arrow-down",
        link: payload.fileUrl || ROUTES.DOCUMENTS,
        color: "green"
      };

    case NOTIFICATION_TYPES.EXPORT_FAILED:
      return {
        ...defaults,
        title: "Export Error",
        icon: "triangle-exclamation",
        color: "red"
      };

    case NOTIFICATION_TYPES.HEARING_REMINDER:
      return {
        ...defaults,
        title: "Hearing Alert",
        icon: "calendar-clock",
        link: payload.hearingId ? getHearingDetailsRoute(payload.hearingId) : ROUTES.HEARINGS,
        color: "amber"
      };

    case NOTIFICATION_TYPES.TASK_ASSIGNED:
      return {
        ...defaults,
        title: "New Task",
        icon: "list-check",
        link: payload.taskId ? `${ROUTES.TASKS}?id=${payload.taskId}` : ROUTES.TASKS,
        color: "indigo"
      };

    case NOTIFICATION_TYPES.PAYMENT_RECEIVED:
      return {
        ...defaults,
        title: "Payment Confirmed",
        icon: "hand-holding-dollar",
        link: ROUTES.PAYMENTS,
        color: "emerald"
      };

    default:
      return defaults;
  }
};
