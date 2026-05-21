// AGENT-03 — registry of in-dashboard chat agents.
//
// Single source of truth for which agents the dashboard exposes under
// #/ai-agents/:agentId. Adding a second agent is two edits:
//   1. Add an entry to AGENTS below.
//   2. Add the matching webhook URL to the Worker env as
//      N8N_AGENT_<UPPERSNAKE>_URL and update AGENT_WEBHOOKS in worker.js.
//
// Pure data + one helper — no DOM, no fetch, no business logic. The chat
// component (js/components/agentChat.js) and the route view
// (js/views/ai-agents.js) read from this registry; the landing
// (js/views/admin.js → buildAiAgentsGroup) iterates Object.entries(AGENTS)
// so adding an agent here propagates to the landing submenu automatically.
//
// Mode contract (carried over from the production n8n agent, confirmed via
// `~/OneDrive/Desktop/Connectors/lovable-prompt-2-landing.md`):
//   - `modes` is an ordered array; the chat component renders one tile per
//     entry as the empty-state mode picker.
//   - The selected mode's `prefix` is prepended to the FIRST message of the
//     session only — the agent's system prompt strips the tag and locks the
//     mode for the rest of the session.
//   - Agents without `modes` render no mode picker and send the message as-is.

export const AGENTS = {
  "buyer-seller-matcher": {
    label: "Buyer-Seller Matcher",
    blurb: "Add a property request, or search the existing book for a match.",
    // Greeting + placeholder are mode-aware. The chat component reads
    // greeting[slice.mode] / placeholder[slice.mode] after the picker is
    // resolved; before that the picker covers the greeting area.
    greeting: {
      add:    "Tell me about the property",
      search: "What are you looking for?",
    },
    placeholder: {
      add:    "e.g. Buyer wants 3-bed apartment, New Cairo, 4M EGP, August.",
      search: "e.g. 3-bed apartments under 5M in New Cairo.",
    },
    modes: [
      { id: "add",    label: "Add a property request",     prefix: "[MODE:add] " },
      { id: "search", label: "Search existing properties", prefix: "[MODE:search] " },
    ],
  },
};

export function getAgent(id) {
  return AGENTS[id] || null;
}
