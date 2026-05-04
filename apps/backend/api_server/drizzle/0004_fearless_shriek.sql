CREATE TABLE "otp_attempt_events" (
	"id" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"outcome" text NOT NULL,
	"email_hash" text NOT NULL,
	"device_hash" text NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"window_started_at" timestamp NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"blocked_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DELETE FROM "otps";--> statement-breakpoint
ALTER TABLE "otps" ADD COLUMN "otp_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "otps" ADD COLUMN "failed_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "otps" ADD COLUMN "locked_until" timestamp;--> statement-breakpoint
ALTER TABLE "otps" ADD COLUMN "last_attempt_at" timestamp;--> statement-breakpoint
ALTER TABLE "otps" ADD COLUMN "last_request_at" timestamp;--> statement-breakpoint
CREATE INDEX "otp_attempt_events_purpose_created_at_idx" ON "otp_attempt_events" USING btree ("purpose","created_at");--> statement-breakpoint
CREATE INDEX "otp_attempt_events_email_created_at_idx" ON "otp_attempt_events" USING btree ("email_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "otp_rate_limits_scope_key_uq" ON "otp_rate_limits" USING btree ("scope","key_hash");--> statement-breakpoint
CREATE INDEX "otp_rate_limits_blocked_until_idx" ON "otp_rate_limits" USING btree ("blocked_until");--> statement-breakpoint
CREATE INDEX "otps_email_device_idx" ON "otps" USING btree ("email","deviceUuId");--> statement-breakpoint
ALTER TABLE "otps" DROP COLUMN "otp";
