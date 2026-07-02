-- CreateTable
CREATE TABLE "Vacancy" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "url" TEXT,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "rawText" TEXT NOT NULL,
    "stack" TEXT[],
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "currency" TEXT,
    "remote" TEXT,
    "seniority" TEXT,
    "dedupHash" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'new',

    CONSTRAINT "Vacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "reasonsPro" TEXT[],
    "reasonsCon" TEXT[],
    "model" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeen" TIMESTAMP(3),

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vacancy_dedupHash_key" ON "Vacancy"("dedupHash");

-- CreateIndex
CREATE UNIQUE INDEX "Score_vacancyId_key" ON "Score"("vacancyId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_vacancyId_key" ON "Feedback"("vacancyId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_handle_key" ON "Channel"("handle");

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
