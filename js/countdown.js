const subscribers = new Set();
let intervalId = null;

function tick() {
  const now = Date.now();
  for (const fn of subscribers) {
    try { fn(now); } catch { /* swallow */ }
  }
}

function start() {
  if (intervalId != null) return;
  intervalId = window.setInterval(() => {
    if (!document.hidden) tick();
  }, 1000);
}

function stop() {
  if (intervalId == null) return;
  clearInterval(intervalId);
  intervalId = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
  else if (subscribers.size > 0) { start(); tick(); }
});

export function subscribeCountdown(fn) {
  subscribers.add(fn);
  start();
  fn(Date.now());
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) stop();
  };
}
