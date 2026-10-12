-- Reviews: 1–5 stars and a short text, one per member and project.
-- Public with the GitHub username (published weekly in the update package).
CREATE TABLE reviews (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id          INTEGER NOT NULL,
  github_id        INTEGER NOT NULL,
  rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text             TEXT NOT NULL,
  created_day      TEXT NOT NULL,
  updated_day      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'visible',  -- 'visible' | 'hidden' (moderation)
  votes            INTEGER NOT NULL DEFAULT 0,
  reply_text       TEXT,                              -- answer of the project owner
  reply_github_id  INTEGER,
  reply_day        TEXT,
  UNIQUE (repo_id, github_id)
);
CREATE INDEX reviews_status_repo ON reviews(status, repo_id);
CREATE INDEX reviews_user_day ON reviews(github_id, updated_day);

-- Upvotes: only the count is published, never who voted.
CREATE TABLE review_votes (
  review_id  INTEGER NOT NULL,
  github_id  INTEGER NOT NULL,
  voted_day  TEXT NOT NULL,
  PRIMARY KEY (review_id, github_id)
);
CREATE INDEX review_votes_user_day ON review_votes(github_id, voted_day);
