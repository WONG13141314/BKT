-- CreateEnum
CREATE TYPE "PlayerRole" AS ENUM ('PLAYER', 'ADMIN');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('PLAYING', 'FINISHED', 'ABANDONED');

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatar" TEXT NOT NULL DEFAULT 'tophat',
    "role" "PlayerRole" NOT NULL DEFAULT 'PLAYER',
    "username" TEXT,
    "pinHash" TEXT,
    "isClaimed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastery_states" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "pMastery" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "lastPracticedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mastery_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_attempts" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "gameId" TEXT,
    "difficulty" INTEGER NOT NULL,
    "context" TEXT NOT NULL,
    "questionData" JSONB NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "selectedAnswer" TEXT,
    "isCorrect" BOOLEAN NOT NULL,
    "timedOut" BOOLEAN NOT NULL DEFAULT false,
    "timeMs" INTEGER,
    "hintLevel" INTEGER NOT NULL DEFAULT 0,
    "pMasteryBefore" DOUBLE PRECISION NOT NULL,
    "pMasteryAfter" DOUBLE PRECISION NOT NULL,
    "predictedPCorrect" DOUBLE PRECISION NOT NULL,
    "opportunityIndex" INTEGER NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'PLAYING',
    "round" INTEGER NOT NULL DEFAULT 0,
    "maxRounds" INTEGER NOT NULL DEFAULT 12,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_players" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT,
    "name" TEXT NOT NULL,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT NOT NULL,
    "turnOrder" INTEGER NOT NULL,
    "finalCash" INTEGER NOT NULL DEFAULT 0,
    "finalNetWorth" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "totalCorrect" INTEGER NOT NULL DEFAULT 0,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "game_players_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_username_key" ON "players"("username");

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE UNIQUE INDEX "mastery_states_playerId_skillId_key" ON "mastery_states"("playerId", "skillId");

-- CreateIndex
CREATE INDEX "question_attempts_playerId_skillId_opportunityIndex_idx" ON "question_attempts"("playerId", "skillId", "opportunityIndex");

-- CreateIndex
CREATE INDEX "question_attempts_gameId_idx" ON "question_attempts"("gameId");

-- CreateIndex
CREATE INDEX "games_roomCode_idx" ON "games"("roomCode");

-- CreateIndex
CREATE UNIQUE INDEX "game_players_gameId_turnOrder_key" ON "game_players"("gameId", "turnOrder");

-- AddForeignKey
ALTER TABLE "mastery_states" ADD CONSTRAINT "mastery_states_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_states" ADD CONSTRAINT "mastery_states_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

