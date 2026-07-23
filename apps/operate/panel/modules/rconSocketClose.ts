/** Stateless RCON socket closure helpers; callers retain authoritative ownership maps. */
import type Rcon from 'rcon-srcds';
import { errorMessage, type RconDisconnectResult } from './rconTypes';

interface CloseOptions {
  serverId: string;
  conn: Rcon;
  gracefulTimeoutMs: number;
  forceTimeoutMs: number;
}

function hasSocketMethods(conn: Rcon, methods: Array<'end' | 'destroy'>): boolean {
  const socket = conn.connection;
  return (
    typeof socket.once === 'function' &&
    typeof socket.removeListener === 'function' &&
    methods.every((method) => typeof socket[method] === 'function')
  );
}

export function closeManagedRconSocket({
  serverId,
  conn,
  gracefulTimeoutMs,
  forceTimeoutMs,
}: CloseOptions): Promise<RconDisconnectResult> {
  if (!hasSocketMethods(conn, ['end', 'destroy'])) {
    return Promise.resolve({
      server_id: serverId,
      state: 'no_connection_interface',
      closed: false,
    });
  }
  const socket = conn.connection;
  return new Promise((resolve) => {
    let done = false;
    let forced = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let lastError: string | undefined;
    const finish = (result: RconDisconnectResult) => {
      if (done) return;
      done = true;
      if (timeout !== undefined) clearTimeout(timeout);
      socket.removeListener('close', onClose);
      socket.removeListener('error', onError);
      resolve(result);
    };
    const onClose = () => finish({ server_id: serverId, state: 'closed', closed: true });
    const forceDestroy = () => {
      if (done || forced) return;
      forced = true;
      if (timeout !== undefined) clearTimeout(timeout);
      timeout = setTimeout(
        () => finish({ server_id: serverId, state: 'timeout', closed: false, error: lastError }),
        forceTimeoutMs
      );
      try {
        socket.destroy();
      } catch (err) {
        finish({ server_id: serverId, state: 'error', closed: false, error: errorMessage(err) });
      }
    };
    const onError = (error: Error) => {
      lastError = errorMessage(error);
      forceDestroy();
    };
    socket.once('close', onClose);
    socket.once('error', onError);
    timeout = setTimeout(forceDestroy, gracefulTimeoutMs);
    try {
      socket.end();
    } catch (err) {
      lastError = errorMessage(err);
      forceDestroy();
    }
  });
}

export function destroyPendingRconSocket(
  serverId: string,
  conn: Rcon,
  forceTimeoutMs: number
): Promise<RconDisconnectResult> {
  if (!hasSocketMethods(conn, ['destroy'])) {
    return Promise.resolve({
      server_id: serverId,
      state: 'no_connection_interface',
      closed: false,
    });
  }
  const socket = conn.connection;
  return new Promise((resolve) => {
    let done = false;
    let lastError: string | undefined;
    const timeout = setTimeout(
      () => finish({ server_id: serverId, state: 'timeout', closed: false, error: lastError }),
      forceTimeoutMs
    );
    const finish = (result: RconDisconnectResult) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      socket.removeListener('close', onClose);
      socket.removeListener('error', onError);
      resolve(result);
    };
    const onClose = () => finish({ server_id: serverId, state: 'closed', closed: true });
    const onError = (error: Error) => {
      lastError = errorMessage(error);
    };
    socket.once('close', onClose);
    socket.once('error', onError);
    try {
      socket.destroy();
    } catch (err) {
      finish({ server_id: serverId, state: 'error', closed: false, error: errorMessage(err) });
    }
  });
}
