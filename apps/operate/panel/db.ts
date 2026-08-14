/** Stable SQLite composition facade for panel consumers. */
import { bootstrapDatabase } from './dbBootstrap';
import { openPanelDatabase } from './dbConnection';
import { runMigrations, SQLITE_UTC_NOW } from './dbMigrations';

const better_sqlite_client = openPanelDatabase();
runMigrations(better_sqlite_client);
bootstrapDatabase(better_sqlite_client);

export { better_sqlite_client, SQLITE_UTC_NOW };
