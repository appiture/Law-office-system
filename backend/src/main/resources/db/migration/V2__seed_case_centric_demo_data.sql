INSERT INTO users (id, email, password, role, created_at) VALUES
(1, 'founder@lawoffice.com', '$2a$10$8.UnVuG9HHgffUDAlk8qfOuVGkqRzgVymGe07xd00DMxs.AQubh4a', 'FOUNDER', CURRENT_TIMESTAMP),
(2, 'admin@lawoffice.com', '$2a$10$8.UnVuG9HHgffUDAlk8qfOuVGkqRzgVymGe07xd00DMxs.AQubh4a', 'ADMIN', CURRENT_TIMESTAMP);

INSERT INTO clients (id, name, photo_url, photo_path, phone, email, address, id_proof_type, id_proof_number, id_proof_file_url, notes, created_by, created_at) VALUES
(1, 'Rajesh Kumar', 'https://placehold.co/120x120/png?text=RK', 'demo/client-rk.png', '9876543210', 'rajesh@example.com', 'Delhi', 'Aadhaar', 'RK-9988', 'https://example.com/id-rk.pdf', 'Backfilled into case-centric profile', 'founder@lawoffice.com', TIMESTAMP '2026-04-01 09:00:00'),
(2, 'Suresh Raina', 'https://placehold.co/120x120/png?text=SR', 'demo/client-sr.png', '9123456789', 'suresh@example.com', 'Mumbai', 'PAN', 'SR-2201', 'https://example.com/id-sr.pdf', 'Property client profile', 'founder@lawoffice.com', TIMESTAMP '2026-04-01 10:00:00'),
(3, 'Amitabh Bachchan', 'https://placehold.co/120x120/png?text=AB', 'demo/client-ab.png', '9988776655', 'amitabh@example.com', 'Mumbai', 'Passport', 'AB-1109', 'https://example.com/id-ab.pdf', 'Corporate advisory client', 'founder@lawoffice.com', TIMESTAMP '2026-04-01 11:00:00');

INSERT INTO cases (id, client_id, case_number, case_type, court_name, assigned_lawyer, status, created_by, created_at, updated_at) VALUES
(1, 1, 'LAW-CR-2026-001', 'Criminal Case', 'Delhi High Court', 'Adv. Mehra', 'OPEN', 'founder@lawoffice.com', TIMESTAMP '2026-04-01 09:30:00', TIMESTAMP '2026-04-07 09:00:00'),
(2, 2, 'LAW-CV-2026-002', 'Civil Property Dispute', 'Mumbai Civil Court', 'Adv. Iyer', 'ACTIVE', 'founder@lawoffice.com', TIMESTAMP '2026-04-01 10:30:00', TIMESTAMP '2026-04-06 10:30:00'),
(3, 3, 'LAW-CO-2026-003', 'Corporate Legal Advice', 'Commercial Bench', 'Adv. Singh', 'ACTIVE', 'founder@lawoffice.com', TIMESTAMP '2026-04-01 11:30:00', TIMESTAMP '2026-04-07 08:30:00');

INSERT INTO case_charge_items (id, case_id, label, total_amount, paid_amount, balance_amount, due_date, status, display_order) VALUES
(1, 1, 'Lawyer Fees', 30000.00, 10000.00, 20000.00, DATE '2026-04-05', 'OVERDUE', 1),
(2, 1, 'Court Fees', 20000.00, 0.00, 20000.00, DATE '2026-04-10', 'PARTIAL', 2),
(3, 2, 'Case Filing', 15000.00, 15000.00, 0.00, DATE '2026-04-02', 'PAID', 1),
(4, 2, 'Lawyer Fees', 20000.00, 20000.00, 0.00, DATE '2026-04-04', 'PAID', 2),
(5, 3, 'Advisory Retainer', 60000.00, 40000.00, 20000.00, DATE '2026-04-20', 'PARTIAL', 1),
(6, 3, 'Documentation', 40000.00, 0.00, 40000.00, DATE '2026-04-25', 'PARTIAL', 2);

