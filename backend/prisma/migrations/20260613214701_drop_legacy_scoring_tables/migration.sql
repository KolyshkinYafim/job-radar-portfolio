-- DropForeignKey
ALTER TABLE "Application" DROP CONSTRAINT "Application_vacancyId_fkey";

-- DropForeignKey
ALTER TABLE "ApplicationEvent" DROP CONSTRAINT "ApplicationEvent_applicationId_fkey";

-- DropForeignKey
ALTER TABLE "Feedback" DROP CONSTRAINT "Feedback_vacancyId_fkey";

-- DropForeignKey
ALTER TABLE "Score" DROP CONSTRAINT "Score_vacancyId_fkey";

-- AlterTable
ALTER TABLE "Vacancy" DROP COLUMN "applicationStatus";

-- DropTable
DROP TABLE "Application";

-- DropTable
DROP TABLE "ApplicationEvent";

-- DropTable
DROP TABLE "Feedback";

-- DropTable
DROP TABLE "Score";

-- AddForeignKey
ALTER TABLE "UserMatch" ADD CONSTRAINT "UserMatch_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
