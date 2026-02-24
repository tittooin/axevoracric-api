-- schema.sql
-- SQLite Schema for Cricbuzz API on Cloudflare D1

DROP TABLE IF EXISTS ApiKeys;
DROP TABLE IF EXISTS Users;

CREATE TABLE Users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    plan TEXT DEFAULT 'free',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ApiKeys (
    id TEXT PRIMARY KEY,
    key_hash TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE INDEX idx_users_email ON Users(email);
CREATE INDEX idx_apikeys_userid ON ApiKeys(user_id);

-- New Tables for Data Ingestion Pipeline
CREATE TABLE matches (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_match_id TEXT NOT NULL,
    team_a TEXT NOT NULL,
    team_b TEXT NOT NULL,
    status TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    last_updated INTEGER NOT NULL,
    provider_updated_at INTEGER NOT NULL,
    ingested_at INTEGER NOT NULL,
    source_priority INTEGER NOT NULL,
    squads TEXT, -- JSON Array of players
    lineups TEXT, -- JSON Object with team_a and team_b playing 11
    scorecard TEXT, -- JSON Object for full scorecard
    live_details TEXT, -- JSON Object for mini-scorecard/summary
    raw_payload TEXT,
    UNIQUE(source, source_match_id)
);

CREATE TABLE match_scores (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    score_json TEXT NOT NULL,
    last_updated INTEGER NOT NULL,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_start_time ON matches(start_time);
CREATE INDEX idx_match_scores_match_id ON match_scores(match_id);
