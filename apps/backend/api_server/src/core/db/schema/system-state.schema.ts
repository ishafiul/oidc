import { pgTable, text, boolean } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { timestamps } from './common.schema';

export const systemState = pgTable('system_state', {
	id: text('id').primaryKey(),
	key: text('key').notNull().unique(),
	value: text('value'),
	isActive: boolean('is_active').notNull().default(true),
	...timestamps,
});

export const insertSystemStateSchema = createInsertSchema(systemState);
export const selectSystemStateSchema = createSelectSchema(systemState);
export type SelectSystemState = z.infer<typeof selectSystemStateSchema>;

