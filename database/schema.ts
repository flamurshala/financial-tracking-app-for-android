import type { SQLiteDatabase } from 'expo-sqlite';
export interface Migration { version: number; name: string; up: (db: SQLiteDatabase) => Promise<void> }
