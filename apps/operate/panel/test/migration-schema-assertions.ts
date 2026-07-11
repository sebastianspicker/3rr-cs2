import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';

export function tableColumns(db: Database.Database, table: string): string[] {
  return (db.pragma(`table_info(${table})`) as Array<{ name: string }>).map((row) => row.name);
}

export function tableIndexMap(
  db: Database.Database,
  table: string
): Map<string, { unique: number }> {
  const rows = db.pragma(`index_list(${table})`) as Array<{ name: string; unique: number }>;
  return new Map(rows.map((row) => [row.name, { unique: row.unique }]));
}

export function assertConstraint(fn: () => void, expectedCode: string): void {
  let err: unknown;
  try {
    fn();
  } catch (caught) {
    err = caught;
  }
  assert.ok(err instanceof Error, `Expected SQLite constraint ${expectedCode}`);
  const sqliteErr = err as Error & { code?: string };
  assert.equal(sqliteErr.code, expectedCode, sqliteErr.message);
}

export function tableCount(
  db: Database.Database,
  table: string,
  whereSql: string,
  value: number
): number {
  const row = db.prepare(`SELECT COUNT(1) AS count FROM ${table} WHERE ${whereSql}`).get(value) as {
    count: number;
  };
  return row.count;
}

export function insertSchemaProbeUser(db: Database.Database, id: number, username: string): void {
  db.prepare(`INSERT INTO users (id, username, password, is_admin) VALUES (?, ?, 'hash', 0)`).run(
    id,
    username
  );
}

export function insertSchemaProbeServer(
  db: Database.Database,
  id: number,
  serverIP: string,
  serverPort: number,
  ownerId: number
): void {
  db.prepare(
    `INSERT INTO servers (id, serverIP, serverPort, rconPassword, owner_id) VALUES (?, ?, ?, 'secret', ?)`
  ).run(id, serverIP, serverPort, ownerId);
}

export function insertSchemaProbeFavorite(
  db: Database.Database,
  userId: number,
  serverId: number,
  workshopId: string,
  name: string
): void {
  db.prepare(
    `INSERT INTO workshop_favorites (user_id, server_id, workshop_id, name) VALUES (?, ?, ?, ?)`
  ).run(userId, serverId, workshopId, name);
}

export function assertCurrentSchemaIndexes(db: Database.Database): void {
  const serverIndexes = tableIndexMap(db, 'servers');
  assert.equal(serverIndexes.get('idx_servers_ip_port')?.unique, 1);
  assert.ok(tableIndexMap(db, 'workshop_favorites').has('idx_workshop_favorites_user_server'));
  assert.ok(tableIndexMap(db, 'rcon_command_history').has('idx_rcon_history_user_server_recent'));
}

export function assertCurrentSchemaConstraints(db: Database.Database): void {
  insertSchemaProbeUser(db, 101, 'schema-user-one');
  insertSchemaProbeUser(db, 102, 'schema-user-two');
  insertSchemaProbeServer(db, 201, '203.0.113.201', 27015, 101);
  db.prepare(`INSERT INTO server_access (user_id, server_id) VALUES (?, ?)`).run(101, 201);
  insertSchemaProbeFavorite(db, 101, 201, '1234567890', 'Schema Favorite');
  insertSchemaProbeHistory(db, 101, 201, 'status');

  assertConstraint(
    () => insertSchemaProbeServer(db, 202, '203.0.113.201', 27015, 102),
    'SQLITE_CONSTRAINT_UNIQUE'
  );
  assertConstraint(
    () => insertSchemaProbeFavorite(db, 101, 201, '1234567890', 'Duplicate Favorite'),
    'SQLITE_CONSTRAINT_UNIQUE'
  );
  assertConstraint(
    () => insertSchemaProbeHistory(db, 101, 201, 'status'),
    'SQLITE_CONSTRAINT_UNIQUE'
  );

  assertConstraint(
    () => db.prepare(`INSERT INTO server_access (user_id, server_id) VALUES (?, ?)`).run(999, 201),
    'SQLITE_CONSTRAINT_FOREIGNKEY'
  );
  assertConstraint(
    () => insertSchemaProbeFavorite(db, 999, 201, '2222222222', 'Missing User Favorite'),
    'SQLITE_CONSTRAINT_FOREIGNKEY'
  );
  assertConstraint(
    () => insertSchemaProbeHistory(db, 101, 999, 'hostname'),
    'SQLITE_CONSTRAINT_FOREIGNKEY'
  );
}

export function assertCurrentSchemaCascades(db: Database.Database): void {
  db.prepare(`DELETE FROM users WHERE id = ?`).run(101);
  assert.equal(tableCount(db, 'server_access', 'user_id = ?', 101), 0);
  assert.equal(tableCount(db, 'workshop_favorites', 'user_id = ?', 101), 0);
  assert.equal(tableCount(db, 'rcon_command_history', 'user_id = ?', 101), 0);

  insertSchemaProbeServer(db, 302, '203.0.113.202', 27015, 102);
  db.prepare(`INSERT INTO server_access (user_id, server_id) VALUES (?, ?)`).run(102, 302);
  insertSchemaProbeFavorite(db, 102, 302, '3333333333', 'Server Cascade Favorite');
  insertSchemaProbeHistory(db, 102, 302, 'sv_visiblemaxplayers');

  db.prepare(`DELETE FROM servers WHERE id = ?`).run(302);
  assert.equal(tableCount(db, 'server_access', 'server_id = ?', 302), 0);
  assert.equal(tableCount(db, 'workshop_favorites', 'server_id = ?', 302), 0);
  assert.equal(tableCount(db, 'rcon_command_history', 'server_id = ?', 302), 0);
}

export function assertCurrentSchemaConstraintsIndexesAndCascades(db: Database.Database): void {
  db.pragma('foreign_keys = ON');
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  assertCurrentSchemaIndexes(db);
  db.exec(`
    DELETE FROM rcon_command_history;
    DELETE FROM workshop_favorites;
    DELETE FROM server_access;
    DELETE FROM servers;
    DELETE FROM users;
  `);
  assertCurrentSchemaConstraints(db);
  assertCurrentSchemaCascades(db);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
}

export function insertSchemaProbeHistory(
  db: Database.Database,
  userId: number,
  serverId: number,
  command: string
): void {
  db.prepare(`INSERT INTO rcon_command_history (user_id, server_id, command) VALUES (?, ?, ?)`).run(
    userId,
    serverId,
    command
  );
}
