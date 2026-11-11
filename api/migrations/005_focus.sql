CREATE TABLE focus_sessions (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id integer NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    task_id integer REFERENCES tasks(id) ON DELETE SET NULL,
    request_id uuid NOT NULL,
    planned_seconds integer NOT NULL CHECK (planned_seconds BETWEEN 60 AND 14400),
    duration_seconds numeric(12,3) NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0 AND duration_seconds <= planned_seconds),
    state text NOT NULL DEFAULT 'running' CHECK (state IN ('running', 'paused', 'completed', 'cancelled')),
    started_at timestamptz NOT NULL,
    resumed_at timestamptz,
    ended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    deleted_at timestamptz,
    UNIQUE (account_id, request_id),
    CHECK ((state = 'running') = (resumed_at IS NOT NULL)),
    CHECK ((state IN ('completed', 'cancelled')) = (ended_at IS NOT NULL)),
    CHECK (ended_at IS NULL OR ended_at >= started_at),
    CHECK (deleted_at IS NULL OR state IN ('completed', 'cancelled'))
);
CREATE UNIQUE INDEX focus_one_active_idx ON focus_sessions (account_id)
    WHERE state IN ('running', 'paused') AND deleted_at IS NULL;
CREATE INDEX focus_account_dates_idx ON focus_sessions (account_id, started_at, ended_at);
CREATE TABLE focus_segments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id integer NOT NULL REFERENCES focus_sessions(id) ON DELETE CASCADE,
    started_at timestamptz NOT NULL,
    ended_at timestamptz CHECK (ended_at >= started_at)
);
CREATE UNIQUE INDEX focus_one_open_segment_idx ON focus_segments (session_id) WHERE ended_at IS NULL;
CREATE INDEX focus_segments_dates_idx ON focus_segments (session_id, started_at, ended_at);
CREATE TABLE focus_requests (
    account_id integer NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    request_id uuid NOT NULL,
    session_id integer NOT NULL REFERENCES focus_sessions(id) ON DELETE CASCADE,
    operation text NOT NULL CHECK (operation IN ('start','pause','resume','finish','cancel','edit','delete')),
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (account_id, request_id)
);
