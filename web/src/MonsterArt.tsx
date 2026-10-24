import type { ReactNode } from 'react';
import type { EduSubject } from './api';

// Monster Den art (Learning games). One monster per (subject, grade) - 49 in
// all - drawn procedurally as flat-vector SVG from a small set of body
// archetypes (blocky, ghost, dino, tentacle...) plus a palette, so every
// monster is a real image without needing 49 hand-made assets. Names are
// deliberately recognizable pop-culture monsters (Casey's own instruction:
// open-source, kids connect with what they know); the drawings are our own
// stylized takes, not copies of any franchise artwork.

export type Archetype =
  | 'blocky'
  | 'creeper'
  | 'tall'
  | 'blob'
  | 'ghost'
  | 'mummy'
  | 'furry'
  | 'dino'
  | 'dragon'
  | 'robot'
  | 'cyclops'
  | 'statue'
  | 'tentacle'
  | 'bird'
  | 'plague'
  | 'horned'
  | 'vampire'
  | 'witch'
  | 'pumpkin'
  | 'horse';

export interface MonsterDef {
  name: string;
  arch: Archetype;
  body: string;
  accent: string;
  blurb: string;
}

const C = (name: string, arch: Archetype, body: string, accent: string, blurb: string): MonsterDef => ({ name, arch, body, accent, blurb });

