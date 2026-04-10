DROP TABLE IF EXISTS "oidc_client_scope_sets";
DROP TABLE IF EXISTS "oidc_client_redirect_uris";
DROP TABLE IF EXISTS "oidc_scope_set_scopes";
DROP TABLE IF EXISTS "oidc_scope_sets";
DROP TABLE IF EXISTS "project_invitations";
DROP TABLE IF EXISTS "project_memberships";
DROP TABLE IF EXISTS "projects";
DROP TABLE IF EXISTS "oidc_authorization_codes";
DROP TABLE IF EXISTS "oidc_refresh_tokens";
DROP TABLE IF EXISTS "oidc_signing_keys";
DROP TABLE IF EXISTS "oidc_clients";
--> statement-breakpoint
CREATE TABLE "auths" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"deviceId" text NOT NULL,
	"lastRefresh" timestamp DEFAULT now(),
	"is_trusted" boolean DEFAULT false NOT NULL,
	"trusted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"fingerprint" text,
	"device_type" text,
	"os_name" text,
	"os_version" text,
	"device_model" text,
	"is_physical_device" text,
	"app_version" text,
	"ip_address" text,
	"city" text,
	"country_code" text,
	"isp" text,
	"colo" text,
	"longitude" text,
	"latitude" text,
	"timezone" text,
	"fcmToken" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "devices_fingerprint_unique" UNIQUE("fingerprint"),
	CONSTRAINT "devices_fcmToken_unique" UNIQUE("fcmToken")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"phone_number" text,
	"avatar_url" text,
	"is_banned" boolean DEFAULT false NOT NULL,
	"banned_at" timestamp,
	"banned_until" timestamp,
	"ban_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "otps" (
	"id" text PRIMARY KEY NOT NULL,
	"otp" integer NOT NULL,
	"email" text NOT NULL,
	"deviceUuId" text NOT NULL,
	"expiredAt" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_state" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "system_state_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by_user_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_uq" ON "projects" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "projects_is_active_idx" ON "projects" USING btree ("is_active");
--> statement-breakpoint
CREATE TABLE "project_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"invited_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "project_memberships_project_user_uq" ON "project_memberships" USING btree ("project_id","user_id");
--> statement-breakpoint
CREATE INDEX "project_memberships_project_role_idx" ON "project_memberships" USING btree ("project_id","role");
--> statement-breakpoint
CREATE INDEX "project_memberships_project_active_idx" ON "project_memberships" USING btree ("project_id","is_active");
--> statement-breakpoint
CREATE TABLE "project_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "project_invitations_token_hash_uq" ON "project_invitations" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "project_invitations_project_email_idx" ON "project_invitations" USING btree ("project_id","email");
--> statement-breakpoint
CREATE TABLE "oidc_scope_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_scope_sets_project_name_uq" ON "oidc_scope_sets" USING btree ("project_id","name");
--> statement-breakpoint
CREATE INDEX "oidc_scope_sets_project_active_idx" ON "oidc_scope_sets" USING btree ("project_id","is_active");
--> statement-breakpoint
CREATE TABLE "oidc_scope_set_scopes" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_set_id" text NOT NULL,
	"scope" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_scope_set_scopes_scope_set_scope_uq" ON "oidc_scope_set_scopes" USING btree ("scope_set_id","scope");
--> statement-breakpoint
CREATE INDEX "oidc_scope_set_scopes_scope_set_idx" ON "oidc_scope_set_scopes" USING btree ("scope_set_id");
--> statement-breakpoint
CREATE TABLE "oidc_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"name" text NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_clients_project_client_uq" ON "oidc_clients" USING btree ("project_id","client_id");
--> statement-breakpoint
CREATE INDEX "oidc_clients_project_active_idx" ON "oidc_clients" USING btree ("project_id","is_active");
--> statement-breakpoint
CREATE TABLE "oidc_client_redirect_uris" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_client_redirect_uris_client_uri_uq" ON "oidc_client_redirect_uris" USING btree ("client_id","redirect_uri");
--> statement-breakpoint
CREATE INDEX "oidc_client_redirect_uris_client_idx" ON "oidc_client_redirect_uris" USING btree ("client_id");
--> statement-breakpoint
CREATE TABLE "oidc_client_scope_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"scope_set_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_client_scope_sets_client_scope_set_uq" ON "oidc_client_scope_sets" USING btree ("client_id","scope_set_id");
--> statement-breakpoint
CREATE INDEX "oidc_client_scope_sets_client_idx" ON "oidc_client_scope_sets" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX "oidc_client_scope_sets_scope_set_idx" ON "oidc_client_scope_sets" USING btree ("scope_set_id");
--> statement-breakpoint
CREATE TABLE "oidc_authorization_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"code" text NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"scope" text NOT NULL,
	"nonce" text,
	"code_challenge" text,
	"code_challenge_method" text,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_authorization_codes_code_uq" ON "oidc_authorization_codes" USING btree ("code");
--> statement-breakpoint
CREATE INDEX "oidc_authorization_codes_project_client_idx" ON "oidc_authorization_codes" USING btree ("project_id","client_id");
--> statement-breakpoint
CREATE TABLE "oidc_refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"scope" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_refresh_tokens_token_hash_uq" ON "oidc_refresh_tokens" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "oidc_refresh_tokens_project_client_idx" ON "oidc_refresh_tokens" USING btree ("project_id","client_id");
--> statement-breakpoint
CREATE TABLE "oidc_signing_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"kid" text NOT NULL,
	"algorithm" text DEFAULT 'RS256' NOT NULL,
	"public_jwk" text NOT NULL,
	"private_jwk" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_signing_keys_project_kid_uq" ON "oidc_signing_keys" USING btree ("project_id","kid");
--> statement-breakpoint
CREATE INDEX "oidc_signing_keys_project_active_idx" ON "oidc_signing_keys" USING btree ("project_id","is_active");
