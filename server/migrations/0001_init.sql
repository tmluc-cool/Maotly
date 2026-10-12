-- Moatly network. Only what the privacy policy names: no e-mail, no IP, no search terms.

CREATE TABLE users (
  github_id        INTEGER PRIMARY KEY,
  login            TEXT NOT NULL,
  app_version      TEXT,
  joined_day       TEXT NOT NULL,      -- date only, no time
  last_active_day  TEXT NOT NULL,      -- date only
  submissions      INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'blocked'
  session_hash     TEXT NOT NULL       -- SHA-256 of the session token
);
CREATE UNIQUE INDEX users_session ON users(session_hash);
CREATE INDEX users_last_active ON users(last_active_day);

CREATE TABLE submissions (
  repo_id       INTEGER NOT NULL,
  github_id     INTEGER NOT NULL,
  submitted_day TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'rejected'
  reason        TEXT,
  repo_name     TEXT,                              -- filled in by the weekly check, for the dashboard
  PRIMARY KEY (repo_id, github_id)
);
CREATE INDEX submissions_status ON submissions(status, repo_id);
CREATE INDEX submissions_user_day ON submissions(github_id, submitted_day);