INSERT INTO payment_history (id, case_id, charge_item_id, amount, payment_mode, payment_reference, recorded_by, created_at) VALUES
(1, 1, 1, 5000.00, 'Cash', 'CASH-RK-5001', 'founder@lawoffice.com', TIMESTAMP '2026-03-15 14:10:00'),
(2, 1, 1, 5000.00, 'UPI', 'TXN-UPI-9921', 'founder@lawoffice.com', TIMESTAMP '2026-04-04 10:20:00'),
(3, 2, 3, 15000.00, 'Bank Transfer', 'UTR-SR-1502', 'founder@lawoffice.com', TIMESTAMP '2026-04-03 12:30:00'),
(4, 2, 4, 20000.00, 'Cheque', 'CHQ-SR-004', 'founder@lawoffice.com', TIMESTAMP '2026-04-05 16:00:00'),
(5, 3, 5, 40000.00, 'Bank Transfer', 'UTR-AB-4003', 'founder@lawoffice.com', TIMESTAMP '2026-04-01 09:45:00');

INSERT INTO case_documents (id, case_id, category, file_name, file_path, file_url, file_type, file_size, uploaded_by, created_at) VALUES
(1, 1, 'EVIDENCE', 'cctv-footage.pdf', 'demo/case-1/cctv-footage.pdf', 'https://example.com/case-1/cctv-footage.pdf', 'application/pdf', 245000, 'founder@lawoffice.com', TIMESTAMP '2026-04-02 11:00:00'),
(2, 1, 'PROOF', 'id-proof.pdf', 'demo/case-1/id-proof.pdf', 'https://example.com/case-1/id-proof.pdf', 'application/pdf', 82000, 'founder@lawoffice.com', TIMESTAMP '2026-04-02 11:05:00'),
(3, 2, 'LEGAL_FILE', 'property-brief.docx', 'demo/case-2/property-brief.docx', 'https://example.com/case-2/property-brief.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 94000, 'founder@lawoffice.com', TIMESTAMP '2026-04-03 10:40:00'),
(4, 3, 'LEGAL_FILE', 'advisory-notes.pdf', 'demo/case-3/advisory-notes.pdf', 'https://example.com/case-3/advisory-notes.pdf', 'application/pdf', 128000, 'founder@lawoffice.com', TIMESTAMP '2026-04-04 15:25:00');

INSERT INTO case_followups (id, case_id, type, title, scheduled_at, status, notes, postponed_to, created_by, created_at) VALUES
(1, 1, 'HEARING', 'Bail hearing', TIMESTAMP '2026-04-07 11:00:00', 'PENDING', 'Prepare witness file and submit evidence bundle.', NULL, 'founder@lawoffice.com', TIMESTAMP '2026-04-02 09:15:00'),
(2, 1, 'DEADLINE', 'Court fee clearance', TIMESTAMP '2026-04-08 10:00:00', 'PENDING', 'Collect remaining court fees before next listing.', NULL, 'founder@lawoffice.com', TIMESTAMP '2026-04-03 09:15:00'),
(3, 2, 'JUDGMENT', 'Interim possession order', TIMESTAMP '2026-04-05 15:30:00', 'COMPLETED', 'Order received and shared with client.', NULL, 'founder@lawoffice.com', TIMESTAMP '2026-04-01 10:15:00'),
(4, 3, 'NOTE', 'Board review prep', TIMESTAMP '2026-04-10 14:00:00', 'PENDING', 'Compile agreement revisions and risk memo.', NULL, 'founder@lawoffice.com', TIMESTAMP '2026-04-04 10:00:00');

INSERT INTO notifications (user_email, message, is_read, created_at) VALUES
('founder@lawoffice.com', 'Case-centric dashboard seeded successfully.', FALSE, CURRENT_TIMESTAMP);

INSERT INTO shared_tasks (title, completed, created_by, updated_by, created_at, updated_at) VALUES
('Review Rajesh Kumar hearing notes', FALSE, 'Founder', 'Founder', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('Verify property dispute documents', TRUE, 'Founder', 'Founder', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

ALTER TABLE users ALTER COLUMN id RESTART WITH 10;
ALTER TABLE clients ALTER COLUMN id RESTART WITH 10;
ALTER TABLE cases ALTER COLUMN id RESTART WITH 10;
ALTER TABLE case_documents ALTER COLUMN id RESTART WITH 10;
ALTER TABLE case_charge_items ALTER COLUMN id RESTART WITH 10;
ALTER TABLE payment_history ALTER COLUMN id RESTART WITH 10;
ALTER TABLE case_followups ALTER COLUMN id RESTART WITH 10;
ALTER TABLE notifications ALTER COLUMN id RESTART WITH 10;
ALTER TABLE shared_tasks ALTER COLUMN id RESTART WITH 10;
