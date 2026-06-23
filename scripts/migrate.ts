import { openLocalDatabase, getLocalDatabasePath } from "../src/server/db/local";

const databasePath = getLocalDatabasePath();
const database = openLocalDatabase(databasePath);

database.close();
console.log(`Applied SQLite migrations to ${databasePath}`);
