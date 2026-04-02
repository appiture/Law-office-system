-- Law Office Demo Data

-- 1. Users (Founder-First)
-- Password for both: admin@123 (BCrypt hash)
INSERT INTO users (email, password, role) VALUES 
('founder@lawoffice.com', '$2a$10$8.UnVuG9HHgffUDAlk8qfOuVGkqRzgVymGe07xd00DMxs.AQubh4a', 'FOUNDER'),
('admin@lawoffice.com', '$2a$10$8.UnVuG9HHgffUDAlk8qfOuVGkqRzgVymGe07xd00DMxs.AQubh4a', 'ADMIN');

-- 2. Clients
INSERT INTO clients (name, phone, case_type, status, total_amount, paid_amount, balance_amount, created_by, created_at) VALUES 
('Rajesh Kumar', '9876543210', 'Criminal Case', 'OVERDUE', 50000.00, 10000.00, 40000.00, 1, CURRENT_TIMESTAMP),
('Suresh Raina', '9123456789', 'Civil Property Dispute', 'PAID', 35000.00, 35000.00, 0.00, 1, CURRENT_TIMESTAMP),
('Amitabh Bachchan', '9988776655', 'Corporate Legal Advice', 'PARTIAL', 100000.00, 40000.00, 60000.00, 1, CURRENT_TIMESTAMP),
('Sachin Tendulkar', '9911223344', 'Contractual Agreement', 'PARTIAL', 25000.00, 15000.00, 10000.00, 1, CURRENT_TIMESTAMP),
('Priya Sharma', '8877665544', 'Family Law - Divorce', 'OVERDUE', 45000.00, 5000.00, 40000.00, 1, CURRENT_TIMESTAMP),
('Anita Desai', '7766554433', 'Intellectual Property', 'PAID', 60000.00, 60000.00, 0.00, 1, CURRENT_TIMESTAMP);

-- 3. Payments
INSERT INTO payments (client_id, amount, payment_date, payment_mode, payment_id, updated_by, updated_at) VALUES 
(1, 10000, CURRENT_DATE, 'Cash', NULL, 'founder@lawoffice.com', CURRENT_TIMESTAMP),
(1, 5000, CURRENT_DATE, 'UPI', 'TXN-UPI-9921', 'founder@lawoffice.com', CURRENT_TIMESTAMP),
(2, 20000, CURRENT_DATE, 'Bank Transfer', 'UTR-HDFC-0012', 'founder@lawoffice.com', CURRENT_TIMESTAMP);

-- 4. Shared Tasks
INSERT INTO shared_tasks (title, completed, created_by, updated_by, created_at) VALUES 
('Review Kumar Case Files', false, 'Founder', 'Founder', CURRENT_TIMESTAMP),
('Prepare Draft for Property Dispute', true, 'Founder', 'Founder', CURRENT_TIMESTAMP),
('Schedule Meeting with Bachchan Legal Team', false, 'Founder', 'Founder', CURRENT_TIMESTAMP),
('Finalize Tendulkar Contract', true, 'Founder', 'Founder', CURRENT_TIMESTAMP);
