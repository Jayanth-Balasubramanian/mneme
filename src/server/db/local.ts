import { Database } from "bun:sqlite";

import { SQLiteChapterSourceRepository } from "./chapterSources";
import { SQLiteGenerationPersistence } from "./generation";
import { migrateDatabase } from "./migrations";

export function getLocalDatabasePath(): string {
  return Bun.env.MNEME_DB_PATH ?? "mneme.sqlite";
}

export function openLocalDatabase(path = getLocalDatabasePath()): Database {
  const database = new Database(path);
  migrateDatabase(database);
  return database;
}

export function createLocalChapterSourceRepository(
  path = getLocalDatabasePath(),
): SQLiteChapterSourceRepository {
  return new SQLiteChapterSourceRepository(openLocalDatabase(path));
}

export function createLocalGenerationRepository(
  path = getLocalDatabasePath(),
): SQLiteGenerationPersistence {
  return new SQLiteGenerationPersistence(openLocalDatabase(path));
}
