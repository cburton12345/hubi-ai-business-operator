import { createPostgresPool } from "@/lib/db/postgres";

const MIN_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 365;
const DEFAULT_BATCH_SIZE = 5_000;
const MAX_BATCH_SIZE = 50_000;
const DEFAULT_MAX_BATCHES = 20;
const MAX_BATCHES = 20;

export type OperatorTimelineRetentionOptions = {
  retainDays?: number;
  batchSize?: number;
  maxBatches?: number;
};

export type OperatorTimelineRetentionResult = {
  retainDays: number;
  batchSize: number;
  batches: number;
  deletedRows: number;
  exhausted: boolean;
  elapsedMs: number;
};

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) throw new Error("Retention option must be a finite number.");
  return Math.max(minimum, Math.min(Math.floor(value), maximum));
}

/**
 * Removes only the four migration-approved operational telemetry types. Each
 * database call commits independently so a timeout cannot roll back prior
 * batches or hold one large transaction open.
 */
export async function pruneOperatorTimelineEvents(
  options: OperatorTimelineRetentionOptions = {},
): Promise<OperatorTimelineRetentionResult> {
  const retainDays = boundedInteger(
    options.retainDays,
    MIN_RETENTION_DAYS,
    MIN_RETENTION_DAYS,
    MAX_RETENTION_DAYS,
  );
  const batchSize = boundedInteger(options.batchSize, DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE);
  const maxBatches = boundedInteger(options.maxBatches, DEFAULT_MAX_BATCHES, 1, MAX_BATCHES);
  const database = createPostgresPool();
  if (!database) throw new Error("Operator timeline retention database is unavailable.");

  const startedAt = Date.now();
  let deletedRows = 0;
  let batches = 0;
  let exhausted = false;

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result = await database.query<{ deleted_rows: number | string }>(
      "select public.prune_operator_timeline_events($1, $2) as deleted_rows",
      [retainDays, batchSize],
    );
    const rawDeletedRows = result.rows[0]?.deleted_rows;
    const currentDeletedRows = Number(rawDeletedRows);
    if (!Number.isSafeInteger(currentDeletedRows) || currentDeletedRows < 0 || currentDeletedRows > batchSize) {
      throw new Error("Operator timeline retention returned an invalid deletion count.");
    }

    batches += 1;
    deletedRows += currentDeletedRows;
    if (currentDeletedRows < batchSize) {
      exhausted = true;
      break;
    }
  }

  return {
    retainDays,
    batchSize,
    batches,
    deletedRows,
    exhausted,
    elapsedMs: Date.now() - startedAt,
  };
}
