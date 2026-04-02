-- Core application schema for production provisioning.

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'FOUNDER')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clients (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    case_type VARCHAR(100),
    total_amount NUMERIC(12,2) NOT NULL,
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    balance_amount NUMERIC(12,2),
    due_date DATE,
    next_due_date DATE,
    next_due_remarks VARCHAR(500),
    remarks VARCHAR(1000),
    follow_up_contacted BOOLEAN NOT NULL DEFAULT FALSE,
    follow_up_updated_by VARCHAR(150),
    follow_up_updated_at TIMESTAMP,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PAID', 'PARTIAL', 'OVERDUE')),
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_by_name VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    image_url VARCHAR(500),
    image_public_id VARCHAR(255)
);

CREATE TABLE payments (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    payment_date DATE NOT NULL,
    updated_by VARCHAR(150),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reminders (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    reminder_date DATE NOT NULL,
    sent_to_client BOOLEAN NOT NULL DEFAULT FALSE,
    sent_to_admin BOOLEAN NOT NULL DEFAULT FALSE,
    sent_to_founder BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    user_email VARCHAR(150) NOT NULL,
    message VARCHAR(500) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_unread
    ON notifications (user_email, is_read, created_at DESC);

CREATE TABLE shared_tasks (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_by VARCHAR(150) NOT NULL,
    updated_by VARCHAR(150) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
