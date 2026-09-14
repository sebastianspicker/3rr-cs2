/** Time bounds that keep RCON lifecycle failures observable and recoverable. */
export const HEARTBEAT_INTERVAL_MS = 30000;
export const HEARTBEAT_TIMEOUT_MS = 5000;
export const RCON_SOCKET_TIMEOUT_MS = 5000;
export const RCON_DISCONNECT_TIMEOUT_MS = 3000;
export const RCON_FORCE_DISCONNECT_TIMEOUT_MS = 1000;
export const DEFAULT_AUTH_TIMEOUT_MS = 10000;
export const MAX_HEARTBEAT_INTERVAL_MS = 60000;
export const DEFAULT_TOTAL_DEADLINE_MS = 12000;
export const DEFAULT_MAX_QUEUED_PER_SERVER = 32;
export const DEFAULT_MAX_QUEUED_GLOBAL = 256;
export const DEFAULT_STARTUP_CONCURRENCY = 4;
export const OBSERVATION_CACHE_TTL_MS = 5000;
