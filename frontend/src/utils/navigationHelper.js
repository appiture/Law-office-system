/**
 * Navigation Helper for Universal Deep Linking
 * Centralizes all routing logic for notifications and entity access
 */

export const getEntityUrl = (entityType, entityId, parentId = null) => {
  if (!entityId) return '/dashboard';

  switch (entityType?.toLowerCase()) {
    case 'client':
      return `/clients/${entityId}`;
    case 'case':
      return `/cases/${entityId}`;
    case 'hearing':
    case 'followup':
    case 'deadline':
      return `/followups/${entityId}`;
    case 'payment':
      return `/payments?searchId=${entityId}`;
    case 'task':
      return `/tasks?focus=${entityId}`;
    case 'document':
      return `/documents?focus=${entityId}`;
    default:
      return '/dashboard';
  }
};

/**
 * Helper to extract and focus entities from URL search params
 */
export const useEntityFocus = (searchParams, paramName = 'focus') => {
  return searchParams.get(paramName);
};
