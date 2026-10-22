-- ContractSnapshot.irBytes (P1.3, hostile-input review round 1).
--
-- The size in bytes of the canonical JSON a snapshot's content hash was taken
-- over — the number the recorder already computes to refuse a contract over
-- MAX_CONTRACT_BYTES. The starter kit and the per-solution OpenAPI add these
-- up for the snapshots they would render and refuse a document over its
-- budget BEFORE reading any IR, so a read never loads or renders more than a
-- stated bound however much was stored.
--
-- NOTHING STOPS ON DEPLOY: nullable, no default and no backfill, so the ALTER
-- is a catalogue change with no table rewrite. A row recorded before it stays
-- NULL and is measured when its IR is read; a build from before this
-- migration simply does not write the column.
--
-- Backout: ALTER TABLE "ContractSnapshot" DROP COLUMN "irBytes";

-- AlterTable
ALTER TABLE "ContractSnapshot" ADD COLUMN     "irBytes" INTEGER;
