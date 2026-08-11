// Curated award-catalog bundles - same "one click, ready to go" pattern as
// starterPacks.ts for chores. Every entry here is a badge, not a prize: it
// exists on a profile once earned, can be given again (repeatable-grant
// behavior the award system already supports), and any token value attached
// is a bonus that comes WITH the badge, not the reward itself.

export interface PackAward {
  name: string;
  icon: string;
  description: string;
  defaultTokenValue: number;
  wheelMin?: number;
  wheelMax?: number;
}

export interface AwardPack {
  id: string;
  label: string;
  theme: string;
  awards: PackAward[];
}

export const AWARD_PACKS: AwardPack[] = [
  {
    id: 'household',
    label: 'Household habits',
    theme: '🏠',
    awards: [
      { name: 'Tidy Streak', icon: '🧹', description: 'Kept your space clean all week without being asked.', defaultTokenValue: 3 },
      { name: 'Bed-Making Pro', icon: '🛏️', description: 'Made the bed every day this week.', defaultTokenValue: 2 },
      { name: 'Kitchen Helper', icon: '🍽️', description: 'Helped cook or clean up after a meal.', defaultTokenValue: 2 },
      { name: 'Pet Care Star', icon: '🐾', description: 'Took great care of a pet this week.', defaultTokenValue: 2 },
    ],
  },
  {
    id: 'learning',
    label: 'Learning & growth',
    theme: '📚',
    awards: [
      { name: 'Bookworm', icon: '📚', description: 'Finished a book.', defaultTokenValue: 3 },
      { name: 'Homework Hero', icon: '🧠', description: 'Finished homework without reminders all week.', defaultTokenValue: 3 },
      { name: 'Early Bird', icon: '🌅', description: 'Got ready for school or the day without being asked.', defaultTokenValue: 2 },
      { name: 'Goal Getter', icon: '🎯', description: 'Reached a personal goal you set for yourself.', defaultTokenValue: 5 },
    ],
  },
  {
    id: 'character',
    label: 'Character',
    theme: '🦸',
    awards: [
      { name: 'Kindness Award', icon: '🦸', description: 'Did something kind for a sibling or friend.', defaultTokenValue: 3 },
      { name: 'Helper of the Month', icon: '🌟', description: 'Went above and beyond helping around the house.', defaultTokenValue: 8 },
      { name: 'Team Player', icon: '🤝', description: 'Worked well with others on something.', defaultTokenValue: 3 },
      { name: 'Good Sport', icon: '🏅', description: 'Handled winning or losing with a good attitude.', defaultTokenValue: 3 },
    ],
  },
  {
    id: 'milestones',
    label: 'Milestones',
    theme: '🎉',
    awards: [
      { name: 'First Week Complete', icon: '🎉', description: 'Completed every chore for a full week.', defaultTokenValue: 5 },
      { name: 'Zero Missed Days', icon: '🔥', description: "Didn't miss a single day this month.", defaultTokenValue: 10 },
      { name: '30-Day Streak', icon: '📆', description: 'Kept a chore streak going for 30 days straight.', defaultTokenValue: 15 },
      { name: 'Leveled Up', icon: '⭐', description: 'Reached a new level.', defaultTokenValue: 0, wheelMin: 1, wheelMax: 5 },
    ],
  },
  {
    id: 'everyday',
    label: 'Everyday wins',
    theme: '🌟',
    awards: [
      { name: 'Great Attitude', icon: '😊', description: 'Kept a positive attitude through something hard.', defaultTokenValue: 2 },
      { name: 'Tried Something New', icon: '🌱', description: 'Stepped out of your comfort zone.', defaultTokenValue: 3 },
      { name: 'Extra Effort', icon: '💪', description: 'Put in extra effort on something, big or small.', defaultTokenValue: 2 },
      { name: 'Problem Solver', icon: '🧩', description: 'Figured out a tricky problem on your own.', defaultTokenValue: 3 },
    ],
  },
];
