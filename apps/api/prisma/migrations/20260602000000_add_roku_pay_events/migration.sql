-- Add Roku Pay entitlement mapping and push notification audit rows.

ALTER TABLE "subscriptions"
ADD COLUMN "roku_customer_id" TEXT,
ADD COLUMN "roku_transaction_id" TEXT,
ADD COLUMN "roku_original_transaction_id" TEXT,
ADD COLUMN "roku_product_code" TEXT,
ADD COLUMN "roku_last_event_type" TEXT;

CREATE UNIQUE INDEX "subscriptions_roku_transaction_id_key"
ON "subscriptions"("roku_transaction_id");

CREATE INDEX "subscriptions_roku_customer_id_idx"
ON "subscriptions"("roku_customer_id");

CREATE INDEX "subscriptions_roku_original_transaction_id_idx"
ON "subscriptions"("roku_original_transaction_id");

CREATE TABLE "roku_pay_events" (
  "id" TEXT NOT NULL,
  "transaction_id" TEXT NOT NULL,
  "original_transaction_id" TEXT,
  "customer_id" TEXT,
  "product_code" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "error_message" TEXT,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),

  CONSTRAINT "roku_pay_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roku_pay_events_transaction_id_key"
ON "roku_pay_events"("transaction_id");

CREATE INDEX "roku_pay_events_customer_id_idx"
ON "roku_pay_events"("customer_id");

CREATE INDEX "roku_pay_events_original_transaction_id_idx"
ON "roku_pay_events"("original_transaction_id");
