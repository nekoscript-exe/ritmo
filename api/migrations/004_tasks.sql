CREATE TABLE tasks (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id integer NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 80),
    description text CHECK (char_length(description) <= 2000),
    completed boolean NOT NULL DEFAULT false,
    priority text NOT NULL DEFAULT 'media' CHECK (priority IN ('baja', 'media', 'alta')),
    category text NOT NULL DEFAULT 'personal'
        CHECK (category IN ('personal', 'trabajo', 'estudio', 'salud', 'descanso')),
    due_date date,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamptz,
    CHECK (completed = (completed_at IS NOT NULL))
);

CREATE INDEX tasks_account_due_idx ON tasks (account_id, due_date, id);
CREATE INDEX tasks_account_completed_idx ON tasks (account_id, completed, id);
