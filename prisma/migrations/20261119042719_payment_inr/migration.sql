-- Exact INR amount credited to the bank for each payment (foreign invoices are paid into an INR account).
ALTER TABLE "Payment" ADD COLUMN "amountInr" DECIMAL(16,2);
UPDATE "Payment" SET "amountInr" = round("amount" * "exchangeRate", 2);
