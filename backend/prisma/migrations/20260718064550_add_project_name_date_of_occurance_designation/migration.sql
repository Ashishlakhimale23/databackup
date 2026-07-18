-- CreateEnum
CREATE TYPE "Designation" AS ENUM ('CEO', 'COO', 'CXO', 'HOD', 'EMPLOYEE');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "designation" "Designation",
ADD COLUMN     "projectId" TEXT;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
