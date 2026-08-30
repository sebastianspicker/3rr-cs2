/** Explicit SQLite construction boundary. */
import type Database from 'better-sqlite3';
import { bootstrapDatabase } from './bootstrap';
import { openPanelDatabase, type DatabaseOptions } from './connection';
import { runMigrations, SQLITE_UTC_NOW } from './migrations';

export function createPanelDatabase(options: DatabaseOptions = {}): Database.Database {
  const db = openPanelDatabase(options);
  runMigrations(db);
  bootstrapDatabase(db);
  return db;
}

export { SQLITE_UTC_NOW };
