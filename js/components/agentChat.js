// AGENT-07: reusable native chat surface for `#/ai-agents/:agentId`.
//
// Visual contract (user-directed 2026-05-22, polish pass): matches the
// admin landing's homepage aesthetic — full viewport width, no card
// chrome, no header strip, no breadcrumb, NO message-bubble backgrounds.
// Typography is uniformly `font-thin tracking-tight` (the "German thing"
// from the landing), with alignment doing the work of differentiating
// user vs. agent. Particles are painted by the parent view (ai-agents.js).
//
// State (AGENT-04): per-agent slice in `state.agents[agentId]`, persisted
// to localStorage. The component never owns state; every interaction goes
// through state.js setters (setAgentMode / appendAgentMessage /
// updateAgentLastMessage / setAgentSending / clearAgent), which trigger
// subscribe(render) → full re-render. Focus is preserved by main.js's
// generalized restore because the textarea has a stable id.
//
// Send flow (AGENT-05): mode-tag-on-first-message-only via `modePrefix`.
// Worker returns the full reply in one shot (AGENT-06) and the reply is
// dropped into the agent bubble in one shot too — no client-side typing
// animation. (User feedback 2026-05-22: per-tick re-renders flickered the
// page and made the particles canvas thrash. Real SSE streaming remains
// deferred to AGENT-10 if we want to revisit progressive reveal.)

import { getAgent } from "../agents.js";
import {
  ensureAgent,
  setAgentMode,
  appendAgentMessage,
  updateAgentLastMessage,
  setAgentSending,
  clearAgent,
} from "../state.js";
import { sendAgentMessage, AuthRequiredError } from "../api.js";

// ── Markdown rendering ──────────────────────────────────────────────────
//
// Tiny inline markdown→HTML renderer for agent replies (user messages stay
// as plain text). Covers the formats the deployed agent actually emits —
// numbered lists, bullet lists, bold, italic, inline code, headings — plus
// line/paragraph breaks. Aggressive HTML-escape FIRST then parse markdown
// out of the escaped string, so any `<script>` in a reply stays inert.

