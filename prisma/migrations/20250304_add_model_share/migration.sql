-- CreateTable
CREATE TABLE "ModelShares" (
    "id" VARCHAR(255) NOT NULL,
    "model_id" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelShares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelShares_token_key" ON "ModelShares"("token");

-- CreateIndex
CREATE INDEX "ModelShares_model_id_idx" ON "ModelShares"("model_id");

-- CreateIndex
CREATE INDEX "ModelShares_email_idx" ON "ModelShares"("email");

-- CreateIndex
CREATE INDEX "ModelShares_token_idx" ON "ModelShares"("token");

-- AddForeignKey
ALTER TABLE "ModelShares" ADD CONSTRAINT "ModelShares_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "Models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