// Indexed [subject][grade 0-6].
export const MONSTERS: Record<EduSubject, MonsterDef[]> = {
  MATH: [
    C('Zombie', 'blocky', '#6aa84f', '#3d6b2e', 'Slow, groany, and weirdly good at counting.'),
    C('Skeleton', 'blocky', '#e8e6df', '#8c8a80', 'Bone-afide math whiz with a bow.'),
    C('Creeper', 'creeper', '#5cb85c', '#2f7a2f', 'Hisses when it gets close. Sssssolve it!'),
    C('Enderman', 'tall', '#1d1d26', '#b04dff', 'Teleports in whenever you say its name.'),
    C('Slime', 'blob', '#7ed957', '#4aa332', 'Bouncy, squishy, splits into smaller slimes.'),
    C('Iron Golem', 'robot', '#b9bfc8', '#6e7681', 'Guards the village with a big heart.'),
    C('Ender Dragon', 'dragon', '#2a2438', '#c05cff', 'The final boss of the Block Realm.'),
  ],
  READING: [
    C('Bigfoot', 'furry', '#8b5e3c', '#5a3a22', 'Big feet, bigger bookshelf.'),
    C('Nessie', 'dino', '#4f9d8a', '#2c6b5c', 'Hides in the lake and reads by the shore.'),
    C('Mothman', 'bird', '#6b6f7a', '#e63946', 'Glowing red eyes, loves a good mystery.'),
    C('Slender Man', 'tall', '#2b2b2b', '#e8e8e8', 'Tall, quiet, and always in a suit.'),
    C('Chupacabra', 'dino', '#9aa45a', '#5d6a2a', 'Spiky back, sneaky steps.'),
    C('Jersey Devil', 'horned', '#7a3b3b', '#d9a441', 'Wings, hooves, and a very long tale.'),
    C('Kraken', 'tentacle', '#3f5fa8', '#9bb4ee', 'Eight arms for eight books at once.'),
  ],
  SCIENCE: [
    C('Godzilla', 'dino', '#4a5d4a', '#9cd1ff', 'King of the monsters, master of experiments.'),
    C('Mothra', 'bird', '#e8c16a', '#9a4fd1', 'Giant glowing wings of science.'),
    C('Rodan', 'bird', '#b5651d', '#f2c14e', 'Supersonic and super curious.'),
    C('King Kong', 'furry', '#3b3b3b', '#8a8a8a', 'Climbs towers to see how they work.'),
    C('Mechagodzilla', 'robot', '#9aa5b5', '#e63946', 'Built from pure engineering.'),
    C('Gamera', 'dino', '#6c8f3a', '#d9a441', 'Flies like a rocket, spins like a top.'),
    C('Cthulhu', 'tentacle', '#3c7a6a', '#b6e86a', 'Sleeps in the deep. Dreams of physics.'),
  ],
  SPELLING: [
    C('Ghost', 'ghost', '#f2f2f7', '#b8b8d0', 'Boo! Can you spell it?'),
    C('Pumpkin Head', 'pumpkin', '#f08a24', '#3d7a2a', 'Grins at every correct letter.'),
    C('Mummy', 'mummy', '#e9dfc7', '#b8a67a', 'All wrapped up in words.'),
    C('Witch', 'witch', '#6a4c93', '#7bc74d', 'Casts spells, the spelling kind.'),
    C('Werewolf', 'furry', '#7d7d8a', '#f2c14e', 'Howls at the full moon, and at typos.'),
    C('Vampire', 'vampire', '#2f2442', '#c1121f', 'Never forgets a silent letter.'),
    C('Frankenstein', 'blocky', '#79a86b', '#46604a', 'Stitched together from every word.'),
  ],
  LOGIC: [
    C('SCP-999', 'blob', '#f5a742', '#f7d08a', 'The friendly orange blob. Loves to cuddle.'),
    C('SCP-173', 'statue', '#a9a49a', '#c0392b', 'Only moves when nobody is looking.'),
    C('SCP-096', 'tall', '#d8d2c8', '#8a8478', 'Shy and tall. Please do not stare.'),
    C('SCP-049', 'plague', '#3a3a3a', '#d9c9a0', 'The doctor is in, with a very long beak.'),
    C('SCP-682', 'dino', '#7a5a3a', '#c0392b', 'Tough, stubborn, impossible to stump.'),
    C('SCP-035', 'statue', '#d9c9a0', '#6a4c93', 'A mask with a thousand riddles.'),
    C('SCP-939', 'dino', '#9b3d3d', '#e8d3a0', 'Mimics voices to join the puzzle.'),
  ],
  SOCIAL: [
    C('Pegasus', 'horse', '#f4f1ea', '#7fb7ff', 'Flies over every map ever made.'),
    C('Unicorn', 'horse', '#f9d6f0', '#c77dff', 'Sparkly and well traveled.'),
    C('Griffin', 'bird', '#c79a3b', '#7a4f1d', 'Half eagle, half lion, all explorer.'),
    C('Minotaur', 'horned', '#7a4a2a', '#d9c9a0', 'Knows every twist of the labyrinth.'),
    C('Cyclops', 'cyclops', '#8aa86a', '#5a7a3a', 'One big eye on history.'),
    C('Hydra', 'tentacle', '#5a9e6a', '#b6e86a', 'Lose a question, grow two more heads.'),
    C('Phoenix', 'bird', '#f26b21', '#ffd23f', 'Rises from the ashes of every old empire.'),
  ],
  BIOLOGY: [
    C('T. rex', 'dino', '#6b8e4e', '#3d5a2a', 'Tiny arms, huge brain.'),
    C('Triceratops', 'horned', '#8a9aa8', '#d9a441', 'Three horns, zero fear.'),
    C('Velociraptor', 'dino', '#b5704a', '#3d2a1a', 'Fast, clever, and feathery.'),
    C('Stegosaurus', 'dino', '#7a9e5a', '#e07a3a', 'Plates for style, spikes for fun.'),
    C('Spinosaurus', 'dino', '#4f8a8a', '#e07a3a', 'Sail on its back, fish on its mind.'),
    C('Pteranodon', 'bird', '#c75b5b', '#e8c16a', 'Soars high over the whole food chain.'),
    C('Mosasaurus', 'tentacle', '#3a6ea5', '#9bd1ff', 'Ruler of the ancient seas.'),
  ],
};

export function monsterFor(subject: EduSubject, grade: number): MonsterDef {
  return MONSTERS[subject][Math.max(0, Math.min(6, grade))];
}

