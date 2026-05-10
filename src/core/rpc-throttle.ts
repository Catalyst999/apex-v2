let rateLimitedUntil = 0;
let ingestionPaused = false;

export async function checkRateLimit(): Promise<void> {
  if (Date.now() < rateLimitedUntil) {
    const waitMs = rateLimitedUntil - Date.now();
    console.warn(`[RPC] Rate limited - waiting ${waitMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

export function notifyRateLimit(): void {
  rateLimitedUntil = Date.now() + 60000;
  console.warn('[RPC] 429 detected - global cooldown 60s');
  pauseSignalIngestion();
  setTimeout(() => {
    resumeSignalIngestion();
  }, 60000);
}

export function pauseSignalIngestion(): void {
  ingestionPaused = true;
  console.warn('[RPC] Signal ingestion paused');
}

export function resumeSignalIngestion(): void {
  ingestionPaused = false;
  console.log('[RPC] Signal ingestion resumed');
}

export function isSignalIngestionPaused(): boolean {
  return ingestionPaused;
}
