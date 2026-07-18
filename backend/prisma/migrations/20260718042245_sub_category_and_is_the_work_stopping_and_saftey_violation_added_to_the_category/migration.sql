-- AlterTable
ALTER TABLE "TicketCategory" ADD COLUMN     "isSafetyViolation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isWorkStopping" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subDepartmentId" TEXT;

-- CreateTable
CREATE TABLE "SubDepartment" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubDepartment_departmentId_name_key" ON "SubDepartment"("departmentId", "name");

-- AddForeignKey
ALTER TABLE "SubDepartment" ADD CONSTRAINT "SubDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketCategory" ADD CONSTRAINT "TicketCategory_subDepartmentId_fkey" FOREIGN KEY ("subDepartmentId") REFERENCES "SubDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