// 1 = hatchling, 2 = grown, 3 = mega. Follows how much of the grade's bank
// the kid has mastered.
export function stageFor(masteredPct: number): 1 | 2 | 3 {
  return masteredPct >= 67 ? 3 : masteredPct >= 34 ? 2 : 1;
}

const INK = '#23202b';

function Eye({ x, y, r = 9, look = 0 }: { x: number; y: number; r?: number; look?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#fff" stroke={INK} strokeWidth="2" />
      <circle cx={x + look} cy={y + 1} r={r * 0.5} fill={INK} />
      <circle cx={x + look - r * 0.15} cy={y - r * 0.15} r={r * 0.18} fill="#fff" />
    </g>
  );
}

function Smile({ x, y, w = 24, teeth = false }: { x: number; y: number; w?: number; teeth?: boolean }) {
  return (
    <g>
      <path d={`M${x - w / 2} ${y} Q${x} ${y + w * 0.55} ${x + w / 2} ${y}`} fill={teeth ? '#fff' : 'none'} stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

function Body({ m }: { m: MonsterDef }): ReactNode {
  const { body, accent } = m;
  switch (m.arch) {
    case 'blocky':
      return (
        <g>
          <rect x="62" y="108" width="76" height="62" rx="4" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="56" y="112" width="14" height="52" rx="3" fill={accent} stroke={INK} strokeWidth="3" />
          <rect x="130" y="112" width="14" height="52" rx="3" fill={accent} stroke={INK} strokeWidth="3" />
          <rect x="68" y="168" width="26" height="22" fill={accent} stroke={INK} strokeWidth="3" />
          <rect x="106" y="168" width="26" height="22" fill={accent} stroke={INK} strokeWidth="3" />
          <rect x="56" y="42" width="88" height="70" rx="4" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="72" y="62" width="16" height="16" fill={INK} />
          <rect x="112" y="62" width="16" height="16" fill={INK} />
          <rect x="84" y="88" width="32" height="10" fill={INK} />
          <rect x="90" y="96" width="8" height="8" fill={INK} />
          <rect x="102" y="96" width="8" height="8" fill={INK} />
        </g>
      );
    case 'creeper':
      return (
        <g>
          <rect x="66" y="40" width="68" height="70" rx="3" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="70" y="106" width="60" height="50" rx="3" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="66" y="152" width="30" height="34" fill={accent} stroke={INK} strokeWidth="3" />
          <rect x="104" y="152" width="30" height="34" fill={accent} stroke={INK} strokeWidth="3" />
          <rect x="76" y="58" width="18" height="18" fill={INK} />
          <rect x="106" y="58" width="18" height="18" fill={INK} />
          <rect x="92" y="76" width="16" height="14" fill={INK} />
          <rect x="84" y="86" width="12" height="22" fill={INK} />
          <rect x="104" y="86" width="12" height="22" fill={INK} />
        </g>
      );
    case 'tall':
      return (
        <g>
          <rect x="84" y="20" width="32" height="42" rx="6" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="78" y="60" width="44" height="86" rx="5" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M78 66 L52 150 M122 66 L148 150" stroke={body} strokeWidth="10" strokeLinecap="round" />
          <path d="M78 66 L52 150 M122 66 L148 150" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.5" />
          <rect x="84" y="144" width="12" height="46" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="104" y="144" width="12" height="46" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="90" y="36" width="8" height="6" fill={accent} />
          <rect x="102" y="36" width="8" height="6" fill={accent} />
          <path d="M100 62 L94 100 L106 100 Z" fill={accent} opacity="0.55" />
        </g>
      );
    case 'blob':
      return (
        <g>
          <path d="M30 150 Q24 80 100 62 Q176 80 170 150 Q172 182 100 184 Q28 182 30 150 Z" fill={body} stroke={INK} strokeWidth="3" />
          <ellipse cx="72" cy="94" rx="16" ry="9" fill="#fff" opacity="0.35" />
          <circle cx="100" cy="120" r="5" fill={accent} opacity="0.7" />
          <circle cx="132" cy="140" r="7" fill={accent} opacity="0.5" />
          <circle cx="70" cy="150" r="6" fill={accent} opacity="0.5" />
        </g>
      );
    case 'ghost':
      return (
        <g>
          <path d="M44 170 L44 92 Q44 38 100 38 Q156 38 156 92 L156 170 L134 154 L116 172 L100 154 L84 172 L66 154 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <ellipse cx="60" cy="116" rx="9" ry="6" fill={accent} opacity="0.5" />
          <ellipse cx="140" cy="116" rx="9" ry="6" fill={accent} opacity="0.5" />
        </g>
      );
    case 'mummy':
      return (
        <g>
          <rect x="58" y="34" width="84" height="148" rx="30" fill={body} stroke={INK} strokeWidth="3" />
          {[52, 74, 96, 118, 140, 162].map((y, i) => (
            <path key={y} d={`M${60 + (i % 2) * 4} ${y} L${140 - (i % 2) * 4} ${y + 6}`} stroke={accent} strokeWidth="5" strokeLinecap="round" />
          ))}
          <rect x="72" y="62" width="56" height="20" rx="8" fill={INK} opacity="0.8" />
        </g>
      );
    case 'furry':
      return (
        <g>
          <path d="M52 188 Q40 110 70 92 L130 92 Q160 110 148 188 Z" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M60 112 q8 -8 16 0 q8 -8 16 0 q8 -8 16 0 q8 -8 16 0" stroke={accent} strokeWidth="3" fill="none" />
          <path d="M62 138 q8 -8 16 0 q8 -8 16 0 q8 -8 16 0" stroke={accent} strokeWidth="3" fill="none" />
          <circle cx="100" cy="64" r="34" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M72 42 L66 14 L88 34 Z M128 42 L134 14 L112 34 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <ellipse cx="100" cy="80" rx="18" ry="12" fill={accent} opacity="0.55" />
        </g>
      );
    case 'dino':
      // Upright two-legged dino facing right: big head, tiny arm, long tail,
      // a row of back spikes in the accent color.
      return (
        <g>
          <path d="M70 118 Q30 120 12 156 Q40 146 72 146 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <ellipse cx="102" cy="122" rx="52" ry="40" fill={body} stroke={INK} strokeWidth="3" />
          <ellipse cx="108" cy="134" rx="32" ry="22" fill={accent} opacity="0.35" />
          <rect x="84" y="150" width="20" height="32" rx="7" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="116" y="150" width="20" height="32" rx="7" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M80 182 h30 M112 182 h30" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <path d="M128 92 Q140 60 150 56 L186 62 Q198 74 190 90 L170 96 Q150 100 136 112 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M152 94 Q172 102 190 88" fill="none" stroke={INK} strokeWidth="2.5" />
          <path d="M140 118 l14 8 l-4 6" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M70 90 L78 70 L88 86 L98 64 L108 84 L120 62 L126 88" fill={accent} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        </g>
      );
    case 'dragon':
      return (
        <g>
          <path d="M20 90 Q50 40 92 78 L108 78 Q150 40 180 90 Q150 82 138 98 Q158 120 130 134 L118 180 L82 180 L70 134 Q42 120 62 98 Q50 82 20 90 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" opacity="0.85" />
          <path d="M70 76 Q100 36 130 76 L136 130 Q100 156 64 130 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M78 52 L70 26 L90 44 M122 52 L130 26 L110 44" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        </g>
      );
    case 'robot':
      return (
        <g>
          <rect x="58" y="96" width="84" height="70" rx="8" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="40" y="100" width="20" height="58" rx="6" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="140" y="100" width="20" height="58" rx="6" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="68" y="164" width="24" height="26" rx="4" fill={accent} stroke={INK} strokeWidth="3" />
          <rect x="108" y="164" width="24" height="26" rx="4" fill={accent} stroke={INK} strokeWidth="3" />
          <rect x="62" y="38" width="76" height="58" rx="10" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="94" y="22" width="12" height="16" fill={accent} stroke={INK} strokeWidth="2.5" />
          <circle cx="100" cy="20" r="6" fill={accent} stroke={INK} strokeWidth="2.5" />
          <circle cx="100" cy="132" r="12" fill={accent} stroke={INK} strokeWidth="3" />
        </g>
      );
    case 'cyclops':
      return (
        <g>
          <ellipse cx="100" cy="140" rx="50" ry="46" fill={body} stroke={INK} strokeWidth="3" />
          <circle cx="100" cy="82" r="46" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M58 44 L66 20 L82 40 M142 44 L134 20 L118 40" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <rect x="60" y="176" width="28" height="14" rx="4" fill={accent} stroke={INK} strokeWidth="3" />
          <rect x="112" y="176" width="28" height="14" rx="4" fill={accent} stroke={INK} strokeWidth="3" />
        </g>
      );
    case 'statue':
      return (
        <g>
          <rect x="62" y="104" width="76" height="76" rx="6" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="72" y="176" width="56" height="14" fill={accent} opacity="0.55" stroke={INK} strokeWidth="3" />
          <rect x="58" y="34" width="84" height="76" rx="8" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M70 60 L130 60 M70 92 L130 92" stroke={accent} strokeWidth="5" opacity="0.6" />
          <path d="M66 112 L58 150 M134 112 L142 150" stroke={body} strokeWidth="12" strokeLinecap="round" />
        </g>
      );
    case 'tentacle':
      return (
        <g>
          {[40, 62, 84, 116, 138, 160].map((x, i) => (
            <path key={x} d={`M${x} 118 Q${x + (i % 2 ? 16 : -16)} 150 ${x} 176 Q${x - 8} 190 ${x + (i % 2 ? 10 : -10)} 188`} stroke={body} strokeWidth="14" fill="none" strokeLinecap="round" />
          ))}
          {[40, 62, 84, 116, 138, 160].map((x, i) => (
            <path key={`o${x}`} d={`M${x} 118 Q${x + (i % 2 ? 16 : -16)} 150 ${x} 176 Q${x - 8} 190 ${x + (i % 2 ? 10 : -10)} 188`} stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.35" />
          ))}
          <path d="M34 112 Q34 30 100 30 Q166 30 166 112 Q166 130 100 130 Q34 130 34 112 Z" fill={body} stroke={INK} strokeWidth="3" />
          <circle cx="72" cy="52" r="5" fill={accent} opacity="0.7" />
          <circle cx="132" cy="60" r="7" fill={accent} opacity="0.7" />
        </g>
      );
    case 'bird':
      return (
        <g>
          <path d="M20 70 Q60 30 98 88 L102 88 Q140 30 180 70 Q150 82 140 110 Q120 130 100 150 Q80 130 60 110 Q50 82 20 70 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <ellipse cx="100" cy="112" rx="32" ry="48" fill={body} stroke={INK} strokeWidth="3" />
          <circle cx="100" cy="66" r="26" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M92 74 L100 92 L108 74 Z" fill={accent} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M92 156 L88 184 M108 156 L112 184" stroke={INK} strokeWidth="5" strokeLinecap="round" />
        </g>
      );
    case 'plague':
      return (
        <g>
          <path d="M64 188 L70 100 Q100 80 130 100 L136 188 Z" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="44" y="90" width="112" height="14" rx="6" fill={INK} />
          <path d="M72 90 Q72 28 100 28 Q128 28 128 90 Z" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M88 58 Q100 112 112 58 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        </g>
      );
    case 'horned':
      return (
        <g>
          <path d="M48 188 Q40 110 72 98 L128 98 Q160 110 152 188 Z" fill={body} stroke={INK} strokeWidth="3" />
          <circle cx="100" cy="66" r="36" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M70 46 Q40 38 34 10 Q60 14 80 36 M130 46 Q160 38 166 10 Q140 14 120 36" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <ellipse cx="100" cy="84" rx="20" ry="13" fill={accent} opacity="0.5" />
          <path d="M62 100 Q20 110 24 150 Q50 130 70 130 M138 100 Q180 110 176 150 Q150 130 130 130" fill={accent} stroke={INK} strokeWidth="2.5" opacity="0.8" />
        </g>
      );
    case 'vampire':
      return (
        <g>
          <path d="M20 188 Q34 90 82 84 L118 84 Q166 90 180 188 Z" fill={accent} stroke={INK} strokeWidth="3" />
          <path d="M70 188 L82 100 L118 100 L130 188 Z" fill={body} stroke={INK} strokeWidth="3" />
          <circle cx="100" cy="62" r="32" fill="#efe6dc" stroke={INK} strokeWidth="3" />
          <path d="M68 52 Q100 20 132 52 Q116 40 100 52 Q84 40 68 52 Z" fill={body} stroke={INK} strokeWidth="3" />
        </g>
      );
    case 'witch':
      return (
        <g>
          <path d="M62 188 L72 108 Q100 92 128 108 L138 188 Z" fill={body} stroke={INK} strokeWidth="3" />
          <circle cx="100" cy="82" r="30" fill={accent} stroke={INK} strokeWidth="3" />
          <ellipse cx="100" cy="56" rx="54" ry="10" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M72 54 L100 4 L128 54 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <rect x="76" y="46" width="48" height="8" fill="#f2c14e" />
        </g>
      );
    case 'pumpkin':
      return (
        <g>
          <ellipse cx="100" cy="116" rx="72" ry="62" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M100 54 Q64 70 62 116 Q64 162 100 178 M100 54 Q136 70 138 116 Q136 162 100 178" fill="none" stroke={INK} strokeWidth="2" opacity="0.4" />
          <rect x="94" y="34" width="12" height="26" rx="4" fill={accent} stroke={INK} strokeWidth="3" />
          <path d="M70 100 L84 84 L98 100 Z M102 100 L116 84 L130 100 Z" fill={INK} />
          <path d="M66 130 L80 150 L92 134 L104 152 L118 134 L130 150 L136 130 Z" fill={INK} />
        </g>
      );
    case 'horse': {
      const winged = m.name === 'Pegasus';
      return (
        <g>
          {winged && <path d="M84 104 Q40 40 14 70 Q36 74 50 96 Q30 90 22 108 Q56 104 84 118 Z" fill="#fff" stroke={INK} strokeWidth="3" strokeLinejoin="round" />}
          <path d="M52 118 Q22 124 20 164 Q36 140 58 138 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          {[62, 80, 124, 142].map((x) => (
            <rect key={x} x={x} y="146" width="13" height="38" rx="5" fill={body} stroke={INK} strokeWidth="3" />
          ))}
          <rect x="50" y="98" width="106" height="54" rx="26" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M132 106 L150 58 L184 70 L158 120 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M146 62 L186 72 Q198 82 190 92 L156 90 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M140 66 Q124 74 130 108" fill="none" stroke={accent} strokeWidth="10" strokeLinecap="round" />
          {!winged && <path d="M168 62 L176 28 L180 66 Z" fill={accent} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />}
          <path d="M156 52 L162 40 L168 54 Z" fill={body} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        </g>
      );
    }
  }
}

