export function skeletonGrid(count = 8) {
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4";
  for (let i = 0; i < count; i++) {
    const card = document.createElement("div");
    card.className = "rounded-xl bg-white shadow-sm overflow-hidden";
    card.innerHTML = `
      <div class="aspect-[16/10] bg-ink-100 shimmer"></div>
      <div class="p-4 space-y-3">
        <div class="h-4 w-3/4 bg-ink-100 rounded shimmer"></div>
        <div class="h-3 w-1/2 bg-ink-100 rounded shimmer"></div>
        <div class="flex items-center justify-between pt-2">
          <div class="h-6 w-20 bg-ink-100 rounded shimmer"></div>
          <div class="h-4 w-16 bg-ink-100 rounded shimmer"></div>
        </div>
      </div>`;
    grid.appendChild(card);
  }
  return grid;
}

export function skeletonStats() {
  const wrap = document.createElement("div");
  wrap.className = "grid grid-cols-2 md:grid-cols-4 gap-3";
  for (let i = 0; i < 4; i++) {
    const t = document.createElement("div");
    t.className = "rounded-xl bg-white shadow-sm p-4";
    t.innerHTML = `
      <div class="h-3 w-20 bg-ink-100 rounded shimmer mb-3"></div>
      <div class="h-7 w-16 bg-ink-100 rounded shimmer"></div>`;
    wrap.appendChild(t);
  }
  return wrap;
}
