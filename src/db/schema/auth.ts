import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

export const users = pgTable("eve_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailUnique: uniqueIndex("eve_users_email_unique").on(table.email),
}))

export const sessions = pgTable("eve_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  originHash: text("origin_hash").notNull(),
  userAgent: text("user_agent").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenUnique: uniqueIndex("eve_sessions_token_unique").on(table.tokenHash),
  userIndex: index("eve_sessions_user_idx").on(table.userId),
  expiryIndex: index("eve_sessions_expiry_idx").on(table.expiresAt),
}))

export const accessAttempts = pgTable("eve_access_attempts", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  account: text("account"),
  area: text("area"),
  originHash: text("origin_hash"),
  userAgent: text("user_agent"),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  createdAtIndex: index("eve_access_attempts_created_idx").on(table.createdAt),
  kindCreatedIndex: index("eve_access_attempts_kind_created_idx").on(table.kind, table.createdAt),
  originIndex: index("eve_access_attempts_origin_idx").on(table.originHash, table.createdAt),
}))
