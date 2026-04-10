import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { timestamps } from './common.schema';

export const users = pgTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	name: text('name'),
	phoneNumber: text('phone_number'),
	avatarUrl: text('avatar_url'),
	isBanned: boolean('is_banned').notNull().default(false),
	bannedAt: timestamp('banned_at'),
	bannedUntil: timestamp('banned_until'),
	banReason: text('ban_reason'),
	...timestamps
});

export const insertUsersSchema = createInsertSchema(users);
export const selectUsersSchema = createSelectSchema(users);
export type SelectUser = z.infer<typeof selectUsersSchema>;

