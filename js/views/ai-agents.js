// AGENT-07: AI Agents area views — entry point for routes `#/ai-agents`
// (auto-routes to the only available agent today; tile grid when multiple)
// and `#/ai-agents/:agentId` (per-agent chat surface).
//
// Visual contract (user-directed 2026-05-22): the surface looks and feels
// like the admin landing — indigo particles background, thin lowercase
// tracking-tight typography, no card chrome, no breadcrumb. The chat
// component fills the viewport edge-to-edge under the sticky header.

import { getState } from "../state.js";
import { AGENTS, getAgent } from "../agents.js";
import { renderAgentChat } from "../components/agentChat.js";

export function renderAiAgents() {
  const { route } = getState();
  if (route?.name === "ai-agent") return renderAgentSurface(route.params.agentId);
  // `#/ai-agents` is the directory of all available agents — always renders
  // the index, even when only one agent is registered. The header's "AI
  // Agents" tab points here so users see the full set at a glance and
  // pick which one to open. (Previously auto-routed to the only agent's
  // chat — reverted 2026-05-22 per user direction.)
  return renderAgentsIndex();
}

// ── Full-viewport shell with particles background ────────────────────────

// `h-[calc(100vh-68px)]` hard-locks the surface to exactly the viewport
// minus the sticky header (~68 px — same offset the admin landing uses).
// `overflow-hidden` ensures content can't bleed past the viewport even
// during a transition. The particles canvas is managed at the body level
// by main.js's syncBackground() — fixed-position, z-index:-1, persists
// across the full-tree re-mount on every setState (no more thrash).
function viewportShell() {
  const root = document.createElement("div");
  root.className = "relative h-[calc(100vh-68px)] overflow-hidden";
  return root;
}

// Single-agent surface — particles background + the chat component.
function renderAgentSurface(agentId) {
  const def = getAgent(agentId);
  if (!def) return renderNotFound(agentId);
  const shell = viewportShell();

  // Content layer — sits above the body-level particles canvas via normal
  // flow (particles is at z-index:-1, this is at the default positive
  // stacking pass). `h-full` lets the chat fill the viewport-locked shell.
  const stage = document.createElement("div");
  stage.className = "relative h-full w-full";
  stage.appendChild(renderAgentChat(agentId));
  shell.appendChild(stage);

  // main.js's teardown(node) walks descendants and fires their __cleanup
  // hooks automatically — no shell-level chaining needed now that the
  // particles canvas lives outside the route view.

  return shell;
}

// Index (reserved for the multi-agent future). Tile grid in the same
// minimalist aesthetic — thin lowercase labels on the particles background.
// `pointer-events-none` on the particles div in mountParticles() lets the
// clicks pass through to the tile links underneath.
function renderAgentsIndex() {
  const shell = viewportShell();

  const stage = document.createElement("div");
  stage.className = "relative z-10 h-full w-full flex flex-col items-center justify-center px-8";
  shell.appendChild(stage);

  const heading = document.createElement("div");
  heading.className = "text-7xl font-thin tracking-tight text-ink-900 lowercase mb-12 leading-none whitespace-nowrap";
  heading.textContent = "ai agents";
  stage.appendChild(heading);

  // items-center keeps each agent link visually centered under the
  // heading. (The admin landing uses `ml-16` to step children under a
  // parent action — but here the heading IS centered, so the same
  // indent visibly off-centers the only child.)
  const list = document.createElement("nav");
  list.className = "flex flex-col gap-4 items-center";
  for (const [id, def] of Object.entries(AGENTS)) {
    const a = document.createElement("a");
    a.href = `#/ai-agents/${id}`;
    a.className =
      "block text-4xl font-thin tracking-tight text-ink-900 hover:text-brand-600 transition-colors duration-200 lowercase pb-1";
    a.textContent = `${def.label.toLowerCase()} agent`;
    list.appendChild(a);
  }
  stage.appendChild(list);

  return shell;
}

function renderNotFound(agentId) {
  const shell = viewportShell();
  const stage = document.createElement("div");
  stage.className = "relative z-10 h-full w-full flex flex-col items-center justify-center px-8 gap-4";
  const safe = String(agentId).replace(/[<>&"]/g, "");
  stage.innerHTML = `
    <div class="text-4xl font-thin tracking-tight text-ink-900 lowercase">unknown agent</div>
    <div class="text-ink-500 text-sm">No agent registered with id <code class="bg-ink-100 px-1.5 py-0.5 rounded text-ink-700">${safe}</code>.</div>
    <a href="#/ai-agents" class="text-brand-600 hover:text-brand-700 text-sm font-medium lowercase">← back to ai agents</a>`;
  shell.appendChild(stage);
  return shell;
}
