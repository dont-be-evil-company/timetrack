-- Migration: optional issue keys, per-company Tempo connection, sync state
ALTER TABLE Company ADD COLUMN tempoConnection TEXT;
--> statement-breakpoint
ALTER TABLE TaskDefinition ADD COLUMN issueKey TEXT;
--> statement-breakpoint
ALTER TABLE Task ADD COLUMN issueKey TEXT;
--> statement-breakpoint
CREATE TABLE TaskExternalSync (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  taskId INTEGER NOT NULL REFERENCES Task(id) ON DELETE CASCADE,
  connectionName TEXT NOT NULL,
  remoteId TEXT NOT NULL,
  remoteIssueId TEXT,
  contentHash TEXT NOT NULL,
  syncedAt TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX TaskExternalSync_taskId_key ON TaskExternalSync(taskId);
