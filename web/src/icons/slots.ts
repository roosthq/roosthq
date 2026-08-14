// Named UI positions the user can independently re-pick an icon for (any
// catalog concept, any style - not just a style variant of the same
// concept). Distinct from icons/catalog.ts, which is the pool of PICKABLE
// icons: this is the list of PLACES those icons render. A slot id is needed
// per position (not just keying by the position's own default catalog key)
// because several unrelated slots share the same default concept today -
// e.g. the Nav Calendar tab, the kiosk's calendar-view toggle, and the
// Search "Events" section icon all default to 'calendar' - overriding one
// must not silently change the other two.
export interface IconSlot {
  id: string;
  label: string;
  defaultKey: string; // icons/catalog.ts key rendered when nothing overrides this slot
  category: string;
}

export const ICON_SLOTS: IconSlot[] = [
  // Navigation
  { id: 'nav.calendar', label: 'Nav: Calendar tab', defaultKey: 'calendar', category: 'Navigation' },
  { id: 'nav.chores', label: 'Nav: Chores tab', defaultKey: 'check-square', category: 'Navigation' },
  { id: 'nav.store', label: 'Nav: Store tab', defaultKey: 'shopping-bag', category: 'Navigation' },
  { id: 'nav.profiles', label: 'Nav: Profiles tab', defaultKey: 'user', category: 'Navigation' },

  // Role badges
  { id: 'role.owner', label: 'Role badge: Owner', defaultKey: 'crown', category: 'Roles' },
  { id: 'role.familyManager', label: 'Role badge: Family Manager', defaultKey: 'key', category: 'Roles' },
  { id: 'role.adult', label: 'Role badge: Adult', defaultKey: 'user', category: 'Roles' },
  { id: 'role.kid', label: 'Role badge: Kid', defaultKey: 'baby', category: 'Roles' },

  // Badges / stats
  { id: 'badge.level', label: 'Level badge', defaultKey: 'star', category: 'Badges' },
  { id: 'badge.streak', label: 'Streak badge', defaultKey: 'flame', category: 'Badges' },
  { id: 'badge.streakFreeze', label: 'Streak freeze badge', defaultKey: 'snowflake', category: 'Badges' },

  // Chores
  { id: 'chores.today', label: 'Chores: "Today" group label', defaultKey: 'star', category: 'Chores' },
  { id: 'chores.bonusWheel', label: 'Chores: bonus wheel banner', defaultKey: 'ferris-wheel', category: 'Chores' },
  { id: 'chores.packs', label: 'Chores: "Packs" button', defaultKey: 'package', category: 'Chores' },

  // Kiosk
  { id: 'kiosk.giveAward', label: 'Kiosk: "Give award" menu item', defaultKey: 'trophy', category: 'Kiosk' },
  { id: 'kiosk.calendarView', label: 'Kiosk: Calendar layout toggle', defaultKey: 'calendar', category: 'Kiosk' },
  { id: 'kiosk.tonight', label: 'Kiosk: Tonight (dinner) banner', defaultKey: 'utensils-crossed', category: 'Kiosk' },
  { id: 'kiosk.groceryCount', label: 'Kiosk: Grocery list count', defaultKey: 'shopping-cart', category: 'Kiosk' },
  { id: 'kiosk.rules', label: 'Kiosk: Rules quick link', defaultKey: 'clipboard-list', category: 'Kiosk' },
  { id: 'kiosk.stats', label: 'Kiosk: "My stats" quick link', defaultKey: 'emoji_1f4ca', category: 'Kiosk' },

  // Household
  { id: 'household.grocery', label: 'Household: Grocery list header', defaultKey: 'shopping-cart', category: 'Household' },
  { id: 'household.countdowns', label: 'Household: Countdowns header', defaultKey: 'hourglass', category: 'Household' },
  { id: 'household.announcements', label: 'Household: Announcements header', defaultKey: 'emoji_1f4e3', category: 'Household' },
  { id: 'household.dinnerMeal', label: 'Household: dinner meal icon', defaultKey: 'utensils-crossed', category: 'Household' },
  { id: 'household.dinnerRandom', label: 'Household: "surprise me" dice', defaultKey: 'dice-5', category: 'Household' },

  // Search
  { id: 'search.chores', label: 'Search: Chores section', defaultKey: 'check-square', category: 'Search' },
  { id: 'search.events', label: 'Search: Events section', defaultKey: 'calendar', category: 'Search' },
  { id: 'search.notifications', label: 'Search: Notifications section', defaultKey: 'bell', category: 'Search' },
  { id: 'search.rules', label: 'Search: Rules section', defaultKey: 'clipboard-list', category: 'Search' },
  { id: 'search.prizes', label: 'Search: Prizes section', defaultKey: 'shopping-bag', category: 'Search' },
  { id: 'search.awards', label: 'Search: Awards section', defaultKey: 'trophy', category: 'Search' },

  // Store
  { id: 'prize.item', label: 'Prize type: Item', defaultKey: 'gift', category: 'Store' },
  { id: 'prize.event', label: 'Prize type: Event', defaultKey: 'ticket', category: 'Store' },
  { id: 'store.awardOnly', label: 'Store: "award only" tag', defaultKey: 'gamepad-2', category: 'Store' },
  { id: 'store.purchasable', label: 'Store: "purchasable" tag', defaultKey: 'shopping-bag', category: 'Store' },

  // Notifications
  { id: 'notif.CHORE_PENDING', label: 'Notification: Chore pending', defaultKey: 'hourglass', category: 'Notifications' },
  { id: 'notif.CHORE_APPROVED', label: 'Notification: Chore approved', defaultKey: 'check-circle', category: 'Notifications' },
  { id: 'notif.CHORE_REJECTED', label: 'Notification: Chore rejected', defaultKey: 'emoji_21a9_fe0f', category: 'Notifications' },
  { id: 'notif.CHORE_MISSED', label: 'Notification: Chore missed', defaultKey: 'alert-triangle', category: 'Notifications' },
  { id: 'notif.CHORE_DUE_SOON', label: 'Notification: Chore due soon', defaultKey: 'alarm-clock', category: 'Notifications' },
  { id: 'notif.STREAK_BONUS', label: 'Notification: Streak bonus', defaultKey: 'flame', category: 'Notifications' },
  { id: 'notif.REDEMPTION_REQUESTED', label: 'Notification: Redemption requested', defaultKey: 'gift', category: 'Notifications' },
  { id: 'notif.REDEMPTION_FULFILLED', label: 'Notification: Redemption fulfilled', defaultKey: 'check-circle', category: 'Notifications' },
  { id: 'notif.REDEMPTION_REJECTED', label: 'Notification: Redemption rejected', defaultKey: 'emoji_21a9_fe0f', category: 'Notifications' },
  { id: 'notif.PRIZE_SUGGESTED', label: 'Notification: Prize suggested', defaultKey: 'lightbulb', category: 'Notifications' },
  { id: 'notif.CALENDAR_EVENT_ADDED', label: 'Notification: Event added', defaultKey: 'calendar', category: 'Notifications' },
  { id: 'notif.CALENDAR_EVENT_REMINDER', label: 'Notification: Event reminder', defaultKey: 'alarm-clock', category: 'Notifications' },
  { id: 'notif.AWARD_GRANTED', label: 'Notification: Award granted', defaultKey: 'trophy', category: 'Notifications' },
  { id: 'notif.GAME_PRIZE_WON', label: 'Notification: Game prize won', defaultKey: 'gift', category: 'Notifications' },

  // Reward-game types (rewardGames.ts GAME_TYPE_META)
  { id: 'game.WHEEL', label: 'Reward game: Wheel spin', defaultKey: 'ferris-wheel', category: 'Reward games' },
  { id: 'game.MYSTERY_BOX', label: 'Reward game: Mystery box', defaultKey: 'package-2', category: 'Reward games' },
  { id: 'game.SCRATCH_CARD', label: 'Reward game: Scratch card', defaultKey: 'tickets', category: 'Reward games' },
  { id: 'game.SLOT_MACHINE', label: 'Reward game: Slot machine', defaultKey: 'slot-machine', category: 'Reward games' },
  { id: 'game.DICE_ROLL', label: 'Reward game: Dice roll', defaultKey: 'dice-5', category: 'Reward games' },
  { id: 'game.COIN_FLIP', label: 'Reward game: Coin flip', defaultKey: 'coins', category: 'Reward games' },
  { id: 'game.GIFT_BOX', label: 'Reward game: Gift box', defaultKey: 'gift', category: 'Reward games' },
  { id: 'game.PLINKO', label: 'Reward game: Plinko', defaultKey: 'plinko-ball', category: 'Reward games' },
];

export const ICON_SLOT_IDS: string[] = ICON_SLOTS.map((s) => s.id);

export function findSlot(id: string): IconSlot | undefined {
  return ICON_SLOTS.find((s) => s.id === id);
}
