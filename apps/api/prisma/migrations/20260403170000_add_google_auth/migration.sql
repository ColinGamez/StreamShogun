ALTER TABLE "users"
ADD COLUMN "google_sub" TEXT,
ALTER COLUMN "password_hash" DROP NOT NULL;

CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");
