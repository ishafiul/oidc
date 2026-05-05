import { pgTable, text, timestamp, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { timestamps } from './common.schema';

export const auths = pgTable('auths', {
	id: text('id').primaryKey(),
	userId: text('userId').notNull(),
	deviceId: text('deviceId').notNull(),
	lastRefresh: timestamp('lastRefresh').defaultNow(),
	isTrusted: boolean('is_trusted').notNull().default(false),
	trustedAt: timestamp('trusted_at'),
});

export const trustedDevices = pgTable('trusted_devices', {
	id: text('id').primaryKey(),
	userId: text('userId').notNull(),
	deviceId: text('deviceId').notNull(),
	trustedAt: timestamp('trusted_at').notNull().defaultNow(),
	...timestamps,
}, (table) => ({
	userDeviceUnique: uniqueIndex('trusted_devices_user_device_uq').on(table.userId, table.deviceId),
}));

export const insertAuthsSchema = createInsertSchema(auths);
export const selectAuthsSchema = createSelectSchema(auths);
export const insertTrustedDevicesSchema = createInsertSchema(trustedDevices);
export const selectTrustedDevicesSchema = createSelectSchema(trustedDevices);
export type SelectAuth = z.infer<typeof selectAuthsSchema>;
export type SelectTrustedDevice = z.infer<typeof selectTrustedDevicesSchema>;
