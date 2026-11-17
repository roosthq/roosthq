-- CreateTable
CREATE TABLE `Family` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `tokenName` VARCHAR(191) NOT NULL DEFAULT 'Tokens',
    `tokenIcon` VARCHAR(191) NOT NULL DEFAULT 'coins',
    `tokenValueUsd` DOUBLE NOT NULL DEFAULT 1,
    `choreWord` VARCHAR(191) NOT NULL DEFAULT 'Chore',
    `streakWheelMin` INTEGER NOT NULL DEFAULT 1,
    `streakWheelMax` INTEGER NOT NULL DEFAULT 5,
    `streakWheelGameType` VARCHAR(191) NULL,
    `disabledFeatures` JSON NOT NULL,
    `soundAssignments` JSON NOT NULL,
    `surpriseRewardDays` INTEGER NOT NULL DEFAULT 30,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InstanceSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'singleton',
    `updateChannel` VARCHAR(191) NOT NULL DEFAULT 'stable',
    `autoCheckEnabled` BOOLEAN NOT NULL DEFAULT false,
    `autoApplyEnabled` BOOLEAN NOT NULL DEFAULT false,
    `autoCheckHour` INTEGER NOT NULL DEFAULT 3,
    `lastCheckedAt` DATETIME(3) NULL,
    `lastKnownLatest` VARCHAR(191) NULL,
    `lastUpdateResult` VARCHAR(191) NULL,
    `lastUpdateAt` DATETIME(3) NULL,
    `previousCommit` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppSlotIcon` (
    `slotId` VARCHAR(191) NOT NULL,
    `iconKey` VARCHAR(191) NOT NULL,
    `iconSet` VARCHAR(191) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`slotId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FamilySlotIcon` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `slotId` VARCHAR(191) NOT NULL,
    `iconKey` VARCHAR(191) NOT NULL,
    `iconSet` VARCHAR(191) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FamilySlotIcon_familyId_idx`(`familyId`),
    UNIQUE INDEX `FamilySlotIcon_familyId_slotId_key`(`familyId`, `slotId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomSound` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `dataUri` LONGTEXT NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CustomSound_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('CHORE_PENDING', 'CHORE_APPROVED', 'CHORE_REJECTED', 'CHORE_MISSED', 'CHORE_EXCUSED', 'CHORE_DUE_SOON', 'STREAK_BONUS', 'REDEMPTION_REQUESTED', 'REDEMPTION_FULFILLED', 'REDEMPTION_REJECTED', 'PRIZE_SUGGESTED', 'CALENDAR_EVENT_ADDED', 'CALENDAR_EVENT_REMINDER', 'AWARD_GRANTED', 'MINI_GAME_GRANTED', 'GAME_PRIZE_WON', 'MEMBER_JOINED') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NULL,
    `link` VARCHAR(191) NULL,
    `refId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `readAt` DATETIME(3) NULL,

    INDEX `Notification_familyId_idx`(`familyId`),
    INDEX `Notification_userId_readAt_idx`(`userId`, `readAt`),
    INDEX `Notification_refId_idx`(`refId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PushSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `endpoint` TEXT NOT NULL,
    `endpointHash` VARCHAR(191) NOT NULL,
    `p256dh` TEXT NOT NULL,
    `auth` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PushSubscription_endpointHash_key`(`endpointHash`),
    INDEX `PushSubscription_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DisplayConfig` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NULL,
    `calendarIds` JSON NULL,
    `enabledFeatures` JSON NOT NULL,
    `theme` VARCHAR(191) NOT NULL DEFAULT 'light',
    `colorTheme` VARCHAR(191) NOT NULL DEFAULT 'meadow',
    `soundEffects` BOOLEAN NOT NULL DEFAULT true,
    `fontSize` VARCHAR(191) NOT NULL DEFAULT 'md',
    `onScreenKeyboard` BOOLEAN NOT NULL DEFAULT false,
    `screensaverMinutes` INTEGER NOT NULL DEFAULT 0,
    `weatherLocation` VARCHAR(191) NULL,
    `bedtimeStart` VARCHAR(191) NULL,
    `bedtimeEnd` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DisplayConfig_familyId_idx`(`familyId`),
    INDEX `DisplayConfig_locationId_idx`(`locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FamilyInvite` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'FAMILY_MANAGER', 'ADULT', 'KID') NOT NULL,
    `label` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `tokenEncrypted` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `acceptedAt` DATETIME(3) NULL,

    UNIQUE INDEX `FamilyInvite_tokenHash_key`(`tokenHash`),
    INDEX `FamilyInvite_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordResetToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DisplayToken` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `displayConfigId` VARCHAR(191) NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `DisplayToken_tokenHash_key`(`tokenHash`),
    INDEX `DisplayToken_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'FAMILY_MANAGER', 'ADULT', 'KID') NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `passwordHash` TEXT NULL,
    `username` VARCHAR(191) NULL,
    `pinHash` VARCHAR(191) NULL,
    `pinDisabled` BOOLEAN NOT NULL DEFAULT false,
    `avatar` TEXT NULL,
    `themePref` VARCHAR(191) NOT NULL DEFAULT 'light',
    `colorTheme` VARCHAR(191) NOT NULL DEFAULT 'meadow',
    `fontSizePref` VARCHAR(191) NOT NULL DEFAULT 'md',
    `soundEffects` BOOLEAN NOT NULL DEFAULT true,
    `simpleMode` BOOLEAN NOT NULL DEFAULT false,
    `kidView` BOOLEAN NOT NULL DEFAULT false,
    `allowanceTokens` INTEGER NOT NULL DEFAULT 0,
    `rejectionsGiven` INTEGER NOT NULL DEFAULT 0,
    `birthday` VARCHAR(191) NULL,
    `disabledPermissions` JSON NOT NULL,
    `lastCelebratedLevel` INTEGER NOT NULL DEFAULT 1,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `notifyByEmail` BOOLEAN NOT NULL DEFAULT false,
    `notifyPrefs` JSON NOT NULL,
    `tokensDisabled` BOOLEAN NOT NULL DEFAULT false,
    `bonusStreakFreezes` INTEGER NOT NULL DEFAULT 0,
    `presenceStatus` ENUM('HOME', 'AWAY', 'VACATION') NOT NULL DEFAULT 'HOME',
    `presenceLocationId` VARCHAR(191) NULL,
    `presenceUpdatedAt` DATETIME(3) NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    INDEX `User_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Location` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'UTC',

    INDEX `Location_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PresenceLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` ENUM('HOME', 'AWAY', 'VACATION') NOT NULL,
    `locationId` VARCHAR(191) NULL,
    `setById` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PresenceLog_userId_startedAt_idx`(`userId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserLocation` (
    `userId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`userId`, `locationId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GoogleAccount` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `googleSub` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `picture` TEXT NULL,
    `tokensEncrypted` TEXT NOT NULL,
    `needsReconnect` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GoogleAccount_googleSub_key`(`googleSub`),
    INDEX `GoogleAccount_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Calendar` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `googleAccountId` VARCHAR(191) NOT NULL,
    `googleCalendarId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NULL,

    INDEX `Calendar_familyId_idx`(`familyId`),
    UNIQUE INDEX `Calendar_familyId_googleCalendarId_key`(`familyId`, `googleCalendarId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CalendarLocationShare` (
    `calendarId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CalendarLocationShare_locationId_idx`(`locationId`),
    PRIMARY KEY (`calendarId`, `locationId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CalendarShare` (
    `calendarId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`calendarId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserCalendarColor` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `calendarId` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserCalendarColor_userId_calendarId_key`(`userId`, `calendarId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LocalCalendar` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NULL,
    `image` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LocalCalendar_familyId_idx`(`familyId`),
    INDEX `LocalCalendar_locationId_idx`(`locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LocalEvent` (
    `id` VARCHAR(191) NOT NULL,
    `localCalendarId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `location` VARCHAR(191) NULL,
    `allDay` BOOLEAN NOT NULL DEFAULT false,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `remindedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LocalEvent_localCalendarId_idx`(`localCalendarId`),
    INDEX `LocalEvent_startAt_idx`(`startAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HolidayEvent` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `ruleType` VARCHAR(191) NOT NULL,
    `month` INTEGER NULL,
    `day` INTEGER NULL,
    `weekday` INTEGER NULL,
    `ordinal` INTEGER NULL,
    `offsetDays` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DisplaySettings` (
    `familyId` VARCHAR(191) NOT NULL,
    `defaultCalendarIds` JSON NOT NULL,
    `enabledFeatures` JSON NOT NULL,
    `theme` VARCHAR(191) NOT NULL DEFAULT 'light',
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`familyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Chore` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `assignmentType` VARCHAR(191) NOT NULL DEFAULT 'SPECIFIC',
    `dayOfWeek` INTEGER NULL,
    `daysOfWeek` JSON NULL,
    `daysOfWeekMode` VARCHAR(191) NOT NULL DEFAULT 'EACH',
    `dueTime` VARCHAR(191) NULL,
    `locationId` VARCHAR(191) NULL,
    `tokenValue` INTEGER NOT NULL DEFAULT 0,
    `recurrenceRule` VARCHAR(191) NULL,
    `allowLate` BOOLEAN NOT NULL DEFAULT false,
    `allowSkip` BOOLEAN NOT NULL DEFAULT false,
    `autoApprove` BOOLEAN NOT NULL DEFAULT false,
    `requireProof` BOOLEAN NOT NULL DEFAULT false,
    `firstFinisherBonus` INTEGER NOT NULL DEFAULT 0,
    `streakFreezes` INTEGER NOT NULL DEFAULT 0,
    `latePenaltyPercent` INTEGER NOT NULL DEFAULT 25,
    `createdById` VARCHAR(191) NOT NULL,
    `currentStreak` INTEGER NOT NULL DEFAULT 0,
    `bestStreak` INTEGER NOT NULL DEFAULT 0,
    `streakGoal` INTEGER NULL,
    `streakBonusTokens` INTEGER NOT NULL DEFAULT 0,
    `useWheelForBonus` BOOLEAN NOT NULL DEFAULT false,
    `streakGameType` VARCHAR(191) NULL,
    `bonusExcluded` BOOLEAN NOT NULL DEFAULT false,

    INDEX `Chore_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChoreAssignee` (
    `choreId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`choreId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChoreChecklist` (
    `id` VARCHAR(191) NOT NULL,
    `choreId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `required` BOOLEAN NOT NULL DEFAULT true,

    INDEX `ChoreChecklist_choreId_idx`(`choreId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChoreInstance` (
    `id` VARCHAR(191) NOT NULL,
    `choreId` VARCHAR(191) NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `status` ENUM('OPEN', 'PENDING', 'APPROVED', 'REJECTED', 'MISSED', 'SKIPPED') NOT NULL DEFAULT 'OPEN',
    `completedAt` DATETIME(3) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `claimedByUserId` VARCHAR(191) NULL,
    `warnedThreshold` INTEGER NULL,
    `proofImage` TEXT NULL,
    `bonusGrantedAt` DATETIME(3) NULL,
    `bonusDismissedAt` DATETIME(3) NULL,

    INDEX `ChoreInstance_choreId_idx`(`choreId`),
    INDEX `ChoreInstance_status_idx`(`status`),
    UNIQUE INDEX `ChoreInstance_choreId_dueDate_key`(`choreId`, `dueDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChoreItemCheck` (
    `choreInstanceId` VARCHAR(191) NOT NULL,
    `checklistId` VARCHAR(191) NOT NULL,
    `checkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`choreInstanceId`, `checklistId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChoreBonusSettings` (
    `familyId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `poolJson` JSON NULL,
    `updatedById` VARCHAR(191) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`familyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TokenLedger` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `delta` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `type` ENUM('CHORE', 'MANUAL', 'PHYSICAL', 'REDEEM', 'STREAK_BONUS', 'AWARD', 'CO_VIEW', 'REBASE', 'MINI_GAME', 'MINI_GAME_PURCHASE', 'EDU_GAME', 'CHORE_BONUS') NOT NULL,
    `refId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tokenValueUsdAtCreation` DOUBLE NOT NULL DEFAULT 1,
    `dollarEquivalent` DOUBLE NOT NULL DEFAULT 0,

    INDEX `TokenLedger_userId_idx`(`userId`),
    INDEX `TokenLedger_refId_idx`(`refId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StreakFreezeLedger` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `delta` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `type` ENUM('MANUAL', 'AWARD', 'GAME', 'CHORE_USED') NOT NULL,
    `refId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StreakFreezeLedger_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TokenScaleEvent` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `oldTokenValueUsd` DOUBLE NOT NULL,
    `newTokenValueUsd` DOUBLE NOT NULL,
    `factor` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TokenScaleEvent_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Rule` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `targetUserId` VARCHAR(191) NULL,
    `text` TEXT NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Rule_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Award` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `icon` TEXT NULL,
    `description` TEXT NULL,
    `defaultTokenValue` INTEGER NOT NULL DEFAULT 0,
    `defaultStreakFreezeValue` INTEGER NOT NULL DEFAULT 0,
    `wheelMin` INTEGER NOT NULL DEFAULT 1,
    `wheelMax` INTEGER NOT NULL DEFAULT 0,
    `poolJson` JSON NULL,
    `poolGameType` VARCHAR(191) NULL,
    `poolSlotCount` INTEGER NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Award_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AwardGrant` (
    `id` VARCHAR(191) NOT NULL,
    `awardId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `grantedById` VARCHAR(191) NOT NULL,
    `note` TEXT NULL,
    `tokenValue` INTEGER NOT NULL DEFAULT 0,
    `streakFreezeValue` INTEGER NOT NULL DEFAULT 0,
    `seenAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AwardGrant_awardId_idx`(`awardId`),
    INDEX `AwardGrant_userId_seenAt_idx`(`userId`, `seenAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MiniGame` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `icon` TEXT NULL,
    `description` TEXT NULL,
    `gameType` VARCHAR(191) NOT NULL,
    `configJson` JSON NOT NULL,
    `poolJson` JSON NOT NULL,
    `loseTokenValue` INTEGER NOT NULL DEFAULT 0,
    `partialCreditEnabled` BOOLEAN NOT NULL DEFAULT false,
    `partialCreditPerStep` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MiniGame_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MiniGameGrant` (
    `id` VARCHAR(191) NOT NULL,
    `miniGameId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `grantedById` VARCHAR(191) NOT NULL,
    `configJson` JSON NOT NULL,
    `poolJson` JSON NOT NULL,
    `loseTokenValue` INTEGER NOT NULL,
    `partialCreditEnabled` BOOLEAN NOT NULL,
    `partialCreditPerStep` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `drawnResultJson` JSON NOT NULL,
    `startedAt` DATETIME(3) NULL,
    `won` BOOLEAN NULL,
    `stepsCompleted` INTEGER NULL,
    `totalSteps` INTEGER NULL,
    `timeTakenSeconds` INTEGER NULL,
    `tokensAwarded` INTEGER NULL,
    `prizeWonId` VARCHAR(191) NULL,
    `playedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MiniGameGrant_miniGameId_idx`(`miniGameId`),
    INDEX `MiniGameGrant_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublishedMiniGame` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `miniGameId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `purchaseLimitCount` INTEGER NOT NULL DEFAULT 1,
    `purchaseLimitPeriod` VARCHAR(191) NOT NULL DEFAULT 'DAY',

    INDEX `PublishedMiniGame_familyId_idx`(`familyId`),
    INDEX `PublishedMiniGame_miniGameId_idx`(`miniGameId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublishedMiniGameTier` (
    `id` VARCHAR(191) NOT NULL,
    `publishedGameId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `priceTokens` INTEGER NOT NULL,
    `configJson` JSON NOT NULL,
    `poolJson` JSON NOT NULL,
    `loseTokenValue` INTEGER NOT NULL DEFAULT 0,
    `partialCreditEnabled` BOOLEAN NOT NULL DEFAULT false,
    `partialCreditPerStep` INTEGER NOT NULL DEFAULT 0,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PublishedMiniGameTier_publishedGameId_idx`(`publishedGameId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MiniGamePurchase` (
    `id` VARCHAR(191) NOT NULL,
    `tierId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `pricePaid` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `drawnResultJson` JSON NOT NULL,
    `startedAt` DATETIME(3) NULL,
    `won` BOOLEAN NULL,
    `stepsCompleted` INTEGER NULL,
    `totalSteps` INTEGER NULL,
    `timeTakenSeconds` INTEGER NULL,
    `tokensAwarded` INTEGER NULL,
    `prizeWonId` VARCHAR(191) NULL,
    `playedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MiniGamePurchase_tierId_idx`(`tierId`),
    INDEX `MiniGamePurchase_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LearningGamesSettings` (
    `familyId` VARCHAR(191) NOT NULL,
    `tokensPerCorrect` INTEGER NOT NULL DEFAULT 1,
    `bonusPoolJson` JSON NOT NULL,
    `dailySessionCap` INTEGER NULL,
    `updatedById` VARCHAR(191) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`familyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserSubjectGrade` (
    `userId` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `grade` INTEGER NOT NULL,
    `setById` VARCHAR(191) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserSubjectGrade_setById_idx`(`setById`),
    PRIMARY KEY (`userId`, `subject`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EduQuestion` (
    `id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `grade` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `prompt` TEXT NOT NULL,
    `choicesJson` JSON NULL,
    `answer` TEXT NOT NULL,
    `tags` JSON NOT NULL,
    `visualJson` JSON NULL,
    `mediaJson` JSON NULL,
    `acceptedJson` JSON NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,

    INDEX `EduQuestion_subject_grade_idx`(`subject`, `grade`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EduQuestionProgress` (
    `userId` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `grade` INTEGER NOT NULL,
    `correct` BOOLEAN NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EduQuestionProgress_userId_subject_grade_idx`(`userId`, `subject`, `grade`),
    PRIMARY KEY (`userId`, `questionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EduMedia` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `mime` VARCHAR(191) NOT NULL,
    `data` LONGBLOB NOT NULL,
    `bytes` INTEGER NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `durationMs` INTEGER NULL,
    `questionId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EduMedia_questionId_idx`(`questionId`),
    INDEX `EduMedia_questionId_createdAt_idx`(`questionId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EduMonsterFriend` (
    `userId` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `grade` INTEGER NOT NULL,
    `befriendedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `subject`, `grade`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EduSession` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `grade` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'BLOCK_A',
    `roundsJson` JSON NOT NULL,
    `presentedJson` JSON NOT NULL,
    `practiceOnly` BOOLEAN NOT NULL DEFAULT false,
    `mode` VARCHAR(191) NOT NULL DEFAULT 'NORMAL',
    `redemptionJson` JSON NULL,
    `rev` INTEGER NOT NULL DEFAULT 0,
    `tokensAwarded` INTEGER NOT NULL DEFAULT 0,
    `allCorrect` BOOLEAN NOT NULL DEFAULT false,
    `bonusPoolJson` JSON NULL,
    `bonusWonPrizeId` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    INDEX `EduSession_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Prize` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `image` TEXT NULL,
    `imageCrop` JSON NULL,
    `url` TEXT NULL,
    `realPrice` DECIMAL(10, 2) NULL,
    `tokenCost` INTEGER NOT NULL,
    `type` ENUM('ITEM', 'EVENT', 'PASS') NOT NULL DEFAULT 'ITEM',
    `scope` ENUM('GLOBAL', 'SPECIFIC') NOT NULL DEFAULT 'GLOBAL',
    `locationId` VARCHAR(191) NULL,
    `repeatable` BOOLEAN NOT NULL DEFAULT true,
    `archived` BOOLEAN NOT NULL DEFAULT false,
    `visibility` VARCHAR(191) NOT NULL DEFAULT 'STORE',
    `createdById` VARCHAR(191) NULL,
    `suggested` BOOLEAN NOT NULL DEFAULT false,
    `suggestedById` VARCHAR(191) NULL,
    `requiresApproval` BOOLEAN NOT NULL DEFAULT true,
    `passUnitKind` VARCHAR(191) NULL,
    `passUnitMinutes` INTEGER NULL,
    `passUnitLabel` VARCHAR(191) NULL,
    `passUnitLabelPlural` VARCHAR(191) NULL,
    `passDailyLimit` INTEGER NULL,
    `passWeeklyLimit` INTEGER NULL,
    `passMonthlyLimit` INTEGER NULL,
    `passBlockedDaysOfWeek` JSON NULL,

    INDEX `Prize_familyId_idx`(`familyId`),
    INDEX `Prize_locationId_idx`(`locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PrizeAssignment` (
    `prizeId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`prizeId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Redemption` (
    `id` VARCHAR(191) NOT NULL,
    `prizeId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'FULFILLED') NOT NULL DEFAULT 'REQUESTED',
    `source` VARCHAR(191) NOT NULL DEFAULT 'PURCHASE',
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `approvedBy` VARCHAR(191) NULL,
    `usedAt` DATETIME(3) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,

    INDEX `Redemption_prizeId_idx`(`prizeId`),
    INDEX `Redemption_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MealPlan` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NULL,
    `date` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `notes` VARCHAR(191) NULL,
    `isEatingOut` BOOLEAN NOT NULL DEFAULT false,
    `eatOutPlaceId` VARCHAR(191) NULL,

    INDEX `MealPlan_familyId_date_idx`(`familyId`, `date`),
    INDEX `MealPlan_eatOutPlaceId_idx`(`eatOutPlaceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EatOutPlace` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `notes` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EatOutPlace_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GroceryItem` (
    `locationId` VARCHAR(191) NULL,
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `checked` BOOLEAN NOT NULL DEFAULT false,
    `addedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `checkedAt` DATETIME(3) NULL,

    INDEX `GroceryItem_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Countdown` (
    `locationId` VARCHAR(191) NULL,
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `emoji` VARCHAR(191) NOT NULL DEFAULT 'party-popper',
    `date` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Countdown_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Announcement` (
    `locationId` VARCHAR(191) NULL,
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,

    INDEX `Announcement_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WheelSpin` (
    `id` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `minTokens` INTEGER NOT NULL DEFAULT 1,
    `maxTokens` INTEGER NOT NULL DEFAULT 5,
    `style` VARCHAR(191) NOT NULL DEFAULT 'WHEEL',
    `poolJson` JSON NULL,
    `slotCount` INTEGER NULL,
    `wonKind` VARCHAR(191) NULL,
    `wonPrizeId` VARCHAR(191) NULL,
    `reason` VARCHAR(191) NOT NULL,
    `refId` VARCHAR(191) NULL,
    `amount` INTEGER NULL,
    `spunAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WheelSpin_userId_spunAt_idx`(`userId`, `spunAt`),
    INDEX `WheelSpin_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `actorName` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NULL,
    `targetLabel` VARCHAR(191) NULL,
    `detail` TEXT NULL,
    `familyId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    INDEX `AuditLog_targetId_familyId_idx`(`targetId`, `familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FamilySlotIcon` ADD CONSTRAINT `FamilySlotIcon_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomSound` ADD CONSTRAINT `CustomSound_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PushSubscription` ADD CONSTRAINT `PushSubscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DisplayConfig` ADD CONSTRAINT `DisplayConfig_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DisplayConfig` ADD CONSTRAINT `DisplayConfig_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FamilyInvite` ADD CONSTRAINT `FamilyInvite_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DisplayToken` ADD CONSTRAINT `DisplayToken_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DisplayToken` ADD CONSTRAINT `DisplayToken_displayConfigId_fkey` FOREIGN KEY (`displayConfigId`) REFERENCES `DisplayConfig`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_presenceLocationId_fkey` FOREIGN KEY (`presenceLocationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Location` ADD CONSTRAINT `Location_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PresenceLog` ADD CONSTRAINT `PresenceLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PresenceLog` ADD CONSTRAINT `PresenceLog_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PresenceLog` ADD CONSTRAINT `PresenceLog_setById_fkey` FOREIGN KEY (`setById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserLocation` ADD CONSTRAINT `UserLocation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserLocation` ADD CONSTRAINT `UserLocation_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoogleAccount` ADD CONSTRAINT `GoogleAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Calendar` ADD CONSTRAINT `Calendar_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Calendar` ADD CONSTRAINT `Calendar_googleAccountId_fkey` FOREIGN KEY (`googleAccountId`) REFERENCES `GoogleAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarLocationShare` ADD CONSTRAINT `CalendarLocationShare_calendarId_fkey` FOREIGN KEY (`calendarId`) REFERENCES `Calendar`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarLocationShare` ADD CONSTRAINT `CalendarLocationShare_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarShare` ADD CONSTRAINT `CalendarShare_calendarId_fkey` FOREIGN KEY (`calendarId`) REFERENCES `Calendar`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarShare` ADD CONSTRAINT `CalendarShare_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCalendarColor` ADD CONSTRAINT `UserCalendarColor_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LocalCalendar` ADD CONSTRAINT `LocalCalendar_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LocalCalendar` ADD CONSTRAINT `LocalCalendar_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LocalCalendar` ADD CONSTRAINT `LocalCalendar_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LocalEvent` ADD CONSTRAINT `LocalEvent_localCalendarId_fkey` FOREIGN KEY (`localCalendarId`) REFERENCES `LocalCalendar`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LocalEvent` ADD CONSTRAINT `LocalEvent_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DisplaySettings` ADD CONSTRAINT `DisplaySettings_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Chore` ADD CONSTRAINT `Chore_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Chore` ADD CONSTRAINT `Chore_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Chore` ADD CONSTRAINT `Chore_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChoreAssignee` ADD CONSTRAINT `ChoreAssignee_choreId_fkey` FOREIGN KEY (`choreId`) REFERENCES `Chore`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChoreAssignee` ADD CONSTRAINT `ChoreAssignee_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChoreChecklist` ADD CONSTRAINT `ChoreChecklist_choreId_fkey` FOREIGN KEY (`choreId`) REFERENCES `Chore`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChoreInstance` ADD CONSTRAINT `ChoreInstance_choreId_fkey` FOREIGN KEY (`choreId`) REFERENCES `Chore`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChoreInstance` ADD CONSTRAINT `ChoreInstance_approvedBy_fkey` FOREIGN KEY (`approvedBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChoreItemCheck` ADD CONSTRAINT `ChoreItemCheck_choreInstanceId_fkey` FOREIGN KEY (`choreInstanceId`) REFERENCES `ChoreInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChoreItemCheck` ADD CONSTRAINT `ChoreItemCheck_checklistId_fkey` FOREIGN KEY (`checklistId`) REFERENCES `ChoreChecklist`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChoreBonusSettings` ADD CONSTRAINT `ChoreBonusSettings_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChoreBonusSettings` ADD CONSTRAINT `ChoreBonusSettings_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TokenLedger` ADD CONSTRAINT `TokenLedger_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TokenLedger` ADD CONSTRAINT `TokenLedger_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StreakFreezeLedger` ADD CONSTRAINT `StreakFreezeLedger_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StreakFreezeLedger` ADD CONSTRAINT `StreakFreezeLedger_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TokenScaleEvent` ADD CONSTRAINT `TokenScaleEvent_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TokenScaleEvent` ADD CONSTRAINT `TokenScaleEvent_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rule` ADD CONSTRAINT `Rule_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rule` ADD CONSTRAINT `Rule_targetUserId_fkey` FOREIGN KEY (`targetUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rule` ADD CONSTRAINT `Rule_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Award` ADD CONSTRAINT `Award_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Award` ADD CONSTRAINT `Award_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AwardGrant` ADD CONSTRAINT `AwardGrant_awardId_fkey` FOREIGN KEY (`awardId`) REFERENCES `Award`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AwardGrant` ADD CONSTRAINT `AwardGrant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AwardGrant` ADD CONSTRAINT `AwardGrant_grantedById_fkey` FOREIGN KEY (`grantedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MiniGame` ADD CONSTRAINT `MiniGame_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MiniGame` ADD CONSTRAINT `MiniGame_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MiniGameGrant` ADD CONSTRAINT `MiniGameGrant_miniGameId_fkey` FOREIGN KEY (`miniGameId`) REFERENCES `MiniGame`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MiniGameGrant` ADD CONSTRAINT `MiniGameGrant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MiniGameGrant` ADD CONSTRAINT `MiniGameGrant_grantedById_fkey` FOREIGN KEY (`grantedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublishedMiniGame` ADD CONSTRAINT `PublishedMiniGame_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublishedMiniGame` ADD CONSTRAINT `PublishedMiniGame_miniGameId_fkey` FOREIGN KEY (`miniGameId`) REFERENCES `MiniGame`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublishedMiniGame` ADD CONSTRAINT `PublishedMiniGame_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublishedMiniGameTier` ADD CONSTRAINT `PublishedMiniGameTier_publishedGameId_fkey` FOREIGN KEY (`publishedGameId`) REFERENCES `PublishedMiniGame`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MiniGamePurchase` ADD CONSTRAINT `MiniGamePurchase_tierId_fkey` FOREIGN KEY (`tierId`) REFERENCES `PublishedMiniGameTier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MiniGamePurchase` ADD CONSTRAINT `MiniGamePurchase_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearningGamesSettings` ADD CONSTRAINT `LearningGamesSettings_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearningGamesSettings` ADD CONSTRAINT `LearningGamesSettings_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserSubjectGrade` ADD CONSTRAINT `UserSubjectGrade_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserSubjectGrade` ADD CONSTRAINT `UserSubjectGrade_setById_fkey` FOREIGN KEY (`setById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EduQuestionProgress` ADD CONSTRAINT `EduQuestionProgress_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EduQuestionProgress` ADD CONSTRAINT `EduQuestionProgress_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `EduQuestion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EduMedia` ADD CONSTRAINT `EduMedia_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `EduQuestion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EduMonsterFriend` ADD CONSTRAINT `EduMonsterFriend_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EduSession` ADD CONSTRAINT `EduSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Prize` ADD CONSTRAINT `Prize_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Prize` ADD CONSTRAINT `Prize_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Prize` ADD CONSTRAINT `Prize_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Prize` ADD CONSTRAINT `Prize_suggestedById_fkey` FOREIGN KEY (`suggestedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrizeAssignment` ADD CONSTRAINT `PrizeAssignment_prizeId_fkey` FOREIGN KEY (`prizeId`) REFERENCES `Prize`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrizeAssignment` ADD CONSTRAINT `PrizeAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Redemption` ADD CONSTRAINT `Redemption_prizeId_fkey` FOREIGN KEY (`prizeId`) REFERENCES `Prize`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Redemption` ADD CONSTRAINT `Redemption_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Redemption` ADD CONSTRAINT `Redemption_approvedBy_fkey` FOREIGN KEY (`approvedBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MealPlan` ADD CONSTRAINT `MealPlan_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MealPlan` ADD CONSTRAINT `MealPlan_eatOutPlaceId_fkey` FOREIGN KEY (`eatOutPlaceId`) REFERENCES `EatOutPlace`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EatOutPlace` ADD CONSTRAINT `EatOutPlace_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GroceryItem` ADD CONSTRAINT `GroceryItem_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Countdown` ADD CONSTRAINT `Countdown_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Announcement` ADD CONSTRAINT `Announcement_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WheelSpin` ADD CONSTRAINT `WheelSpin_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `Family`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WheelSpin` ADD CONSTRAINT `WheelSpin_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WheelSpin` ADD CONSTRAINT `WheelSpin_wonPrizeId_fkey` FOREIGN KEY (`wonPrizeId`) REFERENCES `Prize`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

