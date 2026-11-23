export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Manjka element #${id}`);
  return el as T;
}

export function show(el: HTMLElement, on = true): void {
  el.classList.toggle('hidden', !on);
}

export function hide(el: HTMLElement): void {
  el.classList.add('hidden');
}

/** Ustvari element z besedilom (vedno textContent – nikoli innerHTML za uporabniške podatke). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
}

export function toast(msg: string): void {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = el('div', msg, 'toast');
  box.appendChild(t);
  while (box.children.length > 3) box.firstElementChild?.remove();
  window.setTimeout(() => t.remove(), 3600);
}

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
