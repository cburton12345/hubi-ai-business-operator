import fs from "node:fs";
import path from "node:path";

const migrationDirectory = path.join(process.cwd(), "supabase", "migrations");
const minimumMigrationNumber = 250;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createdPublicTables(sql) {
  const names = [];
  const pattern = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\."?([a-z_][a-z0-9_]*)"?/gi;
  for (const match of sql.matchAll(pattern)) names.push(match[1]);
  return [...new Set(names)];
}

function hasExplicitGrant(sql, tableName) {
  const table = `public\\.\"?${escapeRegExp(tableName)}\"?`;
  const pattern = new RegExp(
    `\\bgrant\\b[\\s\\S]{0,400}?\\bon\\s+(?:table\\s+)?${table}\\s+[\\s\\S]{0,200}?\\bto\\s+[\\s\\S]{0,120}?\\b(?:anon|authenticated|service_role)\\b`,
    "i",
  );
  return pattern.test(sql);
}

function hasExplicitRevoke(sql, tableName) {
  const table = `public\\.\"?${escapeRegExp(tableName)}\"?`;
  const pattern = new RegExp(
    `\\brevoke\\b[\\s\\S]{0,400}?\\bon\\s+(?:table\\s+)?${table}\\s+[\\s\\S]{0,200}?\\bfrom\\s+[\\s\\S]{0,120}?\\b(?:public|anon|authenticated|service_role)\\b`,
    "i",
  );
  return pattern.test(sql);
}

if (!fs.existsSync(migrationDirectory)) {
  throw new Error(`Migration directory not found: ${migrationDirectory}`);
}

const violations = [];
const migrationFiles = fs.readdirSync(migrationDirectory)
  .filter((file) => file.endsWith(".sql"))
  .filter((file) => {
    const number = Number.parseInt(file.match(/^(\d+)/)?.[1] ?? "", 10);
    return Number.isFinite(number) && number >= minimumMigrationNumber;
  })
  .sort((a, b) => a.localeCompare(b));

let checkedTableCount = 0;
for (const file of migrationFiles) {
  const sql = fs.readFileSync(path.join(migrationDirectory, file), "utf8");
  for (const tableName of createdPublicTables(sql)) {
    checkedTableCount += 1;
    if (!hasExplicitRevoke(sql, tableName)) {
      violations.push(`${file}: public.${tableName} has no explicit role revocation`);
    }
    if (!hasExplicitGrant(sql, tableName)) {
      violations.push(`${file}: public.${tableName} has no explicit Data API role grant`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(
    `Public Data API access declarations are incomplete:\n- ${violations.join("\n- ")}`,
  );
}

console.log(
  `Validated explicit Data API grants and revocations for ${checkedTableCount} public table(s) in migrations ${minimumMigrationNumber}+.`
);
