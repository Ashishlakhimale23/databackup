/*
  Warnings:

  - You are about to drop the `_departmentCxo` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_departmentManager` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_departmentCxo" DROP CONSTRAINT "_departmentCxo_A_fkey";

-- DropForeignKey
ALTER TABLE "_departmentCxo" DROP CONSTRAINT "_departmentCxo_B_fkey";

-- DropForeignKey
ALTER TABLE "_departmentManager" DROP CONSTRAINT "_departmentManager_A_fkey";

-- DropForeignKey
ALTER TABLE "_departmentManager" DROP CONSTRAINT "_departmentManager_B_fkey";

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "cxoId" TEXT,
ADD COLUMN     "managerId" TEXT;

-- DropTable
DROP TABLE "_departmentCxo";

-- DropTable
DROP TABLE "_departmentManager";

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_cxoId_fkey" FOREIGN KEY ("cxoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