// Where each archetype's face sits (head center and spacing) so the shared
// eyes/smile land on the face instead of the body. Archetypes that draw their
// own face (blocky, creeper, statue, plague, pumpkin, mummy slit) skip it.
const FACE: Partial<Record<Archetype, { x: number; y: number; gap: number; r: number; mouth?: { y: number; w: number; teeth?: boolean } }>> = {
  tall: undefined,
  blob: { x: 100, y: 104, gap: 22, r: 11, mouth: { y: 128, w: 26 } },
  ghost: { x: 100, y: 92, gap: 22, r: 12, mouth: { y: 120, w: 24 } },
  mummy: { x: 100, y: 72, gap: 15, r: 7 },
  furry: { x: 100, y: 62, gap: 15, r: 8, mouth: { y: 90, w: 22, teeth: true } },
  dino: { x: 166, y: 74, gap: 0, r: 8 },
  dragon: { x: 100, y: 92, gap: 16, r: 8, mouth: { y: 114, w: 22, teeth: true } },
  robot: { x: 100, y: 66, gap: 18, r: 11, mouth: { y: 84, w: 26 } },
  cyclops: { x: 100, y: 80, gap: 0, r: 20, mouth: { y: 112, w: 34, teeth: true } },
  tentacle: { x: 100, y: 80, gap: 24, r: 12, mouth: { y: 108, w: 28 } },
  bird: { x: 100, y: 62, gap: 13, r: 8 },
  horned: { x: 100, y: 60, gap: 17, r: 9, mouth: { y: 90, w: 22, teeth: true } },
  vampire: { x: 100, y: 62, gap: 13, r: 7, mouth: { y: 78, w: 16, teeth: true } },
  witch: { x: 100, y: 82, gap: 13, r: 7, mouth: { y: 96, w: 16 } },
  horse: { x: 164, y: 76, gap: 0, r: 7 },
};

