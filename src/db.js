import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'registrations.db'));
db.pragma('journal_mode = WAL'); // safer concurrent writes

db.exec(`
  CREATE TABLE IF NOT EXISTS registrations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    mobile     TEXT NOT NULL,
    district   TEXT NOT NULL,
    image_url  TEXT,
    status     TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed
    error      TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_reg_mobile ON registrations(mobile);
`);

const insertStmt = db.prepare(
  `INSERT INTO registrations (name, mobile, district, status) VALUES (?, ?, ?, 'pending')`
);
const markSentStmt = db.prepare(`UPDATE registrations SET status='sent', image_url=?, error=NULL WHERE id=?`);
const markFailedStmt = db.prepare(`UPDATE registrations SET status='failed', error=? WHERE id=?`);
const allStmt = db.prepare(`SELECT * FROM registrations ORDER BY id DESC`);

export function saveLead({ name, mobile, district }) {
  const info = insertStmt.run(name, mobile, district);
  return info.lastInsertRowid; // the new row id
}
export function markSent(id, imageUrl) { markSentStmt.run(imageUrl, id); }
export function markFailed(id, errorMsg) { markFailedStmt.run(String(errorMsg).slice(0, 500), id); }
export function getAllRegistrations() { return allStmt.all(); }

export default db;
