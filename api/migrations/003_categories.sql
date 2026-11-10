ALTER TABLE time_blocks ADD COLUMN category text NOT NULL DEFAULT 'personal'
    CHECK (category IN ('personal', 'trabajo', 'estudio', 'salud', 'descanso'));
