import { ROUTES } from '../constants/routes';

/**
 * Navigation Helper for Universal Deep Linking
 * Centralizes all routing logic for notifications and entity access
 */

export const getEntityUrl = (entityType, entityId) => {
  if (!entityId) return ROUTES.DASHBOARD;

  switch (entityType?.toLowerCase()) {
    case 'client':
      return `${ROUTES.CLIENTS}/${entityId}`;
    case 'case':
      return `${ROUTES.CASES}/${entityId}`;
    case 'hearing':
    case 'deadline':
      return `${ROUTES.HEARINGS}/${entityId}`;
    case 'payment':
      return `${ROUTES.PAYMENTS}?searchId=${entityId}`;
    case 'task':
      return `${ROUTES.TASKS}?focus=${entityId}`;
    case 'document':
      return `${ROUTES.DOCUMENTS}?focus=${entityId}`;
    default:
      return ROUTES.DASHBOARD;
  }
};

/**
 * Maps notification types to correct platform routes
 */
export const getNotificationRedirect = (notification) => {
  if (!notification) return ROUTES.DASHBOARD;
  
  const type = (notification.entityType || "").toUpperCase();
  const id = notification.entityId;

  switch (type) {
    case "HEARING":
      return `${ROUTES.HEARINGS}/${id || ""}`;
    case "TASK":
      return `${ROUTES.TASKS}/${id || ""}`;
    case "PAYMENT":
      return `${ROUTES.PAYMENTS}/${id || ""}`;
    case "CASE":
      return `${ROUTES.CASES}/${id || ""}`;
    case "CLIENT":
      return `${ROUTES.CLIENTS}/${id || ""}`;
    default:
      return ROUTES.DASHBOARD;
  }
};

/**
 * Helper to extract and focus entities from URL search params
 */
export const useEntityFocus = (searchParams, paramName = 'focus') => {
  return searchParams.get(paramName);
};

