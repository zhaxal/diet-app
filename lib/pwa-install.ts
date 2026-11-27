export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let initialized = false;
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedOverride = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function initPwaInstallListener(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installedOverride = true;
    deferredPrompt = null;
    notify();
  });
}

export function subscribePwaInstall(cb: () => void): () => void {
  initPwaInstallListener();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export function clearDeferredInstallPrompt(): void {
  deferredPrompt = null;
  notify();
}

export function getIsInstalled(): boolean {
  if (installedOverride) return true;
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function getIsIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
