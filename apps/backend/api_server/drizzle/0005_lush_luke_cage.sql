CREATE TABLE "trusted_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"deviceId" text NOT NULL,
	"trusted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "trusted_devices_user_device_uq" ON "trusted_devices" USING btree ("userId","deviceId");
--> statement-breakpoint
INSERT INTO "trusted_devices" ("id", "userId", "deviceId", "trusted_at", "created_at", "updated_at")
SELECT DISTINCT ON ("userId", "deviceId")
	'auth-trust:' || md5("userId" || ':' || "deviceId"),
	"userId",
	"deviceId",
	COALESCE("trusted_at", now()),
	now(),
	now()
FROM "auths"
WHERE "is_trusted" = true
ON CONFLICT ("userId", "deviceId") DO NOTHING;
