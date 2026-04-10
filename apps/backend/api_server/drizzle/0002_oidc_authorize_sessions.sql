CREATE TABLE "oidc_authorize_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_authorize_sessions_token_hash_uq" ON "oidc_authorize_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "oidc_authorize_sessions_user_id_idx" ON "oidc_authorize_sessions" USING btree ("user_id");