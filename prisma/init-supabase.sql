-- Run this in Supabase Dashboard → SQL Editor if prisma migrate fails with P1001 (can't reach DB from your network).
-- Creates the same schema as Prisma. Then start the app; run "prisma migrate dev" later from a network that can reach Supabase.

CREATE TABLE IF NOT EXISTS "Users" (
  "id" UUID NOT NULL PRIMARY KEY,
  "email" VARCHAR(255) UNIQUE,
  "displayName" VARCHAR(255),
  "photoUrl" VARCHAR(255),
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL
);

CREATE TABLE IF NOT EXISTS "Models" (
  "id" VARCHAR(255) NOT NULL PRIMARY KEY,
  "title" VARCHAR(255) NOT NULL,
  "description" VARCHAR(255),
  "status" VARCHAR(255) NOT NULL,
  "output_formats" JSONB,
  "output_urls" JSONB,
  "preview_url" VARCHAR(255),
  "user_id" UUID NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMP(6),
  "updated_at" TIMESTAMP(6),
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "filePath" VARCHAR(255) NOT NULL,
  "fileType" VARCHAR(255) NOT NULL
);
CREATE INDEX IF NOT EXISTS "Models_user_id_idx" ON "Models"("user_id");

CREATE TABLE IF NOT EXISTS "Jobs" (
  "id" VARCHAR(255) NOT NULL PRIMARY KEY,
  "status" VARCHAR(255) NOT NULL,
  "job_type" VARCHAR(255) NOT NULL,
  "api_handler" VARCHAR(255) NOT NULL,
  "priority" SMALLINT NOT NULL DEFAULT 5,
  "error_message" VARCHAR(255),
  "input_data" JSONB,
  "output_formats" JSONB,
  "created_at" TIMESTAMP(6),
  "updated_at" TIMESTAMP(6),
  "processing_started_at" TIMESTAMP(6),
  "processing_completed_at" TIMESTAMP(6),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "model_id" VARCHAR(255) REFERENCES "Models"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "Jobs_model_id_idx" ON "Jobs"("model_id");
CREATE INDEX IF NOT EXISTS "Jobs_user_id_idx" ON "Jobs"("user_id");
CREATE INDEX IF NOT EXISTS "Jobs_status_jobType_priority_idx" ON "Jobs"("status", "job_type", "priority");

CREATE TABLE IF NOT EXISTS "Comments" (
  "id" VARCHAR(255) NOT NULL PRIMARY KEY,
  "content" TEXT NOT NULL,
  "userId" UUID NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
  "modelId" VARCHAR(255) NOT NULL REFERENCES "Models"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS "Comments_modelId_idx" ON "Comments"("modelId");
CREATE INDEX IF NOT EXISTS "Comments_userId_idx" ON "Comments"("userId");

CREATE TABLE IF NOT EXISTS "Subscriptions" (
  "id" VARCHAR(255) NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL UNIQUE REFERENCES "Users"("id") ON DELETE CASCADE,
  "planType" VARCHAR(255) NOT NULL,
  "status" VARCHAR(255) NOT NULL,
  "startDate" TIMESTAMP(6) NOT NULL,
  "endDate" TIMESTAMP(6),
  "modelsCreated" INTEGER NOT NULL DEFAULT 0,
  "storageUsed" BIGINT NOT NULL DEFAULT 0,
  "modelLimit" INTEGER NOT NULL,
  "storageLimit" BIGINT NOT NULL,
  "autoRenew" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL
);
