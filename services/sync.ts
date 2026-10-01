export type SyncStatus = 'not-configured';
// Reserved boundary: future sync reads local repositories and writes remote changes.
export function getSyncStatus(): SyncStatus { return 'not-configured'; }
