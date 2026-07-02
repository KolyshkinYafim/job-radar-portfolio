-- AlterTable
ALTER TABLE "Score" ADD COLUMN     "location" TEXT,
ADD COLUMN     "redFlags" TEXT[] DEFAULT ARRAY[]::TEXT[];
