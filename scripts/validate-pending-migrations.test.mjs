import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  main,
  mutationWarning,
  parseDisposableTarget,
  requireDisposableTargetAcknowledgement,
  validatePendingMigrations,
} from "./validate-pending-migrations.mjs";

const temporaryDirectories = [];

function migrationDirectory(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ferocity-migration-validator-"));
  temporaryDirectories.push(directory);
  for (const [file, sql] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, file), sql, "utf8");
  }
  return directory;
}

function acknowledgedEnvironment(connectionString) {
  const { targetIdentity } = parseDisposableTarget(connectionString);
  return {
    MIGRATION_VALIDATION_DATABASE_URL: connectionString,
    MIGRATION_VALIDATION_DISPOSABLE_ACK: `disposable:${targetIdentity}`,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("pending migration validator safety", () => {
  it("refuses a missing disposable-target acknowledgement before constructing a client", async () => {
    const Client = vi.fn();

    await expect(main({ environment: {}, Client })).rejects.toThrow("MIGRATION_VALIDATION_DATABASE_URL is required");

    expect(Client).not.toHaveBeenCalled();
  });

  it("refuses a mismatched acknowledgement before constructing a client without exposing credentials", async () => {
    const Client = vi.fn();
    const environment = {
      MIGRATION_VALIDATION_DATABASE_URL: "postgresql://migration-user:super-secret@preview.example:6543/ferocity_preview?sslmode=require",
      MIGRATION_VALIDATION_DISPOSABLE_ACK: "disposable:another.example/ferocity_preview",
    };

    let message = "";
    try {
      requireDisposableTargetAcknowledgement(environment);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("preview.example:6543/ferocity_preview#route=");
    expect(message).not.toContain("migration-user");
    expect(message).not.toContain("super-secret");
    expect(message).not.toContain("postgresql://");
    await expect(main({ environment, Client })).rejects.toThrow("Refusing migration validation");
    expect(Client).not.toHaveBeenCalled();
  });

  it.each(["host", "port", "user", "database", "dbname", "service", "options"])(
    "rejects the %s query-string routing override before constructing a client",
    async (parameter) => {
      const Client = vi.fn();
      const environment = {
        MIGRATION_VALIDATION_DATABASE_URL:
          `postgresql://user:secret@preview.example/ferocity_preview?${parameter}=other`,
        MIGRATION_VALIDATION_DISPOSABLE_ACK: "disposable:anything",
      };

      await expect(main({ environment, Client })).rejects.toThrow("unsupported or ambiguous query parameters");
      expect(Client).not.toHaveBeenCalled();
    },
  );

  it.each([
    "SSLMODE=disable",
    "sslmode=require&sslmode=require",
  ])("rejects the ambiguous %s query before constructing a client", async (query) => {
    const Client = vi.fn();
    const environment = {
      MIGRATION_VALIDATION_DATABASE_URL:
        `postgresql://user:secret@preview.example/ferocity_preview?${query}`,
      MIGRATION_VALIDATION_DISPOSABLE_ACK: "disposable:anything",
    };

    await expect(main({ environment, Client })).rejects.toThrow("unsupported or ambiguous query parameters");
    expect(Client).not.toHaveBeenCalled();
  });

  it("binds shared-pooler acknowledgement to the username routing identity", async () => {
    const Client = vi.fn();
    const first = acknowledgedEnvironment(
      "postgresql://postgres.project-one:secret@shared.pooler.example:6543/postgres?sslmode=require",
    );
    const secondUrl =
      "postgresql://postgres.project-two:secret@shared.pooler.example:6543/postgres?sslmode=require";
    const secondIdentity = parseDisposableTarget(secondUrl).targetIdentity;

    expect(first.MIGRATION_VALIDATION_DISPOSABLE_ACK).not.toBe(`disposable:${secondIdentity}`);
    await expect(main({
      environment: {
        MIGRATION_VALIDATION_DATABASE_URL: secondUrl,
        MIGRATION_VALIDATION_DISPOSABLE_ACK: first.MIGRATION_VALIDATION_DISPOSABLE_ACK,
      },
      Client,
    })).rejects.toThrow("Refusing migration validation");
    expect(Client).not.toHaveBeenCalled();
  });

  it("parses valid direct and shared-pooler URLs into explicit client routing config", () => {
    const direct = parseDisposableTarget("postgresql://direct_user:secret@db.example/preview?sslmode=require");
    const pooler = parseDisposableTarget(
      "postgresql://postgres.project-ref:secret@shared.pooler.example:6543/postgres?sslmode=require",
    );

    expect(direct.clientConfig).toEqual({
      host: "db.example",
      port: 5432,
      database: "preview",
      user: "direct_user",
      password: "secret",
      ssl: { rejectUnauthorized: false },
    });
    expect(pooler.clientConfig).toEqual({
      host: "shared.pooler.example",
      port: 6543,
      database: "postgres",
      user: "postgres.project-ref",
      password: "secret",
      ssl: { rejectUnauthorized: false },
    });
    expect(direct.targetIdentity).not.toContain("direct_user");
    expect(pooler.targetIdentity).not.toContain("project-ref");
  });

  it("allows an explicitly matching target in a mock and always closes the client", async () => {
    const client = {
      connect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValue({ rows: [] }),
      end: vi.fn().mockResolvedValue(undefined),
    };
    const Client = vi.fn(function FakeClient() {
      return client;
    });
    const logger = { log: vi.fn(), warn: vi.fn() };
    const environment = acknowledgedEnvironment(
      "postgresql://migration-user:super-secret@preview.example:6543/ferocity_preview?sslmode=require",
    );
    const directory = migrationDirectory({});

    await expect(main({ environment, Client, migrationDirectory: directory, logger }))
      .resolves.toEqual({ pending: [] });

    expect(Client).toHaveBeenCalledOnce();
    expect(Client).toHaveBeenCalledWith({
      host: "preview.example",
      port: 6543,
      database: "ferocity_preview",
      user: "migration-user",
      password: "super-secret",
      ssl: { rejectUnauthorized: false },
    });
    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.end).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("preview.example:6543/ferocity_preview"));
    expect(logger.warn.mock.calls.flat().join(" ")).not.toContain("super-secret");
    expect(logger.warn.mock.calls.flat().join(" ")).not.toContain("migration-user");
    expect(logger.warn.mock.calls.flat().join(" ")).not.toContain("postgresql://");
  });

  it("closes the client when history validation fails after connecting", async () => {
    const historyError = new Error("history unavailable");
    const client = {
      connect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockRejectedValueOnce(historyError),
      end: vi.fn().mockResolvedValue(undefined),
    };
    const Client = vi.fn(function FakeClient() {
      return client;
    });
    const environment = acknowledgedEnvironment(
      "postgresql://user:secret@preview.example/ferocity_preview",
    );

    await expect(main({ environment, Client, logger: { log: vi.fn(), warn: vi.fn() } }))
      .rejects.toBe(historyError);
    expect(client.end).toHaveBeenCalledOnce();
  });

  it("fails closed without starting a transaction when migration history cannot be read", async () => {
    const client = {
      query: vi.fn().mockRejectedValueOnce(new Error("history unavailable")),
    };
    const directory = migrationDirectory({ "001_example.sql": "select 1" });

    await expect(validatePendingMigrations({ client, migrationDirectory: directory }))
      .rejects.toThrow("history unavailable");

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith("select version from public.schema_migrations order by version");
    expect(client.query).not.toHaveBeenCalledWith("begin");
    expect(client.query).not.toHaveBeenCalledWith("select 1");
  });

  it("treats a readable empty history as intentionally empty and validates every migration with bounded timeouts", async () => {
    const client = {
      query: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValue({ rows: [] }),
    };
    const logger = { log: vi.fn() };
    const directory = migrationDirectory({
      "001_first.sql": "select 'first'",
      "002_second.sql": "select 'second'",
    });

    const result = await validatePendingMigrations({ client, migrationDirectory: directory, logger });

    expect(result.pending).toEqual(["001_first.sql", "002_second.sql"]);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      "select version from public.schema_migrations order by version",
      "begin",
      "set local lock_timeout = '5s'",
      "set local statement_timeout = '5min'",
      "select 'first'",
      "select 'second'",
      "rollback",
    ]);
    expect(logger.log).toHaveBeenLastCalledWith(expect.stringContaining("rollback cannot guarantee"));
    expect(mutationWarning).toContain("mutating, disposable-database-only");
  });

  it("preserves the original migration error when rollback also fails", async () => {
    const migrationError = new Error("migration failed");
    const client = {
      query: vi.fn(async (sql) => {
        if (sql === "select version from public.schema_migrations order by version") return { rows: [] };
        if (sql === "select broken") throw migrationError;
        if (sql === "rollback") throw new Error("rollback failed");
        return { rows: [] };
      }),
    };
    const directory = migrationDirectory({ "001_broken.sql": "select broken" });

    await expect(validatePendingMigrations({ client, migrationDirectory: directory }))
      .rejects.toBe(migrationError);

    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      "select version from public.schema_migrations order by version",
      "begin",
      "set local lock_timeout = '5s'",
      "set local statement_timeout = '5min'",
      "select broken",
      "rollback",
    ]);
  });
});
