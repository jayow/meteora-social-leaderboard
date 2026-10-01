-- Add partial unique index on x_id (only enforces uniqueness when x_id is not null)
CREATE UNIQUE INDEX IF NOT EXISTS users_x_id_key ON users(x_id) WHERE x_id IS NOT NULL;
