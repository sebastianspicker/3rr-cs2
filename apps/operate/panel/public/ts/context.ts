/** Module-scoped server ID, set once by console.ts on page load. */
let serverId = '';

export function setServerId(id: string): void {
  serverId = id;
}

export function getServerId(): string {
  return serverId;
}
