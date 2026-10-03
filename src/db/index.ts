import { drizzle } from "drizzle-orm/postgres-js"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import * as schema from "./schema/auth.ts"

type EveDatabase = PostgresJsDatabase<typeof schema>

interface CloudflareDatabaseBindings {
  DATABASE_URL?: string
  HYPERDRIVE?: { connectionString?: string }
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("Configure o binding HYPERDRIVE ou DATABASE_URL no servidor.")
    this.name = "DatabaseNotConfiguredError"
  }
}

async function databaseConnectionString(): Promise<string> {
  try {
    const workers = await import("cloudflare:workers")
    const bindings = workers.env as unknown as CloudflareDatabaseBindings
    const url = bindings.HYPERDRIVE?.connectionString ?? bindings.DATABASE_URL
    if (url) return url
  } catch {
    // Local Node.js development does not provide the Workers bindings module.
  }

  const localUrl = process.env.DATABASE_URL?.trim()
  if (localUrl) return localUrl

  throw new DatabaseNotConfiguredError()
}

/**
 * Open a short-lived Drizzle client for one server operation. In Workers,
 * Hyperdrive owns the shared connection pool; credentials stay in bindings.
 */
export async function withDatabase<T>(
  operation: (database: EveDatabase) => Promise<T>,
): Promise<T> {
  const connectionString = await databaseConnectionString()
  const client = postgres(connectionString, {
    max: 1,
    fetch_types: false,
    prepare: true,
  })

  try {
    return await operation(drizzle(client, { schema }))
  } finally {
    await client.end({ timeout: 5 })
  }
}
