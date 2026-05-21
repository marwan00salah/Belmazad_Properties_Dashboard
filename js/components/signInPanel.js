// GEN-03: shared sign-in panel, mounted by main.js whenever
// state.errorKind === "auth". Originally lived inside js/views/listings.js
// and was only consumed by that view — which meant non-listings routes
// (landing, admin, ai-agents) rendered their normal shell when the user
// wasn't signed in, leaving them with no clue what was wrong.
//
// Same auth flow as GEN-01: same-tab top-level navigation to the Worker's
// /auth-return route, which CF Access intercepts, authenticates against,
// then 302s back to `dest` (the current dashboard URL). Cookie lands in
// the jar; dashboard reloads; data fetch succeeds.

import { WORKER_URL } from "../config.js";

export function renderSignInPanel() {
  const wrap = document.createElement("div");
  wrap.className = "mx-auto max-w-md text-center bg-white rounded-2xl border border-ink-100 shadow-sm p-8 mt-8";

  // `window.location.href` carries the current hash so signing in from
  // (say) #/cms/create-user lands the user back on that exact page —
  // not the default landing — once the Access cookie is established.
  const signInUrl = `${WORKER_URL}auth-return?dest=${encodeURIComponent(window.location.href)}`;

  wrap.innerHTML = `
    <svg width="40" height="40" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="mx-auto mb-3 text-brand-700">
      <path fill-rule="evenodd" d="M10 1l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V4l7-3zm0 5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-3 6.5a3 3 0 016 0V13H7v-.5z" clip-rule="evenodd"/>
    </svg>
    <div class="text-ink-900 text-lg font-semibold mb-1">Sign in to access the dashboard</div>
    <p class="text-ink-500 text-sm mb-5">This dashboard is restricted to authorized Belmazad team members. Sign in with a permitted email address to continue.</p>
    <a id="signin-btn" href="${signInUrl}"
       class="inline-flex items-center gap-2 rounded-lg bg-brand-700 hover:bg-brand-800 text-white px-5 py-2 text-sm font-semibold shadow-sm transition">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M3 3a1 1 0 011-1h6a1 1 0 011 1v1a1 1 0 11-2 0H5v12h4v-1a1 1 0 112 0v1a1 1 0 01-1 1H4a1 1 0 01-1-1V3zm10.293 4.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L14.586 12H9a1 1 0 110-2h5.586l-1.293-1.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
      Sign in
    </a>
    <p class="text-ink-400 text-xs mt-3">You'll be redirected back here automatically after signing in.</p>`;

  return wrap;
}
