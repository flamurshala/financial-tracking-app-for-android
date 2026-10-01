export function reportError(context: string, error: unknown) {
  // Log a safe category, never raw service errors that may contain tokens or URLs.
  if (__DEV__) console.error(`[Finance] ${context}`, error instanceof Error ? error.name : 'UnknownError');
}