function Face({ m }: { m: MonsterDef }) {
  const f = FACE[m.arch];
  if (!f) return null;
  return (
    <g>
      {f.gap === 0 ? <Eye x={f.x} y={f.y} r={f.r} /> : (
        <>
          <Eye x={f.x - f.gap} y={f.y} r={f.r} />
          <Eye x={f.x + f.gap} y={f.y} r={f.r} />
        </>
      )}
      {f.mouth && <Smile x={f.x} y={f.mouth.y} w={f.mouth.w} teeth={f.mouth.teeth} />}
    </g>
  );
}

// Grown (2) monsters get a soft glow behind them; mega (3) ones a stronger glow
// plus sparkles around - drawn BEHIND/around the body so nothing floats.
function GlowBack({ stage, accent }: { stage: 1 | 2 | 3; accent: string }) {
  if (stage === 1) return null;
  return <ellipse cx="100" cy="112" rx={stage === 3 ? 104 : 92} ry={stage === 3 ? 100 : 88} fill={accent} opacity={stage === 3 ? 0.28 : 0.16} />;
}

function Sparkles({ stage }: { stage: 1 | 2 | 3 }) {
  if (stage !== 3) return null;
  return (
    <g>
      {[
        [14, 60],
        [188, 76],
        [24, 150],
        [180, 156],
        [100, -4],
      ].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 9} L${x + 3} ${y - 3} L${x + 9} ${y} L${x + 3} ${y + 3} L${x} ${y + 9} L${x - 3} ${y + 3} L${x - 9} ${y} L${x - 3} ${y - 3} Z`} fill="#fff6c2" stroke="#f2c14e" strokeWidth="1.5" />
      ))}
    </g>
  );
}

export default function MonsterArt({
  subject,
  grade,
  stage = 2,
  silhouette = false,
  size = 120,
  hit = false,
}: {
  subject: EduSubject;
  grade: number;
  stage?: 1 | 2 | 3;
  silhouette?: boolean;
  size?: number;
  // Briefly shakes the monster (a correct answer just landed a hit).
  hit?: boolean;
}) {
  const m = monsterFor(subject, grade);
  const scale = stage === 1 ? 0.8 : stage === 2 ? 0.92 : 1;
  return (
    <svg
      width={size}
      height={size}
      viewBox="-10 -14 220 214"
      role="img"
      aria-label={silhouette ? 'A monster you have not met yet' : `${m.name}`}
      style={{ filter: silhouette ? 'brightness(0) opacity(0.28)' : undefined, transition: 'transform 0.15s', transform: hit ? 'translateX(6px) rotate(3deg)' : undefined, overflow: 'visible' }}
    >
      <ellipse cx="100" cy="190" rx="62" ry="8" fill="#000" opacity="0.14" />
      <g transform={`translate(${100 - 100 * scale} ${190 - 190 * scale}) scale(${scale})`}>
        <GlowBack stage={stage} accent={m.accent} />
        <Body m={m} />
        <Face m={m} />
        <Sparkles stage={stage} />
      </g>
    </svg>
  );
}
