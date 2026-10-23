/**
 * STORED JSON IS WRITTEN AS ITS TEXT (P1.3, structural hardening round 5).
 *
 * Round 4 made stored JSON cross into a worker as its text (render-input.ts)
 * and be read as `::text`, never as an object graph. Writes were left as
 * they were: Prisma serialises a Json column's value on the request thread,
 * at about 0.6 µs per JSON node, so storing a 4.5 MiB fixture body blocked
 * the event loop for 1.4-1.7 s and a 2 MiB contract IR for 110-280 ms — the
 * bound on what is stored did not bound the work of storing it.
 *
 * So a large JSON column is written here, from text the caller already has
 * (a worker's output, or one native JSON.stringify of a bounded value):
 * `UPDATE … SET "col" = $text::jsonb` — PostgreSQL parses it, and this
 * thread copies one string. Rows are still created by Prisma (its id
 * default, its unique-key errors), with a small placeholder in the column,
 * and the text is written in the same transaction (writeWithJsonText), so no
 * reader ever sees the placeholder.
 *
 * Only the tables and columns listed may be named (they are spliced into the
 * statement); every write names the row's organisation, as every read does.
 */

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

/** The JSON columns written as text, by table. */
const JSON_TEXT_COLUMNS = {
  ContractSnapshot: ["ir", "diff"],
  MockFixture: ["body"],
} as const;

export type JsonTextTable = keyof typeof JSON_TEXT_COLUMNS;
export type JsonTextColumn<T extends JsonTextTable> = (typeof JSON_TEXT_COLUMNS)[T][number];

/** What runs the statement: the client, or a transaction's. */
export interface RawExecutor {
  $executeRaw(query: Prisma.Sql): PromiseLike<number>;
}

/** The statement that sets these columns of one row from their text (null: SQL NULL). */
export function jsonTextUpdate<T extends JsonTextTable>(
  table: T,
  row: { id: string; organizationId: string },
  values: Partial<Record<JsonTextColumn<T>, string | null>>,
): Prisma.Sql {
  const allowed = JSON_TEXT_COLUMNS[table] as readonly string[];
  const sets = Object.entries(values as Record<string, string | null | undefined>)
    .filter(([column, text]) => text !== undefined && allowed.includes(column))
    .map(([column, text]) =>
      text === null ? Prisma.sql`${Prisma.raw(`"${column}"`)} = NULL` : Prisma.sql`${Prisma.raw(`"${column}"`)} = ${text}::jsonb`,
    );
  if (sets.length === 0) throw new Error("jsonTextUpdate: no column to set");
  return Prisma.sql`UPDATE ${Prisma.raw(`"${table}"`)} SET ${Prisma.join(sets, ", ")} WHERE "id" = ${row.id} AND "organizationId" = ${row.organizationId}`;
}

/** Set these columns of one row of the organisation from their text: the rows written (0 when it is gone). */
export async function setJsonText<T extends JsonTextTable>(
  db: RawExecutor,
  table: T,
  row: { id: string; organizationId: string },
  values: Partial<Record<JsonTextColumn<T>, string | null>>,
): Promise<number> {
  return db.$executeRaw(jsonTextUpdate(table, row, values));
}

/**
 * Create or update a row through Prisma — with a placeholder where the large
 * JSON goes — and write that JSON from its text, in one transaction. `write`
 * gets the transaction's client and answers the row (with its id); whatever
 * it throws (a unique key taken, a row gone) ends the transaction unwritten
 * and is thrown here.
 */
export async function writeWithJsonText<T extends JsonTextTable, R extends { id: string }>(
  table: T,
  organizationId: string,
  values: Partial<Record<JsonTextColumn<T>, string | null>>,
  write: (tx: Prisma.TransactionClient) => Promise<R>,
): Promise<R> {
  return prisma.$transaction(async (tx) => {
    const row = await write(tx);
    await setJsonText(tx, table, { id: row.id, organizationId }, values);
    return row;
  });
}

/** A Json column's placeholder until its text is written (writeWithJsonText): never read by anyone. */
export const JSON_TEXT_PLACEHOLDER = {} as Prisma.InputJsonObject;
