const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const SEED_PATH = path.join(DATA_DIR, "seed.json");

let dbCache = null;

function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.copyFileSync(SEED_PATH, DB_PATH);
  }
}

function ensureCollections(db) {
  db.adminSessions ||= [];
  db.shortlists ||= [];
  db.blocks ||= [];
}

function readDb() {
  ensureDatabase();
  if (!dbCache) {
    dbCache = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  }
  ensureCollections(dbCache);
  return dbCache;
}

function writeDb(db) {
  ensureCollections(db);
  dbCache = db;
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function resetDb() {
  dbCache = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
  writeDb(dbCache);
  return dbCache;
}

module.exports = {
  ensureCollections,
  ensureDatabase,
  readDb,
  resetDb,
  writeDb
};
