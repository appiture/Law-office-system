/**
 * routes.js
 * 
 * Centralized route definitions for the application.
 */

export const ROUTES = {
  LOGIN: "/login",
  DASHBOARD: "/dashboard",
  CLIENTS: "/clients",
  CASES: "/cases",
  PAYMENTS: "/payments",
  DOCUMENTS: "/documents",
  HEARINGS: "/hearings",
  TASKS: "/tasks",
  TEAM: "/team",
  SETTINGS: "/settings",
  SUPER_ADMIN_LOGIN: "/super-admin-login",
  SUPER_ADMIN_DASHBOARD: "/platform-admin",
  SYSTEM_AUDIT: "/system-audit",
  RESET_PASSWORD: "/reset-password",
  CASE_DETAILS: "/cases/:caseId",
  CLIENT_DETAILS: "/clients/:clientId",
  HEARING_DETAILS: "/hearings/:hearingId",
};

export const getCaseDetailsRoute = (caseId) => `/cases/${caseId}`;
export const getClientDetailsRoute = (clientId) => `/clients/${clientId}`;
export const getHearingDetailsRoute = (hearingId) => `/hearings/${hearingId}`;
