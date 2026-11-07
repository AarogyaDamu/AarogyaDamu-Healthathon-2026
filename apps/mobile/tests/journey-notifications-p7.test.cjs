const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = (relativePath) =>
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('Phase 7 — Mobile My Journey Dashboard implements consolidated progress overview & governance', () => {
  const journeySrc = source(path.join('app', '(tabs)', 'journey.tsx'));

  // 1. Tab Navigation: OVERVIEW, STAGES, DAILY, TRENDS, FOLLOW_UP
  assert.match(journeySrc, /activeTab === 'OVERVIEW'/);
  assert.match(journeySrc, /activeTab === 'STAGES'/);
  assert.match(journeySrc, /activeTab === 'DAILY'/);
  assert.match(journeySrc, /activeTab === 'TRENDS'/);
  assert.match(journeySrc, /activeTab === 'FOLLOW_UP'/);

  // 2. Health Progress Dashboard
  assert.match(journeySrc, /HEALTH PROGRESS DASHBOARD/);
  assert.match(journeySrc, /currentStageId/);
  assert.match(journeySrc, /Time-In-Range/);
  assert.match(journeySrc, /timeInRangePercentage/);

  // 3. Medication Adherence Breakdown
  assert.match(journeySrc, /Medication Adherence/);
  assert.match(journeySrc, /adherenceRatePercentage/);
  assert.match(journeySrc, /takenDosesCount/);
  assert.match(journeySrc, /skippedDosesCount/);
  assert.match(journeySrc, /unconfirmedDosesCount/);

  // 4. Care Tasks Breakdown
  assert.match(journeySrc, /Doctor Care Tasks/);
  assert.match(journeySrc, /completedTasksCount/);
  assert.match(journeySrc, /pendingTasksCount/);
  assert.match(journeySrc, /overdueTasksCount/);

  // 5. Validated Health Insights & Milestones
  assert.match(journeySrc, /Health Journey Insights/);
  assert.match(journeySrc, /Care Milestones/);
  assert.match(journeySrc, /nonCausationDisclaimer/);
  assert.match(journeySrc, /Discussion Points/);
});

test('Phase 7 — Mobile Notification Center implements category filtering, read states & routing', () => {
  const notifSrc = source(path.join('app', '(tabs)', 'notifications.tsx'));

  // 1. Category Filtering
  assert.match(notifSrc, /activeCategory === 'ALL'/);
  assert.match(notifSrc, /MEDICATION/);
  assert.match(notifSrc, /TASK/);
  assert.match(notifSrc, /APPOINTMENT/);
  assert.match(notifSrc, /CARE_PLAN/);
  assert.match(notifSrc, /HEALTH_LOGGING/);
  assert.match(notifSrc, /CONSULTATION/);
  assert.match(notifSrc, /MILESTONE/);

  // 2. Read State Management
  assert.match(notifSrc, /handleMarkAsRead/);
  assert.match(notifSrc, /handleMarkAllRead/);
  assert.match(notifSrc, /handleDeleteNotification/);
  assert.match(notifSrc, /unreadCount/);

  // 3. Navigation Routing
  assert.match(notifSrc, /handleNotificationPress/);
  assert.match(notifSrc, /\/\(tabs\)\/medications/);
  assert.match(notifSrc, /\/\(tabs\)\/tasks/);
  assert.match(notifSrc, /\/\(tabs\)\/appointments/);
  assert.match(notifSrc, /\/\(tabs\)\/journey/);
  assert.match(notifSrc, /\/\(tabs\)\/health/);

  // 4. Privacy Notice for Lock Screen
  assert.match(notifSrc, /Lock-screen previews suppress clinical details for privacy/);
});

test('Phase 7 — Mobile Profile implements granular notification preferences & quiet hours', () => {
  const profileSrc = source(path.join('app', '(tabs)', 'profile.tsx'));

  // 1. Preferences Interface
  assert.match(profileSrc, /taskReminders/);
  assert.match(profileSrc, /journeyMilestones/);
  assert.match(profileSrc, /consultationUpdates/);
  assert.match(profileSrc, /quietHoursEnabled/);
  assert.match(profileSrc, /quietHoursStart/);
  assert.match(profileSrc, /quietHoursEnd/);
  assert.match(profileSrc, /timezone/);

  // 2. UI Section
  assert.match(profileSrc, /Notification Preferences & Quiet Hours/);
  assert.match(profileSrc, /Device Push Notifications/);
  assert.match(profileSrc, /Quiet Hours \(Night Rest\)/);
  assert.match(profileSrc, /Quiet Window Active/);
  assert.match(profileSrc, /Urgent clinical safety alerts bypass quiet hours/);

  // 3. Push Token Registration & Logout Deactivation
  assert.match(profileSrc, /handleTogglePush/);
  assert.match(profileSrc, /registerPushToken/);
  assert.match(profileSrc, /unregisterPushToken/);
});

test('Phase 7 — Mobile API clients provide type-safe journey & notification integrations', () => {
  const journeyApiSrc = source(path.join('src', 'api', 'journey.ts'));
  const notifApiSrc = source(path.join('src', 'api', 'notifications.ts'));

  // Journey API
  assert.match(journeyApiSrc, /getSummary/);
  assert.match(journeyApiSrc, /getInsights/);
  assert.match(journeyApiSrc, /getMilestones/);
  assert.match(journeyApiSrc, /JourneyProgressSummary/);

  // Notifications API
  assert.match(notifApiSrc, /getNotifications/);
  assert.match(notifApiSrc, /markAsRead/);
  assert.match(notifApiSrc, /markAllAsRead/);
  assert.match(notifApiSrc, /deleteNotification/);
  assert.match(notifApiSrc, /registerPushToken/);
  assert.match(notifApiSrc, /unregisterPushToken/);
  assert.match(notifApiSrc, /updatePreferences/);
});
