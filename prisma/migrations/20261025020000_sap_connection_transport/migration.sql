-- How the governed pipeline reaches a SAP connection (P0.14,
-- src/lib/governed/transport.ts): DIRECT or TWIN.
--
-- ADDITIVE. A new enum and a NOT NULL column with a default, so every
-- existing row reads DIRECT: the public internet through the platform's own
-- fetch, which is what every connection has always been. The running code
-- does not read the column, so this is safe ahead of the deploy, and a
-- rollback of the code leaves it unread. Nothing in the product writes TWIN
-- yet; the Tenant Twin (P1.6) is what will. On PostgreSQL 11 and later a
-- constant default is kept in the catalogue, so adding the column does not
-- rewrite the table.

-- CreateEnum
CREATE TYPE "SapTransport" AS ENUM ('DIRECT', 'TWIN');

-- AlterTable
ALTER TABLE "SapConnection" ADD COLUMN     "transport" "SapTransport" NOT NULL DEFAULT 'DIRECT';
