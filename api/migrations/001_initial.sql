CREATE TABLE habits (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80)
);

CREATE TABLE habit_checks (
    habit_id integer NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    day date NOT NULL,
    PRIMARY KEY (habit_id, day)
);

CREATE TABLE time_blocks (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 80),
    day date NOT NULL,
    starts_at time NOT NULL,
    ends_at time NOT NULL CHECK (ends_at > starts_at)
);

CREATE INDEX time_blocks_day_start_idx ON time_blocks (day, starts_at);
