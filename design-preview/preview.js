/* Local fixtures only. Production templates/styles are built by build.mjs. */
"use strict";
const byId = (id) => document.getElementById(id);
const servers = [
  {
    id: 1,
    name: "EU Scrim #1",
    host: "192.0.2.10:27015",
    map: "de_mirage",
    players: 10,
    state: "connected",
  },
  {
    id: 2,
    name: "EU Practice #2",
    host: "192.0.2.11:27015",
    map: "de_inferno",
    players: 3,
    state: "connected",
  },
  {
    id: 3,
    name: "NA Match #1",
    host: "198.51.100.20:27015",
    map: "Unknown",
    players: 0,
    state: "disconnected",
  },
  {
    id: 4,
    name: "Community server",
    host: "203.0.113.30:27015",
    map: "Unknown",
    players: 0,
    state: "unknown",
  },
];
let selected = null;
let request = null;
let observed = false;
let busy = false;
let noticeTimer;
const history = [];
let historyIndex = 0;
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const titleCase = (value) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
const text = (id, value) => {
  byId(id).textContent = value;
};
const show = (id, visible) => {
  byId(id).hidden = !visible;
};
function notice(message) {
  text("demo-notice", message);
  show("demo-notice", true);
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => show("demo-notice", false), 5000);
}
function renderServers() {
  byId("nav-server-list").innerHTML = servers
    .map(
      (server) =>
        `<li><a class="nav-server rail-server${selected?.id === server.id ? " is-active" : ""}" href="#setup" data-demo-server="${escapeHtml(server.id)}"${selected?.id === server.id ? ' aria-current="location"' : ""}><span class="nav-server-copy"><strong>${escapeHtml(server.name)}</strong><span class="nav-server-endpoint">${escapeHtml(server.host)}</span></span></a></li>`,
    )
    .join("");
  const stats = {
    "fleet-total": servers.length,
    "fleet-connected": servers.filter((s) => s.state === "connected").length,
    "fleet-unobserved": servers.filter((s) => s.state === "unknown").length,
    "fleet-disconnected": servers.filter((s) => s.state === "disconnected")
      .length,
    "fleet-players": servers.reduce(
      (sum, s) => sum + (s.state === "connected" ? s.players : 0),
      0,
    ),
  };
  for (const [id, value] of Object.entries(stats)) text(id, value);
  const search = byId("server-search").value.toLowerCase();
  const filter = byId("server-status-filter").value;
  const list = servers.filter(
    (s) =>
      `${s.name} ${s.host}`.toLowerCase().includes(search) &&
      (filter === "all" || filter === s.state),
  );
  byId("serverList").innerHTML = list
    .map(
      (s) =>
        `<div class="server-card server-choice-row${selected?.id === s.id ? " is-selected" : ""}" role="row"><div class="card-header server-choice" role="cell"><input type="radio" name="server-choice" id="server-choice-${escapeHtml(s.id)}" value="${escapeHtml(s.id)}" ${selected?.id === s.id ? "checked" : ""}><label class="server-choice-label" for="server-choice-${escapeHtml(s.id)}"><span class="card-title">${escapeHtml(s.name)}</span><span class="server-choice-fallback">CS2 · ${escapeHtml(s.map)}</span></label></div><span class="mono server-choice-endpoint" role="cell">${escapeHtml(s.host)}</span><span class="server-choice-status" role="cell"><span class="badge badge-${s.state}">${s.state === "connected" ? "Connected" : s.state === "unknown" ? "Not observed" : "Disconnected"}</span></span><span class="server-choice-time" role="cell">${s.state === "connected" ? "Just now" : "Not observed"}</span></div>`,
    )
    .join("");
  byId("serverList").setAttribute("aria-busy", "false");
  show("fleet-empty-filter", list.length === 0);
  text(
    "fleet-filter-summary",
    `${list.length} of ${servers.length} servers · simulated observations`,
  );
}
function selectServer(id) {
  selected = servers.find((s) => s.id === Number(id));
  request = null;
  observed = false;
  text("selected-server-name", selected.name);
  text("selected-server-map", selected.map);
  text("selected-server-players", `${selected.players} players`);
  text(
    "selected-server-observed",
    selected.state === "connected" ? "Just now (simulated)" : "Not observed",
  );
  ["selected-server", "selected-server-actions"].forEach((id) =>
    show(id, true),
  );
  show("selected-server-warning", selected.players > 0);
  renderServers();
  byId(`server-choice-${selected.id}`).focus();
}
function setTab(tab) {
  for (const button of document.querySelectorAll("[data-manage-tab]")) {
    const active = button.dataset.manageTab === tab;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    show(button.getAttribute("aria-controls"), active);
  }
}
function showSetup() {
  if (busy) return;
  document.body.classList.remove("session-showing-result");
  document.querySelectorAll(".session-advanced").forEach((section) => {
    section.hidden = false;
  });
  setTab("setup");
  show("requested-setup", true);
  show("session-result", false);
  show("advanced-setup", true);
  byId("session-step-setup").setAttribute("aria-current", "step");
  byId("session-step-result").removeAttribute("aria-current");
  byId("session-step-result").disabled = !request;
}
function observeHeader() {
  text("truth-rail-map", selected.map);
  text(
    "truth-rail-players",
    selected.state === "connected" ? selected.players : "Unknown",
  );
  text(
    "truth-rail-observed-at",
    selected.state === "connected" ? "Just now (simulated)" : "Not observed",
  );
  text(
    "manage-status-badge",
    selected.state === "connected"
      ? "Connected"
      : selected.state === "unknown"
        ? "Not observed"
        : "Disconnected",
  );
  byId("manage-status-badge").className = `badge badge-${selected.state}`;
  byId("manage-status-dot").className =
    `status-dot ${selected.state === "connected" ? "online" : selected.state === "unknown" ? "unknown" : "offline"}`;
  text(
    "setup-player-warning",
    selected.state === "connected"
      ? `${selected.players} players observed`
      : "Player count not observed",
  );
  text("truth-observed-time", "Demo");
  text(
    "truth-observed-detail",
    `${selected.map} · ${selected.players} players (simulated)`,
  );
}
function prepare() {
  if (!selected) {
    notice("Choose a server first.");
    return;
  }
  show("demo-inventory", false);
  show("demo-manage", true);
  document.body.classList.add("manage-page");
  document.querySelector(".skip-link").href = "#manage-main";
  text("manage-title", selected.name);
  text("truth-rail-endpoint", selected.host);
  text("send-setup-commands", `Send setup to ${selected.name}`);
  observeHeader();
  showSetup();
  renderPlayers();
  byId("manage-title").focus();
}
function requested() {
  return {
    game_type: byId("gameTypeValue").value,
    game_mode: byId("gameModeValue").value,
    selectedMap: byId("selectedMap").value,
    team1: byId("team1").value.trim(),
    team2: byId("team2").value.trim(),
  };
}
function review() {
  const value = requested();
  text(
    "setup-review-mode",
    `${titleCase(value.game_type)} / ${titleCase(value.game_mode)}`,
  );
  text("setup-review-map", value.selectedMap);
  text(
    "setup-review-teams",
    `${value.team1 || "Keep Team 1"} / ${value.team2 || "Keep Team 2"}`,
  );
}
const catalog = JSON.parse(byId("demo-catalog").textContent);
function mapChoices() {
  const mode =
    catalog.gameTypes[byId("gameTypeValue").value].gameModes[
      byId("gameModeValue").value
    ];
  const maps = [
    ...new Set(
      mode.mapGroups.flatMap((group) => catalog.mapGroups[group].maps),
    ),
  ];
  byId("selectedMap").innerHTML = maps
    .map((map) => `<option>${escapeHtml(map)}</option>`)
    .join("");
  if (maps.includes("de_mirage")) byId("selectedMap").value = "de_mirage";
  text("setup-config-note", `Simulated setup uses ${mode.exec}.`);
  review();
}
function choices() {
  byId("gameModeValue").innerHTML = Object.keys(
    catalog.gameTypes[byId("gameTypeValue").value].gameModes,
  )
    .map(
      (mode) =>
        `<option value="${escapeHtml(mode)}">${escapeHtml(titleCase(mode))}</option>`,
    )
    .join("");
  byId("gameModeValue").disabled = false;
  byId("selectedMap").disabled = false;
  byId("send-setup-commands").disabled = false;
  mapChoices();
}
function showResult() {
  document.body.classList.add("session-showing-result");
  document.querySelectorAll(".session-advanced").forEach((section) => {
    section.hidden = true;
  });
  setTab("setup");
  show("requested-setup", false);
  show("advanced-setup", false);
  show("session-result", true);
  byId("session-step-setup").removeAttribute("aria-current");
  byId("session-step-result").setAttribute("aria-current", "step");
  byId("session-step-result").disabled = false;
  show("session-pending-result", !observed);
  show("session-observed-result", observed);
}
byId("server_setup_form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy || !selected) return;
  if (selected.state !== "connected") {
    text(
      "setup-status",
      "Simulated send failed: RCON disconnected. Use Reconnect in Server tools, then try again.",
    );
    show("setup-status", true);
    byId("setup-status").focus();
    return;
  }
  request = requested();
  observed = false;
  busy = true;
  byId("session-result-heading").classList.remove("session-map-matched");
  byId("session-check-map").className = "btn btn-primary";
  text("session-check-map", "Check live map");
  show("session-edit-setup", true);
  show("setup-status", false);
  byId("setup-fields").disabled = true;
  byId("send-setup-commands").disabled = true;
  text("send-setup-commands", "Sending simulated commands…");
  setTimeout(() => {
    busy = false;
    byId("setup-fields").disabled = false;
    byId("send-setup-commands").disabled = false;
    text("send-setup-commands", `Send setup to ${selected.name}`);
    document.querySelectorAll("[data-session-requested]").forEach((node) => {
      const key = node.dataset.sessionRequested;
      node.textContent = ["game_type", "game_mode"].includes(key)
        ? titleCase(request[key])
        : request[key] || "Keep current name";
    });
    text("session-requested-at", new Date().toLocaleTimeString());
    text("session-previous-map", selected.map);
    text("session-previous-time", "Before this request");
    text("session-result-players", "Unknown");
    text("session-result-heading", "Setup commands sent");
    text(
      "session-result-description",
      "The simulated request was sent. The map has not been confirmed.",
    );
    show("session-check-map", true);
    show("session-return", false);
    showResult();
    byId("session-result-heading").focus();
  }, 400);
});
byId("session-check-map").addEventListener("click", () => {
  if (!request || busy) return;
  busy = true;
  byId("session-check-map").disabled = true;
  text("session-check-map", "Checking simulated map…");
  setTimeout(() => {
    selected.map = request.selectedMap;
    observed = true;
    byId("session-result-heading").classList.add("session-map-matched");
    busy = false;
    observeHeader();
    text("session-result-heading", "Requested map observed");
    text(
      "session-result-description",
      "The simulated observation matches the requested map.",
    );
    text("session-observed-map", selected.map);
    text("session-observed-players", selected.players);
    text(
      "session-result-status",
      "Requested map observed in the simulation. Mode and team names remain unverified.",
    );
    showResult();
    show("session-check-map", true);
    show("session-edit-setup", false);
    show("session-return", true);
    byId("session-check-map").disabled = false;
    byId("session-check-map").className = "btn btn-secondary";
    text("session-check-map", "Refresh observation");
    byId("session-result-heading").focus();
  }, 400);
});
byId("session-edit-setup").onclick = showSetup;
byId("session-step-setup").onclick = showSetup;
byId("session-return").onclick = showSetup;
byId("session-step-result").onclick = () => {
  if (request && !busy) showResult();
};
byId("prepare-selected-server").onclick = (event) => {
  event.preventDefault();
  event.stopPropagation();
  prepare();
};
byId("serverList").onchange = (event) => {
  if (event.target.matches('input[type="radio"]'))
    selectServer(event.target.value);
};
byId("server-search").oninput = renderServers;
byId("server-status-filter").onchange = renderServers;
byId("fleet-clear-filters").onclick = () => {
  byId("server-search").value = "";
  byId("server-status-filter").value = "all";
  renderServers();
};
byId("fleet-refresh").onclick = () => {
  renderServers();
  notice("Simulated server observations refreshed.");
};
byId("gameTypeValue").onchange = choices;
byId("gameModeValue").onchange = mapChoices;
for (const id of ["gameModeValue", "selectedMap", "team1", "team2"])
  byId(id).addEventListener("input", review);
