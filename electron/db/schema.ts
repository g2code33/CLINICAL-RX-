import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Generic JSON blob table. Each row holds one record of a given module type.
// This keeps the schema simple and forwards-compatible: the renderer defines
// its own typed shapes, and SQLite simply stores them as JSON strings keyed by
// a stable id. This is fine for a single-user offline-first learning app.
export const records = sqliteTable('records', {
  id: text('id').primaryKey(),
  module: text('module').notNull(), // day | disease | medicine | investigation | question | lesson | bundle | revision | profile | settings
  data: text('data').notNull(), // JSON serialized record
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type RecordRow = typeof records.$inferSelect;
