/**
 * tableColumns.js
 * 
 * Centralized table column configurations for consistent data presentation
 * across the UI and export fidelity.
 */

export const CLIENT_COLUMNS = [
  { header: "Name",           accessor: (r) => r.client_name   || r.name          || "—" },
  { header: "Phone",          accessor: (r) => r.phone         || "—" },
  { header: "Email",          accessor: (r) => r.email         || "—" },
  { header: "Address",        accessor: (r) => r.address       || "—" },
  { header: "City",           accessor: (r) => r.city          || "—" },
  { header: "Occupation",     accessor: (r) => r.occupation    || "—" },
  { header: "Registered",     accessor: (r) => (r.createdAt || r.created_at || "").slice(0, 10) || "—" },
];

export const CASE_COLUMNS = [
  { header: "Case No.",       accessor: (r) => r.caseNumber    || r.case_number    || "—" },
  { header: "Client",         accessor: (r) => r.client_name   || r.client?.name  || r.clientName     || "—" },
  { header: "Type",           accessor: (r) => r.case_title    || r.caseType      || r.case_type      || "—" },
  { header: "Status",         accessor: (r) => r.status        || "—" },
  { header: "Court",          accessor: (r) => r.courtName     || r.court_name     || "—" },
  { header: "Next Hearing",   accessor: (r) => r.nextHearingDate ? r.nextHearingDate.slice(0, 10) : "—" },
  { header: "Lawyer",         accessor: (r) => r.assignedLawyer|| r.lawyer_name    || "—" },
];

export const HEARING_COLUMNS = [
  { header: "Case No.",       accessor: (r) => r.caseNumber    || r.case?.caseNumber || "—" },
  { header: "Client",         accessor: (r) => r.client_name   || r.clientName     || r.case?.client?.name || "—" },
  { header: "Type",           accessor: (r) => r.type          || r.hearingType   || "—" },
  { header: "Event Title",    accessor: (r) => r.case_title    || r.title         || "—" },
  { header: "Due Date",       accessor: (r) => (r.hearing_date || r.scheduledAt   || r.dueDate || r.due_date || r.scheduled_at || "").slice(0, 10) || "—" },
  { header: "Status",         accessor: (r) => r.status        || "—" },
  { header: "Notes",          accessor: (r) => (r.notes        || "").slice(0, 40) || "—" },
];

export const PAYMENT_COLUMNS = [
  { header: "Case No.",       accessor: (r) => r.caseNumber    || r.case?.caseNumber || r.case_number || "—" },
  { header: "Client",         accessor: (r) => r.client?.name  || r.clientName     || "—" },
  { header: "Charge",         accessor: (r) => r.chargeName    || r.charge_name    || "—" },
  { header: "Amount",         accessor: (r) => r.amountPaid    != null || r.amount_paid != null ? `₹${Number(r.amountPaid || r.amount_paid).toLocaleString("en-IN")}` : "—" },
  { header: "Mode",           accessor: (r) => r.paymentMode   || r.payment_mode   || "—" },
  { header: "Reference",      accessor: (r) => r.paymentReference || r.payment_reference || "—" },
  { header: "Date",           accessor: (r) => (r.paymentDate  || r.payment_date   || "").slice(0, 10) || "—" },
];

export const DOCUMENT_COLUMNS = [
  { header: "Document Name",  accessor: (r) => r.title         || r.name || r.file_name || "—" },
  { header: "Case No.",       accessor: (r) => r.caseNumber    || r.case?.caseNumber || "—" },
  { header: "Category",       accessor: (r) => r.category      || "—" },
  { header: "Description",    accessor: (r) => r.description   || "—" },
  { header: "Uploaded",       accessor: (r) => (r.createdAt    || r.created_at || r.uploaded_at || "").slice(0, 10) || "—" },
  { header: "Uploaded By",    accessor: (r) => r.uploadedBy    || r.uploaded_by || "—" },
];

export const TASK_COLUMNS = [
  { header: "Task",           accessor: (r) => r.title         || r.task           || "—" },
  { header: "Status",         accessor: (r) => r.status        || "—" },
  { header: "Priority",       accessor: (r) => r.priority      || "—" },
  { header: "Due Date",       accessor: (r) => (r.dueDate      || r.due_date || r.created_at || "").slice(0, 10) || "—" },
  { header: "Assigned To",    accessor: (r) => r.assignedTo    || r.assigned_to    || "—" },
];

export const TEAM_COLUMNS = [
  { header: "Name/Email",     accessor: (r) => r.full_name || r.name || r.email || "—" },
  { header: "Role",           accessor: (r) => r.role || "—" },
  { header: "Status",         accessor: (r) => r.status || "—" },
  { header: "Type",           accessor: (r) => r.invite_type || (r.email && !r.full_name ? "Invite" : "Member") },
  { header: "Joined/Sent",    accessor: (r) => (r.created_at || r.sent_at || "").slice(0, 10) || "—" },
];
