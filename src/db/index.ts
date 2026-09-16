import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"

import * as authSchema from "#/db/schema/auth.ts"

const schema = { ...authSchema }
export type EveDatabase = ReturnType<typeof drizzle<typeof schema>>

let client: ReturnType<typeof postgres> | null = null
let database: EveDatabase | null = null

function getDatabase(): EveDatabase {
  if (database) return database
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) throw new Error("DATABASE_URL não configurada.")
  client = postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  })
  database = drizzle(client, { schema })
  return database
}

export async function withDatabase<T>(operation: (database: EveDatabase) => Promise<T>): Promise<T> {
  return operation(getDatabase())
}

export async function closeDatabase(): Promise<void> {
  if (client) await client.end({ timeout: 5 })
  client = null
  database = null
}