function _escapeHtml(s) {
  return String(s).replace(/[<>&"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]),
  );
}

function _renderInline(s) {
  // Order matters: bold (**) before italic (*) so we don't half-eat the bold markers.
  return s
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong class="font-medium text-ink-900">$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em class="italic">$1</em>')
    .replace(/(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/g, '<em class="italic">$1</em>')
    .replace(/`([^`\n]+)`/g, '<code class="bg-ink-100 text-ink-800 rounded px-1.5 py-0.5 text-[0.85em] font-mono">$1</code>');
}

function renderMarkdown(text) {
  if (!text) return "";
  const safe = _escapeHtml(text);
  const lines = safe.split(/\n/);
  const out = [];

  // Stack of open lists, each {type:'ol'|'ul', indent:number, items:string[]}.
  // The stack lets a nested bullet list under a numbered item live inside
  // the outer <ol>'s last <li>, so the outer numbering survives blank
  // lines + the nested bullets (the bug the previous flat renderer hit:
  // each blank line / nested ul closed the ol, and the next "2." opened
  // a fresh <ol> that browser-rendered starting at 1).
  const stack = [];

  const formatList = (list) => {
    const cls = list.type === "ol" ? "list-decimal" : "list-disc";
    return (
      `<${list.type} class="${cls} pl-7 my-2 space-y-1 marker:text-ink-400">` +
      list.items.map((s) => `<li class="pl-1">${s}</li>`).join("") +
      `</${list.type}>`
    );
  };
  const popList = () => {
    const top = stack.pop();
    const html = formatList(top);
    if (stack.length) {
      // Nest: append the closed list to the parent list's last item.
      const parent = stack[stack.length - 1];
      parent.items[parent.items.length - 1] += html;
    } else {
      out.push(html);
    }
  };
  const flushAll = () => { while (stack.length) popList(); };

  for (const line of lines) {
    // Heading (only at column 0, never inside a list)
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      flushAll();
      const lvl = h[1].length;
      const sz = lvl === 1 ? "text-[1.2em] font-medium mt-3 mb-1" :
                 lvl === 2 ? "text-[1.1em] font-medium mt-2 mb-1" :
                             "text-[1.05em] font-medium mt-2 mb-1";
      out.push(`<h${lvl} class="${sz}">${_renderInline(h[2])}</h${lvl}>`);
      continue;
    }
    // List items — track indent so nested bullets attach to the right ol/ul
    const olM = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    const ulM = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (olM || ulM) {
      const indent  = (olM ? olM[1] : ulM[1]).length;
      const type    = olM ? "ol" : "ul";
      const content = _renderInline(olM ? olM[3] : ulM[2]);

      // Close any lists deeper than this indent (we're un-nesting).
      while (stack.length && stack[stack.length - 1].indent > indent) popList();

      const top = stack[stack.length - 1];
      if (top && top.indent === indent) {
        if (top.type === type) {
          // Same level, same type → continue the list (numbering preserved).
          top.items.push(content);
        } else {
          // Same level, different type → close current, start fresh.
          popList();
          stack.push({ type, indent, items: [content] });
        }
      } else {
        // Either stack empty or top has less indent → nest deeper.
        stack.push({ type, indent, items: [content] });
      }
      continue;
    }
    // Blank line: outside a list it's a paragraph break; INSIDE a list
    // it doesn't terminate the list (markdown convention — and the
    // agent emits blank lines between items as visual breathing room).
    if (!line.trim()) {
      if (!stack.length) out.push('<div class="h-2"></div>');
      continue;
    }
    // Regular line: close lists, add as a div.
    flushAll();
    out.push(`<div>${_renderInline(line)}</div>`);
  }
  flushAll();
  return out.join("");
}

// ── Icons ───────────────────────────────────────────────────────────────

const SEND_SVG = `
  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path fill-rule="evenodd" d="M10 17a1 1 0 01-1-1V6.41l-3.3 3.3a1 1 0 01-1.4-1.42l5-5a1 1 0 011.4 0l5 5a1 1 0 01-1.4 1.42L11 6.41V16a1 1 0 01-1 1z" clip-rule="evenodd"/>
  </svg>`;

// ── Send flow ───────────────────────────────────────────────────────────

function makeSendHandler(agentId, def, textarea) {
  return async function send() {
    const text = textarea.value.trim();
    if (!text) return;
    const slice = ensureAgent(agentId);
    if (slice.sending) return;  // guard against double-fire

    const isFirst = slice.messages.length === 0;
    const modeDef = slice.mode && def.modes ? def.modes.find((m) => m.id === slice.mode) : null;
    const modePrefix = isFirst && modeDef ? modeDef.prefix : "";

    textarea.value = "";
    textarea.style.height = "auto";

    // Optimistic: user line first, then empty agent placeholder that
    // shows the caret while sending=true && text==="". One re-render
    // for both appends (state.js batches via setState natively, just
    // back-to-back calls — minor flash acceptable).
    appendAgentMessage(agentId, { role: "user",  text, ts: Date.now() });
    appendAgentMessage(agentId, { role: "agent", text: "", ts: Date.now() });
    setAgentSending(agentId, true);

    let resp;
    try {
      resp = await sendAgentMessage({
        agentId,
        sessionId: slice.sessionId,
        message: text,
        modePrefix,
      });
    } catch (e) {
      if (e instanceof AuthRequiredError) {
        updateAgentLastMessage(agentId, { text: "Sign-in expired. Reload the page to sign in again.", error: true });
        setAgentSending(agentId, false, { kind: "auth" });
        return;
      }
      updateAgentLastMessage(agentId, { text: "Couldn't reach the assistant. Please try again.", error: true });
      setAgentSending(agentId, false, { kind: "network", message: String(e?.message || e) });
      return;
    }

    if (resp.ok && resp.data?.status === "ok") {
      // Drop the full reply in one go. setAgentSending(false) THEN
      // updateAgentLastMessage so the caret disappears before the text
      // appears (otherwise there's a one-tick frame where both render).
      setAgentSending(agentId, false);
      updateAgentLastMessage(agentId, { text: String(resp.data.reply || ""), error: false });
    } else {
      const errText = resp.data?.error || `Request failed (${resp.status})`;
      updateAgentLastMessage(agentId, { text: "Something went wrong: " + errText, error: true });
      setAgentSending(agentId, false, { kind: "error", message: errText });
    }
  };
}

// ── Sub-section renderers ────────────────────────────────────────────────

// Empty-state mode picker — homepage-style minimalist text links. Click
// commits the mode; the input row then activates and the giant "start
// typing" hero appears (renderTypingHero).
function renderModePicker(def, agentId) {
  const wrap = document.createElement("div");
  wrap.className = "flex-1 flex flex-col items-center justify-center gap-6 px-8";

  const label = document.createElement("div");
  label.className = "text-ink-500 text-sm tracking-wide uppercase mb-2";
  label.textContent = "choose a mode";
  wrap.appendChild(label);

  for (const mode of def.modes) {
    const btn = document.createElement("button");
    btn.type = "button";
    // pb-1 leaves room for `g`/`p` descenders (STYLE-08 pattern at text-4xl).
    btn.className =
      "block text-4xl font-thin tracking-tight text-ink-900 hover:text-brand-600 transition-colors duration-200 lowercase pb-1";
    btn.textContent = mode.label.toLowerCase();
    btn.addEventListener("click", () => setAgentMode(agentId, mode.id));
    wrap.appendChild(btn);
  }
  return wrap;
}

// "start typing" 72-px shimmer — empty-state hero. The shimmer-text class
// (css/styles.css) sweeps a bright band L→R over 3000ms then holds for
// 500ms before restarting. `leading-[1.2]` + `pb-3` give the `g`/`p`
// descenders room — at 72px+font-thin the default `leading-none` clipped
// them. `pointer-events-none` so the user can click straight through to
// the textarea (which has an autofocus on mount).
function renderTypingHero() {
  const wrap = document.createElement("div");
  wrap.className = "flex-1 flex items-center justify-center px-8 pointer-events-none";
  const text = document.createElement("div");
  text.className = "text-[72px] leading-[1.2] pb-3 font-thin tracking-tight lowercase shimmer-text whitespace-nowrap";
  text.textContent = "start typing";
  wrap.appendChild(text);
  return wrap;
}

// Single message line. No background, no border, no padding chrome — just
// thin tracking-tight text. Position is by grid column (user-directed
// 2026-05-22): in a 6-column grid, user messages live in cols 5-6 and
// agent messages in cols 2-5, giving the page a clear asymmetric
// conversation layout. Per-bubble dir="auto" flips Arabic content RTL.
//
// No `bubble-in` animation: the chat tree is rebuilt on every setState
// and a re-firing entrance animation produced visible flicker.
//
// Font size text-[28px] (= text-2xl + 4px). Agent messages render
// markdown (renderMarkdown above); user messages stay plain text.
function renderBubble(msg, isLastAgentDuringSend) {
  const line = document.createElement("div");
  line.setAttribute("dir", "auto");
  line.style.unicodeBidi = "plaintext";
  // text-align set per role below — user is hard right (hugs viewport
  // right edge regardless of content language), agent is language-aware.

  const base =
    "text-[28px] font-thin tracking-tight leading-snug break-words";

  if (msg.role === "user") {
    // User: cols 5-6 (the 5th column out of 6, plus col 6). Hard right
    // alignment so short messages anchor to the viewport's right edge
    // instead of sitting at the LEFT of cols 5-6 (which would be the
    // middle of the page).
    line.style.textAlign = "right";
    line.className = `col-start-5 col-span-1 text-ink-800 whitespace-pre-wrap ${base}`;
    line.textContent = msg.text;
    return line;
  }

  // Agent: cols 2-5 (starts at the 2nd column out of 6, spans 4).
  // text-align:start is language-aware — LTR English aligns left, RTL
  // Arabic replies auto-flip to right-aligned.
  line.style.textAlign = "start";
  const isError = msg.error === true;
  line.className = isError
    ? `col-start-2 col-span-4 text-urgent-600 ${base}`
    : `col-start-2 col-span-4 text-ink-900 ${base}`;

  // Typing caret only when this is the last agent line AND sending is
  // active AND there's no text yet.
  if (!msg.text && isLastAgentDuringSend) {
    line.innerHTML = `<span class="inline-block w-1 h-7 bg-brand-600 align-middle caret-blink"></span>`;
  } else if (msg.text && !isError) {
    line.innerHTML = renderMarkdown(msg.text);
  } else {
    line.textContent = msg.text || "";
  }
  return line;
}

// ── Main entry ──────────────────────────────────────────────────────────

export function renderAgentChat(agentId) {
  const def = getAgent(agentId);
  if (!def) {
    const oops = document.createElement("div");
    oops.className = "text-ink-500 text-sm p-6";
    oops.textContent = `Unknown agent: ${agentId}`;
    return oops;
  }

  const slice = ensureAgent(agentId);
  const isEmpty = slice.messages.length === 0;
  const needsMode = isEmpty && def.modes && !slice.mode;

  // Outer container — full width, full height (inherits parent's
  // h-[calc(100vh-68px)] via flex-1). No card chrome, no border, no shadow.
  const root = document.createElement("section");
  root.className = "relative w-full h-full flex flex-col";

  // "New conversation" — tiny minimalist text link top-right. Visible
  // only when there's content to wipe.
  if (slice.messages.length > 0 || slice.mode) {
    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className =
      "absolute top-3 right-4 text-xs text-ink-400 hover:text-ink-700 lowercase tracking-wide transition z-20";
    newBtn.textContent = "new conversation";
    newBtn.addEventListener("click", () => {
      if (confirm("Start a new conversation? The current chat will be cleared.")) {
        clearAgent(agentId);
      }
    });
    root.appendChild(newBtn);
  }

  // Body switches between three states: mode picker / typing-hero / messages.
  if (needsMode) {
    root.appendChild(renderModePicker(def, agentId));
  } else if (isEmpty) {
    root.appendChild(renderTypingHero());
  } else {
    const msgs = document.createElement("div");
    // 6-column grid spanning the FULL viewport width (user-directed
    // 2026-05-22 polish: "i meant on the whole page not chat area"). Each
    // message places itself with col-start/col-span (see renderBubble).
    // `content-start` packs rows at the top so a short conversation
    // doesn't stretch. No max-w cap — page-wide asymmetric layout.
    msgs.className =
      "flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 md:px-10 py-8 grid grid-cols-6 gap-y-5 content-start w-full";
    msgs.setAttribute("data-agent-msgs", agentId);
    for (let idx = 0; idx < slice.messages.length; idx++) {
      const m = slice.messages[idx];
      const isLastAgent = idx === slice.messages.length - 1 && m.role === "agent";
      msgs.appendChild(renderBubble(m, isLastAgent && slice.sending));
    }
    root.appendChild(msgs);

    requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
  }

  // Input row — minimal, single bottom border. Hidden during mode picker.
  if (!needsMode) {
    const inputRow = document.createElement("div");
    inputRow.className = "px-6 md:px-10 pb-6 pt-2";

    const inputBox = document.createElement("div");
    inputBox.className =
      "max-w-3xl mx-auto flex items-end gap-3 border-b border-ink-300 focus-within:border-brand-600 transition";

    const textarea = document.createElement("textarea");
    textarea.id = `agent-input-${agentId}`;  // stable id → main.js focus-restore preserves cursor
    textarea.rows = 1;
    // `normal-case` (default) — user-typed input preserves capitals
    // (user-directed 2026-05-22; the previous `lowercase` class CSS-
    // transformed the display, making it impossible to type names /
    // place names / Arabic correctly).
    textarea.className =
      "flex-1 resize-none bg-transparent border-0 outline-none focus:ring-0 py-3 text-xl font-thin tracking-tight placeholder:text-ink-400 placeholder:lowercase min-h-[44px] max-h-[180px]";
    textarea.placeholder =
      (def.placeholder && def.placeholder[slice.mode]) ||
      def.placeholder?.add ||
      "type your message…";
    textarea.disabled = slice.sending;

    const sendBtn = document.createElement("button");
    sendBtn.type = "button";
    sendBtn.id = `agent-send-${agentId}`;
    sendBtn.setAttribute("aria-label", "Send");
    sendBtn.className =
      "h-9 w-9 mb-2 rounded-full bg-brand-600 hover:bg-brand-700 text-white shrink-0 flex items-center justify-center transition opacity-40 disabled:cursor-not-allowed";
    sendBtn.innerHTML = SEND_SVG;
    sendBtn.disabled = true;

    const send = makeSendHandler(agentId, def, textarea);

    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 180) + "px";
      const hasContent = textarea.value.trim().length > 0;
      sendBtn.classList.toggle("opacity-40", !hasContent);
      sendBtn.disabled = !hasContent || slice.sending;
    });

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send();
      }
    });
    sendBtn.addEventListener("click", () => send());

    inputBox.append(textarea, sendBtn);
    inputRow.appendChild(inputBox);
    root.appendChild(inputRow);

    // Autofocus on mount — only if nothing else has focus (main.js's
    // focus-restore handles mid-conversation cursor preservation).
    if (!slice.sending) {
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) textarea.focus();
      });
    }
  }

  // Mobile virtual keyboard: scroll messages to bottom on viewport shrink.
  let onVvResize = null;
  if (window.visualViewport) {
    onVvResize = () => {
      const target = root.querySelector("[data-agent-msgs]");
      if (target) target.scrollTop = target.scrollHeight;
    };
    window.visualViewport.addEventListener("resize", onVvResize);
  }

  root.__cleanup = () => {
    if (onVvResize && window.visualViewport) {
      window.visualViewport.removeEventListener("resize", onVvResize);
    }
  };

  return root;
}
