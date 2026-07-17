/*
  Warnings:

  - You are about to drop the column `defaultSlaHours` on the `TicketCategory` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "slaTotalMinutes" INTEGER;

-- AlterTable
ALTER TABLE "TicketCategory" DROP COLUMN "defaultSlaHours",
ADD COLUMN     "defaultSlaMinutes" INTEGER;