const players = [
  "Moss",
  "Echo",
  "Harbor",
  "Pine",
  "Flint",
  "Comet",
  "Cedar",
  "Drift",
  "Ember",
  "Fern",
];
let removedPlayers = new Set();
function renderPlayers() {
  const list = players
    .slice(0, selected?.players || 0)
    .filter(
      (name) =>
        !removedPlayers.has(name) &&
        name.toLowerCase().includes(byId("playerSearch").value.toLowerCase()),
    );
  byId("playersList").innerHTML = list.length
    ? list
        .map(
          (name, index) =>
            `<div class="player-row" role="row"><strong role="cell">${escapeHtml(name)}</strong><span class="mono" role="cell">Demo player ${index + 1}</span><span role="cell"><button class="btn btn-secondary btn-sm" data-kick="${escapeHtml(name)}">Kick ${escapeHtml(name)}</button></span></div>`,
        )
        .join("")
    : '<p class="empty-state">No players match this view.</p>';
  text(
    "players-updated",
    "Simulated player observation · Refresh restores the fixture",
  );
  text("manage-tab-player-count", selected?.players || 0);
}
byId("playerSearch").oninput = renderPlayers;
byId("refresh_players").onclick = () => {
  removedPlayers = new Set();
  renderPlayers();
};
byId("playersList").onclick = (event) => {
  const name = event.target.dataset.kick;
  if (name) {
    removedPlayers.add(name);
    renderPlayers();
    notice(`${name} removed from the simulated list.`);
  }
};
function command(value) {
  if (!value.trim()) return;
  if (/[^\x20-\x7e]|;/.test(value)) {
    notice("Use one printable ASCII command without semicolons.");
    return;
  }
  const answer =
    value.trim() === "status"
      ? `${selected.name}\nmap: ${selected.map}\nplayers: ${selected.players}\nRCON: ${selected.state}`
      : `Simulated command accepted: ${value}`;
  text(
    "rconResultText",
    `> ${value}\n${answer}\n\nLocal demo response; no RCON command was sent.`,
  );
  document.querySelector(".console-empty").hidden = true;
  history.push(value);
  historyIndex = history.length;
  byId("rconHistoryList").innerHTML = history
    .map((line) => `<p class="mono">${escapeHtml(line)}</p>`)
    .join("");
  text("rcon-command-status", "Simulated response received.");
  byId("rconInput").value = "";
}
byId("rconInputBtn").onclick = () => command(byId("rconInput").value);
byId("rconInput").onkeydown = (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    command(byId("rconInput").value);
  }
  if (["ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    historyIndex = Math.max(
      0,
      Math.min(
        history.length,
        historyIndex + (event.key === "ArrowUp" ? -1 : 1),
      ),
    );
    byId("rconInput").value = history[historyIndex] || "";
  }
};
byId("rconClearBtn").onclick = () => {
  text("rconResultText", "");
  document.querySelector(".console-empty").hidden = false;
};
byId("rconHistoryClearBtn").onclick = () => {
  history.length = 0;
  text("rconHistoryList", "No sent RCON commands yet.");
};
byId("rconSuggestRefreshBtn").onclick = () => {
  byId("rconInput").value = "status";
  byId("rconInput").focus();
};
byId("say_input_btn").onclick = () => {
  command(`say ${byId("say_input").value}`);
  byId("say_input").value = "";
};
function account(open) {
  show("account-navigation", open);
  byId("nav-toggle-btn").setAttribute("aria-expanded", String(open));
}
byId("nav-toggle-btn").onclick = () => account(byId("account-navigation").hidden);
byId("theme-toggle").onclick = () => {
  const next =
    document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("3rr.demo.theme", next);
  } catch {
    /* optional preference */
  }
};
try {
  document.documentElement.dataset.theme =
    localStorage.getItem("3rr.demo.theme") || "dark";
} catch {
  /* default olive */
}
for (const button of document.querySelectorAll("[data-manage-tab]")) {
  button.onclick = () => setTab(button.dataset.manageTab);
  button.onkeydown = (event) => {
    const tabs = [...document.querySelectorAll("[data-manage-tab]")];
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (tabs.indexOf(button) +
              (event.key === "ArrowRight" ? 1 : -1) +
              tabs.length) %
            tabs.length;
    tabs[index].click();
    tabs[index].focus();
  };
}
byId("manage-reconnect").onclick = () => {
  selected.state = "connected";
  observeHeader();
  renderServers();
  show("setup-status", false);
  notice("Simulated RCON connection restored.");
};
byId("refresh_status").onclick = () => {
  observeHeader();
  notice(
    "Simulated observation refreshed. Use Check live map to check a pending setup.",
  );
};
byId("command-palette-trigger").onclick = () => {
  setTab("console");
  byId("rconInput").focus();
  notice("Enter a simulated command. Try status.");
};
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const wasOpen = !byId("account-navigation").hidden;
    account(false);
    if (wasOpen) byId("nav-toggle-btn").focus();
    show("demo-notice", false);
  }
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === "k" &&
    selected &&
    !byId("demo-manage").hidden
  ) {
    event.preventDefault();
    byId("command-palette-trigger").click();
  }
});
document.addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (link?.dataset.demoServer) {
    event.preventDefault();
    if (busy) {
      notice("Wait for the simulated request to finish.");
      return;
    }
    selectServer(link.dataset.demoServer);
    prepare();
    account(false);
  }
  if (link?.getAttribute("href") === "#servers") {
    event.preventDefault();
    if (busy) {
      notice("Wait for the simulated request to finish.");
      return;
    }
    show("demo-inventory", true);
    show("demo-manage", false);
    document.body.classList.remove("manage-page", "session-showing-result");
    document.querySelector(".skip-link").href = "#inventory-main";
    account(false);
    renderServers();
    byId("server-search").focus();
  }
  if (link?.getAttribute("href") === "#demo-only") {
    event.preventDefault();
    notice("This local demo has no account or server configuration storage.");
  }
  const button = event.target.closest("button");
  if (
    button &&
    !button.onclick &&
    !button.matches(
      "[data-manage-tab], [data-kick], #send-setup-commands, #session-check-map, #nav-toggle-btn",
    )
  ) {
    if (button.closest("#manage-panel-match, #advanced-setup")) {
      event.preventDefault();
      notice(`${button.textContent.trim()}: simulated action only.`);
    }
  }
  if (!event.target.closest(".ops-rail")) account(false);
});
choices();
renderServers();
