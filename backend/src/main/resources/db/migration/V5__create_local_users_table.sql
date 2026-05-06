-- Create local_users table for local authentication (demo mode)
-- Separate migration version so Flyway applies it after the existing schema/data scripts.
CREATE TABLE IF NOT EXISTS local_users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'FOUNDER', 'LAWYER')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert demo user (password: demo123)
-- The BCrypt hash for 'demo123' is $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
UPDATE local_users
SET
    role = 'ADMIN',
    password = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
WHERE email = 'demo@lawoffice.local';

INSERT INTO local_users (email, password, role)
SELECT
    'demo@lawoffice.local',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'ADMIN'
WHERE NOT EXISTS (
    SELECT 1
    FROM local_users
    WHERE email = 'demo@lawoffice.local'
);
