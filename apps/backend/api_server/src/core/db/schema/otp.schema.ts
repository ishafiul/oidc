import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { timestamps } from './common.schema';

export const otps = pgTable('otps', {
	id: text('id').primaryKey(),
	otpHash: text('otp_hash').notNull(),
	email: text('email').notNull(),
	deviceUuId: text('deviceUuId').notNull(),
	expiredAt: timestamp('expiredAt').defaultNow(),
	failedAttempts: integer('failed_attempts').notNull().default(0),
	lockedUntil: timestamp('locked_until'),
	lastAttemptAt: timestamp('last_attempt_at'),
	lastRequestAt: timestamp('last_request_at'),
	...timestamps,
}, (table) => ({
	emailDeviceIdx: index('otps_email_device_idx').on(table.email, table.deviceUuId),
}));

export const otpRateLimits = pgTable('otp_rate_limits', {
	id: text('id').primaryKey(),
	scope: text('scope').notNull(),
	keyHash: text('key_hash').notNull(),
	windowStartedAt: timestamp('window_started_at').notNull(),
	count: integer('count').notNull().default(0),
	blockedUntil: timestamp('blocked_until'),
	...timestamps,
}, (table) => ({
	scopeKeyUnique: uniqueIndex('otp_rate_limits_scope_key_uq').on(table.scope, table.keyHash),
	blockedUntilIdx: index('otp_rate_limits_blocked_until_idx').on(table.blockedUntil),
}));

export const otpAttemptEvents = pgTable('otp_attempt_events', {
	id: text('id').primaryKey(),
	purpose: text('purpose').notNull(),
	outcome: text('outcome').notNull(),
	emailHash: text('email_hash').notNull(),
	deviceHash: text('device_hash').notNull(),
	ipHash: text('ip_hash').notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
	purposeCreatedAtIdx: index('otp_attempt_events_purpose_created_at_idx').on(table.purpose, table.createdAt),
	emailCreatedAtIdx: index('otp_attempt_events_email_created_at_idx').on(table.emailHash, table.createdAt),
}));

export const insertOtpSchema = createInsertSchema(otps);
export const selectOtpSchema = createSelectSchema(otps);
export const insertOtpRateLimitSchema = createInsertSchema(otpRateLimits);
export const selectOtpRateLimitSchema = createSelectSchema(otpRateLimits);
export const insertOtpAttemptEventSchema = createInsertSchema(otpAttemptEvents);
export const selectOtpAttemptEventSchema = createSelectSchema(otpAttemptEvents);
