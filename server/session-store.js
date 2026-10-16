import session from 'express-session';

export class SQLiteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.db.exec(`CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );`);
    this.read = this.db.prepare('SELECT data, expires_at FROM sessions WHERE sid = ?');
    this.write = this.db.prepare(`INSERT INTO sessions (sid, expires_at, data) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET expires_at = excluded.expires_at, data = excluded.data`);
    this.remove = this.db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.refresh = this.db.prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?');
  }

  get(id, callback) {
    try {
      const row = this.read.get(id);
      if (!row) return callback(null, null);
      if (row.expires_at <= Date.now()) {
        this.remove.run(id);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.data));
    } catch (error) {
      callback(error);
    }
  }

  set(id, value, callback = () => {}) {
    try {
      const expiry = value.cookie?.expires ? Date.parse(value.cookie.expires) : Date.now() + 8 * 60 * 60 * 1000;
      this.write.run(id, expiry, JSON.stringify(value));
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(id, value, callback = () => {}) {
    try {
      const expiry = value.cookie?.expires ? Date.parse(value.cookie.expires) : Date.now() + 8 * 60 * 60 * 1000;
      this.refresh.run(expiry, id);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(id, callback = () => {}) {
    try {
      this.remove.run(id);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }
}