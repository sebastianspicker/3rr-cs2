declare module 'rcon-srcds' {
  import type { Socket } from 'net';

  interface RCONOptions {
    host?: string;
    port?: number;
    maxPacketSize?: number;
    timeout?: number;
  }

  class Rcon {
    connection: Socket;
    connected: boolean;
    authenticated: boolean;
    constructor(options: RCONOptions);
    authenticate(password: string): Promise<boolean>;
    execute(command: string): Promise<string | boolean>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    isAuthenticated(): boolean;
  }

  export default Rcon;
}
