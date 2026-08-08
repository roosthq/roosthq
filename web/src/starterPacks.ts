// Age-bucketed chore template bundles — one-tap setup for a new kid (or a
// new family, once this is open sourced). Each template maps straight onto
// the createChore body; the picker fills in assigneeUserIds.

export interface PackChore {
  title: string;
  tokenValue: number;
  recurrenceRule?: string; // '' = one-off, DAILY, WEEKLY
  daysOfWeek?: number[];
  checklist?: string[];
  autoApprove?: boolean;
  allowSkip?: boolean;
}

export interface StarterPack {
  id: string;
  label: string;
  ages: string;
  chores: PackChore[];
}

export const STARTER_PACKS: StarterPack[] = [
  {
    id: 'little',
    label: 'Little helpers',
    ages: '3-6',
    chores: [
      { title: 'Put toys away', tokenValue: 1, recurrenceRule: 'DAILY', autoApprove: true },
      { title: 'Brush teeth', tokenValue: 1, recurrenceRule: 'DAILY', autoApprove: true },
      { title: 'Feed the pet', tokenValue: 1, recurrenceRule: 'DAILY' },
      { title: 'Put dirty clothes in hamper', tokenValue: 1, recurrenceRule: 'DAILY', autoApprove: true },
    ],
  },
  {
    id: 'grade',
    label: 'Grade schooler',
    ages: '7-11',
    chores: [
      { title: 'Make bed', tokenValue: 1, recurrenceRule: 'DAILY', autoApprove: true },
      { title: 'Homework', tokenValue: 2, recurrenceRule: 'WEEKLY', daysOfWeek: [1, 2, 3, 4, 5], allowSkip: true },
      { title: 'Set the table', tokenValue: 1, recurrenceRule: 'DAILY' },
      { title: 'Take out trash', tokenValue: 2, recurrenceRule: 'WEEKLY', daysOfWeek: [1, 4] },
      {
        title: 'Clean bedroom',
        tokenValue: 3,
        recurrenceRule: 'WEEKLY',
        daysOfWeek: [6],
        checklist: ['Floor picked up', 'Bed made', 'Desk clear'],
      },
    ],
  },
  {
    id: 'teen',
    label: 'Teen',
    ages: '12+',
    chores: [
      { title: 'Do own laundry', tokenValue: 3, recurrenceRule: 'WEEKLY', daysOfWeek: [0] },
      { title: 'Dishes / load dishwasher', tokenValue: 2, recurrenceRule: 'DAILY' },
      { title: 'Mow the lawn', tokenValue: 5, recurrenceRule: 'WEEKLY', daysOfWeek: [6], allowSkip: true },
      { title: 'Homework', tokenValue: 2, recurrenceRule: 'WEEKLY', daysOfWeek: [1, 2, 3, 4, 5], allowSkip: true },
      { title: 'Cook dinner once a week', tokenValue: 5, recurrenceRule: 'WEEKLY', daysOfWeek: [3] },
    ],
  },
];
