CREATE TABLE accounts (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username text UNIQUE NOT NULL,
    password_hash text NOT NULL
);
CREATE TABLE sessions (
    token_hash text PRIMARY KEY,
    account_id integer NOT NULL REFERENCES accounts ON DELETE CASCADE,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);
ALTER TABLE habits ADD COLUMN account_id integer REFERENCES accounts;
ALTER TABLE time_blocks ADD COLUMN account_id integer REFERENCES accounts;
CREATE INDEX habits_account_idx ON habits (account_id, id);
CREATE INDEX blocks_account_day_idx ON time_blocks (account_id, day, starts_at);
