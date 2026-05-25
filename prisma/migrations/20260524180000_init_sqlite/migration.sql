-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telegram_id" BIGINT NOT NULL,
    "username" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "ban_reason" TEXT,
    "tos_accepted_at" DATETIME,
    "referral_code" TEXT,
    "referred_by_user_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "provider_payment_id" TEXT,
    "method" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL DEFAULT 0,
    "total_amount" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "payment_url" TEXT,
    "qr_image_url" TEXT,
    "qr_string" TEXT,
    "idempotency_key" TEXT,
    "raw_response" TEXT,
    "expired_at" DATETIME,
    "paid_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "deposits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_order_id" TEXT NOT NULL,
    "service_code" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "country_name" TEXT NOT NULL,
    "phone_number" TEXT,
    "provider_cost" BIGINT NOT NULL,
    "sell_price" BIGINT NOT NULL,
    "profit" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "otp_code" TEXT,
    "sms_text" TEXT,
    "cancel_reason" TEXT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sms_received_at" DATETIME,
    "completed_at" DATETIME,
    "expired_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "balance_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "balance_before" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "reference_type" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "note" TEXT,
    "admin_telegram_id" BIGINT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "balance_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "service_code" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "local_name" TEXT NOT NULL,
    "category" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_blacklisted" BOOLEAN NOT NULL DEFAULT false,
    "markup_type" TEXT NOT NULL DEFAULT 'flat',
    "markup_value" BIGINT NOT NULL DEFAULT 0,
    "min_profit" BIGINT NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "countries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "country_name" TEXT NOT NULL,
    "local_name" TEXT,
    "flag_emoji" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "provider_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "request_payload" TEXT,
    "response_body" TEXT,
    "status_code" INTEGER,
    "is_error" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "related_order_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "headers" TEXT,
    "payload" TEXT NOT NULL,
    "is_valid" BOOLEAN NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_reference_key" ON "deposits"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_idempotency_key_key" ON "deposits"("idempotency_key");

-- CreateIndex
CREATE INDEX "deposits_user_id_status_idx" ON "deposits"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "orders_provider_order_id_key" ON "orders"("provider_order_id");

-- CreateIndex
CREATE INDEX "orders_user_id_status_idx" ON "orders"("user_id", "status");

-- CreateIndex
CREATE INDEX "balance_logs_user_id_reference_type_reference_id_idx" ON "balance_logs"("user_id", "reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "services_provider_service_code_key" ON "services"("provider", "service_code");

-- CreateIndex
CREATE UNIQUE INDEX "countries_provider_country_code_key" ON "countries"("provider", "country_code");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

