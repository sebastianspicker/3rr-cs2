import { expect, test, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
export { expect, test, Database };
export type { Page };

export async function login(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Username').fill('e2eadmin');
  await page.getByLabel('Password').fill(['e2e', 'password', '12345'].join(''));
  await Promise.all([
    page.waitForURL('**/servers'),
    page.getByRole('button', { name: 'Authenticate' }).click(),
  ]);
}

export function getE2eDbPath(): string {
  const dbPath = process.env.E2E_DB_PATH;
  if (!dbPath) throw new Error('E2E_DB_PATH is required for E2E database seeding');
  return dbPath;
}

export function seedManageServer(): number {
  const db = new Database(getE2eDbPath());
  try {
    const user = db.prepare(`SELECT id FROM users WHERE username = ?`).get('e2eadmin') as
      | { id: number }
      | undefined;
    if (!user) throw new Error('E2E admin user is missing');

    const insertServer = db.transaction((userId: number) => {
      const nextPort = (
        db
          .prepare(
            `SELECT COALESCE(MAX(serverPort), 29999) + 1 AS port
               FROM servers
              WHERE serverPort >= 30000 AND serverPort < 40000`
          )
          .get() as { port: number }
      ).port;
      const result = db
        .prepare(
          `INSERT INTO servers (serverIP, serverPort, rconPassword, owner_id)
           VALUES ('127.0.0.1', ?, 'e2e-rcon-not-used', ?)`
        )
        .run(nextPort, userId);
      const serverId = Number(result.lastInsertRowid);
      db.prepare(`INSERT INTO server_access (user_id, server_id) VALUES (?, ?)`).run(
        userId,
        serverId
      );
      return serverId;
    });

    return insertServer(user.id);
  } finally {
    db.close();
  }
}

export function seedUser(username: string): number {
  const db = new Database(getE2eDbPath());
  try {
    const result = db
      .prepare(`INSERT INTO users (username, password, is_admin) VALUES (?, ?, 0)`)
      .run(username, 'not-a-login-password-hash');
    return Number(result.lastInsertRowid);
  } finally {
    db.close();
  }
}

export function updateRequestedGameSelection(
  serverId: number,
  selection: { gameType: string; gameMode: string; map: string }
): void {
  const db = new Database(getE2eDbPath());
  try {
    db.prepare(
      `UPDATE servers
          SET last_game_type = ?,
              last_game_mode = ?,
              last_map = ?
        WHERE id = ?`
    ).run(selection.gameType, selection.gameMode, selection.map, serverId);
  } finally {
    db.close();
  }
}

export async function confirmModal(page: Page, message: string): Promise<void> {
  await expect(page.getByRole('dialog')).toContainText(message);
  await page.getByRole('button', { name: 'Confirm' }).click();
}
