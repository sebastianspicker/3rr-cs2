export function createEnvSummary() {
  return { scope: "env", status: "ready" };
}

// current lane: env
export function envTask() {
  return { scope: "env", status: "ready" };
}
