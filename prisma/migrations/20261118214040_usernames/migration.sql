-- Short login names (e.g. "neeraj"), backfilled from the part of the email before "@".
ALTER TABLE "User" ADD COLUMN "username" TEXT;

UPDATE "User" u SET "username" = sub.uname
FROM (
  SELECT id,
         CASE WHEN rn = 1 THEN base ELSE base || rn::text END AS uname
  FROM (
    SELECT id,
           lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9._-]', '', 'g')) AS base,
           row_number() OVER (PARTITION BY lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9._-]', '', 'g')) ORDER BY "createdAt") AS rn
    FROM "User"
  ) t
) sub
WHERE u.id = sub.id;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
