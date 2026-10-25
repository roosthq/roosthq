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
  | 'zombie'
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
  | 'horse'
  | 'trike'
  | 'stego'
  | 'raptor'
  | 'spino'
  | 'ptero'
  | 'mosa'
  | 'nessie'
  | 'turtle'
  | 'moth'
  | 'hydra'
  | 'griffin'
  | 'bull'
  | 'ape'
  | 'wolf'
  | 'skeleton'
  | 'frank'
  | 'wyvern'
  | 'sasquatch'
  | 'mothman';

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
    C('Zombie', 'zombie', '#6aa84f', '#3d6b2e', 'Slow, groany, and weirdly good at counting.'),
    C('Skeleton', 'skeleton', '#e8e6df', '#8c8a80', 'Bone-afide math whiz with a bow.'),
    C('Creeper', 'creeper', '#5cb85c', '#2f7a2f', 'Hisses when it gets close. Sssssolve it!'),
    C('Enderman', 'tall', '#1d1d26', '#b04dff', 'Teleports in whenever you say its name.'),
    C('Slime', 'blob', '#7ed957', '#4aa332', 'Bouncy, squishy, splits into smaller slimes.'),
    C('Iron Golem', 'robot', '#b9bfc8', '#6e7681', 'Guards the village with a big heart.'),
    C('Ender Dragon', 'wyvern', '#2a2438', '#c05cff', 'The final boss of the Block Realm.'),
  ],
  READING: [
    C('Bigfoot', 'sasquatch', '#8b5e3c', '#5a3a22', 'Big feet, bigger bookshelf.'),
    C('Nessie', 'nessie', '#4f9d8a', '#2c6b5c', 'Hides in the lake and reads by the shore.'),
    C('Mothman', 'mothman', '#6b6f7a', '#e63946', 'Glowing red eyes, loves a good mystery.'),
    C('Slender Man', 'tall', '#2b2b2b', '#e8e8e8', 'Tall, quiet, and always in a suit.'),
    C('Chupacabra', 'dino', '#9aa45a', '#5d6a2a', 'Spiky back, sneaky steps.'),
    C('Jersey Devil', 'horned', '#7a3b3b', '#d9a441', 'Wings, hooves, and a very long tale.'),
    C('Kraken', 'tentacle', '#3f5fa8', '#9bb4ee', 'Eight arms for eight books at once.'),
  ],
  SCIENCE: [
    C('Godzilla', 'dino', '#4a5d4a', '#9cd1ff', 'King of the monsters, master of experiments.'),
    C('Mothra', 'moth', '#e8c16a', '#9a4fd1', 'Giant glowing wings of science.'),
    C('Rodan', 'ptero', '#b5651d', '#f2c14e', 'Supersonic and super curious.'),
    C('King Kong', 'ape', '#3b3b3b', '#8a8a8a', 'Climbs towers to see how they work.'),
    C('Mechagodzilla', 'dino', '#9aa5b5', '#e63946', 'Built from pure engineering.'),
    C('Gamera', 'turtle', '#6c8f3a', '#d9a441', 'Flies like a rocket, spins like a top.'),
    C('Cthulhu', 'tentacle', '#3c7a6a', '#b6e86a', 'Sleeps in the deep. Dreams of physics.'),
  ],
  SPELLING: [
    C('Ghost', 'ghost', '#f2f2f7', '#b8b8d0', 'Boo! Can you spell it?'),
    C('Pumpkin Head', 'pumpkin', '#f08a24', '#3d7a2a', 'Grins at every correct letter.'),
    C('Mummy', 'mummy', '#e9dfc7', '#b8a67a', 'All wrapped up in words.'),
    C('Witch', 'witch', '#6a4c93', '#7bc74d', 'Casts spells, the spelling kind.'),
    C('Werewolf', 'wolf', '#7d7d8a', '#f2c14e', 'Howls at the full moon, and at typos.'),
    C('Vampire', 'vampire', '#2f2442', '#c1121f', 'Never forgets a silent letter.'),
    C('Frankenstein', 'frank', '#79a86b', '#46604a', 'Stitched together from every word.'),
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
    C('Griffin', 'griffin', '#c79a3b', '#7a4f1d', 'Half eagle, half lion, all explorer.'),
    C('Minotaur', 'bull', '#7a4a2a', '#d9c9a0', 'Knows every twist of the labyrinth.'),
    C('Cyclops', 'cyclops', '#8aa86a', '#5a7a3a', 'One big eye on history.'),
    C('Hydra', 'hydra', '#5a9e6a', '#b6e86a', 'Lose a question, grow two more heads.'),
    C('Phoenix', 'bird', '#f26b21', '#ffd23f', 'Rises from the ashes of every old empire.'),
  ],
  BIOLOGY: [
    C('T. rex', 'dino', '#6b8e4e', '#3d5a2a', 'Tiny arms, huge brain.'),
    C('Triceratops', 'trike', '#8a9aa8', '#d9a441', 'Three horns, zero fear.'),
    C('Velociraptor', 'raptor', '#b5704a', '#3d2a1a', 'Fast, clever, and feathery.'),
    C('Stegosaurus', 'stego', '#7a9e5a', '#e07a3a', 'Plates for style, spikes for fun.'),
    C('Spinosaurus', 'spino', '#4f8a8a', '#e07a3a', 'Sail on its back, fish on its mind.'),
    C('Pteranodon', 'ptero', '#c75b5b', '#e8c16a', 'Soars high over the whole food chain.'),
    C('Mosasaurus', 'mosa', '#3a6ea5', '#9bd1ff', 'Ruler of the ancient seas.'),
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
    case 'zombie':
      // Minecraft-style zombie: green blocky head, cyan shirt, blue pants, arms stretched out.
      return (
        <g>
          <rect x="64" y="132" width="34" height="52" fill="#3b4a9c" stroke={INK} strokeWidth="3" />
          <rect x="102" y="132" width="34" height="52" fill="#3b4a9c" stroke={INK} strokeWidth="3" />
          <rect x="64" y="174" width="34" height="10" fill="#2c3678" stroke={INK} strokeWidth="3" />
          <rect x="102" y="174" width="34" height="10" fill="#2c3678" stroke={INK} strokeWidth="3" />
          <rect x="12" y="86" width="56" height="18" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="132" y="86" width="56" height="18" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="12" y="86" width="22" height="18" fill={accent} opacity="0.5" />
          <rect x="166" y="86" width="22" height="18" fill={accent} opacity="0.5" />
          <rect x="44" y="86" width="22" height="18" fill="#2fa3a8" stroke={INK} strokeWidth="3" />
          <rect x="134" y="86" width="22" height="18" fill="#2fa3a8" stroke={INK} strokeWidth="3" />
          <rect x="62" y="80" width="76" height="56" fill="#2fa3a8" stroke={INK} strokeWidth="3" />
          <rect x="62" y="126" width="76" height="10" fill="#23888c" />
          <rect x="62" y="80" width="76" height="8" fill="#23888c" />
          <rect x="56" y="22" width="88" height="62" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="56" y="22" width="88" height="12" fill={accent} opacity="0.55" />
          <rect x="60" y="62" width="14" height="10" fill={accent} opacity="0.4" />
          <rect x="124" y="40" width="16" height="12" fill={accent} opacity="0.4" />
          <rect x="72" y="46" width="18" height="12" fill="#1a1d2e" />
          <rect x="110" y="46" width="18" height="12" fill="#1a1d2e" />
          <rect x="72" y="46" width="8" height="12" fill="#2a5d6b" />
          <rect x="110" y="46" width="8" height="12" fill="#2a5d6b" />
          <rect x="88" y="62" width="24" height="8" fill={accent} opacity="0.8" />
          <rect x="82" y="72" width="36" height="8" fill={INK} />
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
    case 'trike':
      // Four-legged side view facing right: big frill, two brow horns, a nose horn and a beak.
      return (
        <g>
          <path d="M44 122 Q16 128 8 154 Q34 148 52 148 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          {[50, 72, 112, 134].map((x) => (
            <rect key={x} x={x} y="146" width="20" height="40" rx="7" fill={body} stroke={INK} strokeWidth="3" />
          ))}
          <ellipse cx="144" cy="78" rx="34" ry="40" transform="rotate(-18 144 78)" fill={accent} stroke={INK} strokeWidth="3" />
          {[[120, 54], [136, 42], [154, 40], [170, 48], [118, 76], [124, 98]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="5" fill={body} stroke={INK} strokeWidth="2" />
          ))}
          <ellipse cx="88" cy="130" rx="60" ry="34" fill={body} stroke={INK} strokeWidth="3" />
          <ellipse cx="92" cy="144" rx="40" ry="16" fill={accent} opacity="0.3" />
          <path d="M136 98 Q150 90 176 94 L202 114 Q206 126 190 128 L162 136 Q138 134 134 116 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M160 90 L178 46 L186 52 L174 96 Z M144 92 L152 56 L160 60 L156 96 Z" fill="#f6f1e0" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M194 112 L206 90 L210 116 Z" fill="#f6f1e0" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        </g>
      );
    case 'stego':
      // Arched back with two rows of big plates, tail spikes, tiny low head.
      return (
        <g>
          <path d="M44 124 Q16 130 6 156 Q30 150 54 150 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M22 140 L6 118 L30 130 Z M38 138 L26 114 L48 130 Z" fill="#f6f1e0" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          {[56, 84].map((x) => (
            <rect key={x} x={x} y="140" width="22" height="46" rx="8" fill={body} stroke={INK} strokeWidth="3" />
          ))}
          {[126, 148].map((x) => (
            <rect key={x} x={x} y="146" width="16" height="40" rx="6" fill={body} stroke={INK} strokeWidth="3" />
          ))}
          {[[66, 88, -38], [86, 76, -20], [108, 70, 0], [130, 74, 18], [150, 88, 36]].map(([x, y, a], i) => (
            <path key={i} d={`M${x - 13} ${y + 10} L${x} ${y - 34} L${x + 13} ${y + 10} Z`} transform={`rotate(${a} ${x} ${y + 10})`} fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          ))}
          <path d="M44 142 Q48 78 108 74 Q160 74 166 124 Q172 152 150 154 L58 154 Q42 154 44 142 Z" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M150 100 Q172 110 178 126 L166 148 L148 152 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M160 128 Q178 118 202 136 Q202 150 178 150 Q160 150 160 128 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        </g>
      );
    case 'raptor':
      // Sleek, long-tailed hunter with a big hind claw and a feathery crest.
      return (
        <g>
          <path d="M72 112 Q34 102 4 116 Q34 124 72 128 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M92 124 L84 156 L70 184 L102 184 L96 160 L110 130 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M70 184 L54 190 L64 176 Z" fill={accent} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <ellipse cx="104" cy="112" rx="42" ry="26" transform="rotate(-12 104 112)" fill={body} stroke={INK} strokeWidth="3" />
          <ellipse cx="108" cy="124" rx="28" ry="12" transform="rotate(-12 108 124)" fill={accent} opacity="0.3" />
          <path d="M118 126 L112 158 L100 184 L132 184 L128 160 L138 130 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M100 184 L84 190 L94 176 Z" fill={accent} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M126 96 Q140 74 150 68 L156 84 Q142 96 138 112 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M140 72 Q152 56 178 60 L200 70 Q202 80 188 82 L162 86 Q142 88 140 72 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M146 62 L140 40 L154 56 L156 36 L164 58 L172 44 L172 60 Z" fill={accent} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M132 112 Q152 122 158 112 M150 112 l6 8 M158 110 l8 6" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
          <path d="M78 98 L86 82 L92 96 L102 80 L108 96 L118 82 L122 98" fill={accent} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M184 82 l4 8 l4 -8 M172 84 l4 8 l4 -8" fill="#fff" stroke={INK} strokeWidth="1.5" />
        </g>
      );
    case 'spino':
      // Huge sail on the back and a long crocodile snout.
      return (
        <g>
          <path d="M64 122 Q30 126 10 156 Q40 150 66 148 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M54 104 Q52 38 82 28 Q106 20 128 32 Q150 46 144 104 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M72 100 L74 52 M90 100 L92 38 M108 100 L110 36 M126 100 L128 48" fill="none" stroke={INK} strokeWidth="2.5" opacity="0.5" />
          {[84, 118].map((x) => (
            <rect key={x} x={x} y="150" width="20" height="34" rx="7" fill={body} stroke={INK} strokeWidth="3" />
          ))}
          <ellipse cx="100" cy="126" rx="56" ry="34" fill={body} stroke={INK} strokeWidth="3" />
          <ellipse cx="104" cy="140" rx="36" ry="16" fill={accent} opacity="0.3" />
          <path d="M134 100 Q146 86 170 90 L204 102 Q208 114 194 114 L160 118 Q140 120 134 108 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M182 102 l4 9 l4 -9 M168 104 l4 9 l4 -9 M194 106 l3 7 l3 -7" fill="#fff" stroke={INK} strokeWidth="1.5" />
          <path d="M126 130 Q144 140 152 130 M144 130 l6 8" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        </g>
      );
    case 'ptero':
      // Leathery wings spread wide, long pointed beak and a swept-back crest.
      return (
        <g>
          <path d="M92 98 L6 52 Q18 82 12 100 Q34 94 36 114 Q58 102 66 126 Q80 116 92 128 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M108 98 L194 52 Q182 82 188 100 Q166 94 164 114 Q142 102 134 126 Q120 116 108 128 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M92 98 L24 74 M92 100 L40 112 M108 98 L176 74 M108 100 L160 112" fill="none" stroke={INK} strokeWidth="2" opacity="0.45" />
          <ellipse cx="100" cy="122" rx="20" ry="36" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M92 154 L88 184 M108 154 L112 184" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <path d="M92 62 L38 38 Q64 48 78 56 Z" fill={body} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <ellipse cx="102" cy="64" rx="22" ry="17" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M118 58 L190 72 L118 76 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M84 56 L76 44 L94 50 Z" fill={accent} stroke={INK} strokeWidth="2" />
        </g>
      );
    case 'mosa':
      // Long swimming sea reptile: tail fin, flippers, toothy jaws, riding on waves.
      return (
        <g>
          <path d="M34 130 L4 98 Q16 128 6 162 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M30 128 Q60 98 100 106 Q140 110 150 98 Q164 82 192 90 L206 106 Q202 118 186 116 L170 124 Q156 132 140 140 Q100 152 60 146 Q38 142 30 128 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M44 138 Q90 148 140 134 Q160 124 168 120 L150 136 Q100 156 50 146 Z" fill={accent} opacity="0.4" />
          <path d="M94 108 L106 80 L120 110 Z" fill={accent} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M92 140 L72 170 L108 154 Z M130 136 L120 168 L148 142 Z" fill={accent} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M184 116 l4 9 l4 -9 M170 124 l4 9 l4 -9 M198 112 l3 7 l3 -7" fill="#fff" stroke={INK} strokeWidth="1.5" />
          <path d="M-6 168 Q12 156 30 168 T66 168 T102 168 T138 168 T174 168 T210 168 L210 190 L-6 190 Z" fill="#7cc4ee" stroke={INK} strokeWidth="2.5" opacity="0.9" />
        </g>
      );
    case 'nessie':
      // Long neck arching out of the loch, humps behind it.
      return (
        <g>
          <path d="M120 170 Q178 150 160 100 Q150 68 108 62" fill="none" stroke={INK} strokeWidth="28" strokeLinecap="round" />
          <path d="M120 170 Q178 150 160 100 Q150 68 108 62" fill="none" stroke={body} strokeWidth="22" strokeLinecap="round" />
          <path d="M38 176 Q58 126 84 176 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M82 176 Q104 130 128 176 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M40 178 Q22 168 6 178" fill="none" stroke={body} strokeWidth="9" strokeLinecap="round" />
          <ellipse cx="100" cy="60" rx="24" ry="15" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M104 44 L100 34 M114 46 L116 36" stroke={accent} strokeWidth="5" strokeLinecap="round" />
          <path d="M-6 172 Q12 160 30 172 T66 172 T102 172 T138 172 T174 172 T210 172 L210 192 L-6 192 Z" fill="#7cc4ee" stroke={INK} strokeWidth="2.5" opacity="0.92" />
        </g>
      );
    case 'turtle':
      // Giant shell, tusks and a head poking out; the flying-turtle kaiju.
      return (
        <g>
          <path d="M40 140 L10 156 L44 160 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          {[64, 126].map((x) => (
            <rect key={x} x={x} y="148" width="26" height="38" rx="9" fill={body} stroke={INK} strokeWidth="3" />
          ))}
          <path d="M140 118 Q166 112 176 126 L172 142 Q152 146 140 138 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M166 112 Q182 100 204 118 Q208 134 190 138 L172 138 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M184 136 Q196 140 204 152 Q190 152 182 140 M174 138 Q180 150 176 160 Q168 150 170 138" fill="#f6f1e0" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M36 148 Q30 70 100 66 Q170 70 164 148 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M100 66 L100 148 M54 108 L146 108 M60 84 L90 148 M140 84 L110 148" fill="none" stroke={INK} strokeWidth="3" opacity="0.4" />
          <rect x="30" y="144" width="140" height="14" rx="7" fill={body} stroke={INK} strokeWidth="3" />
        </g>
      );
    case 'moth':
      // Big patterned wings with eyespots, fuzzy body, feathery antennae.
      return (
        <g>
          <path d="M94 92 Q40 14 6 52 Q2 104 52 128 Q78 120 94 112 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M106 92 Q160 14 194 52 Q198 104 148 128 Q122 120 106 112 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M94 114 Q50 124 34 170 Q72 178 94 142 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M106 114 Q150 124 166 170 Q128 178 106 142 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          {[52, 148].map((x) => (
            <g key={x}>
              <circle cx={x} cy="78" r="17" fill={body} stroke={INK} strokeWidth="2.5" />
              <circle cx={x} cy="78" r="8" fill={INK} />
              <circle cx={x - 2} cy="75" r="3" fill="#fff" />
            </g>
          ))}
          <ellipse cx="100" cy="124" rx="15" ry="46" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M88 108 h24 M88 124 h24 M88 140 h24" stroke={accent} strokeWidth="4" opacity="0.7" />
          <circle cx="100" cy="76" r="17" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M92 62 Q84 38 66 30 M108 62 Q116 38 134 30" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <path d="M80 36 l-10 6 M76 32 l-8 4 M120 36 l10 6 M124 32 l8 4" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    case 'hydra':
      // Three snaky necks, three heads, one grumpy body.
      return (
        <g>
          {['M66 148 Q24 108 46 64', 'M100 138 Q100 90 100 44', 'M134 148 Q176 108 154 64'].map((d) => (
            <g key={d}>
              <path d={d} fill="none" stroke={INK} strokeWidth="24" strokeLinecap="round" />
              <path d={d} fill="none" stroke={body} strokeWidth="18" strokeLinecap="round" />
            </g>
          ))}
          <ellipse cx="100" cy="152" rx="58" ry="34" fill={body} stroke={INK} strokeWidth="3" />
          <ellipse cx="100" cy="166" rx="38" ry="14" fill={accent} opacity="0.35" />
          {[[44, 54], [100, 30], [156, 54]].map(([x, y], i) => (
            <g key={i}>
              <ellipse cx={x} cy={y} rx="22" ry="16" fill={body} stroke={INK} strokeWidth="3" />
              <Eye x={x - 8} y={y - 4} r={6} />
              <Eye x={x + 8} y={y - 4} r={6} />
              <path d={`M${x - 8} ${y + 8} Q${x} ${y + 14} ${x + 8} ${y + 8}`} fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
              <path d={`M${x} ${y + 12} l-3 8 l6 0 Z`} fill={accent} stroke={INK} strokeWidth="1.5" />
            </g>
          ))}
        </g>
      );
    case 'griffin':
      // Eagle head and wings on a lion body, tufted tail.
      return (
        <g>
          <path d="M54 126 Q22 124 18 156" fill="none" stroke={INK} strokeWidth="12" strokeLinecap="round" />
          <path d="M54 126 Q22 124 18 156" fill="none" stroke={body} strokeWidth="7" strokeLinecap="round" />
          <ellipse cx="18" cy="160" rx="10" ry="14" fill={accent} stroke={INK} strokeWidth="2.5" />
          <path d="M60 110 Q22 44 62 12 Q70 48 92 52 Q88 28 114 20 Q122 70 110 108 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M70 60 Q80 80 96 86 M92 52 Q96 78 104 94" fill="none" stroke={INK} strokeWidth="2" opacity="0.4" />
          {[62, 82, 122].map((x) => (
            <rect key={x} x={x} y="146" width="16" height="40" rx="6" fill={body} stroke={INK} strokeWidth="3" />
          ))}
          <rect x="138" y="146" width="16" height="30" rx="6" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M132 176 L158 176 L168 190 L128 190 Z" fill="#f2b632" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <rect x="48" y="102" width="110" height="52" rx="26" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M132 108 L146 70 L174 76 L162 120 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <circle cx="162" cy="60" r="22" fill="#f6f1e0" stroke={INK} strokeWidth="3" />
          <path d="M178 56 L208 70 L178 78 Z" fill="#f2b632" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M148 44 L142 30 L158 40 Z" fill="#f6f1e0" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        </g>
      );
    case 'bull':
      // Bull-headed brute: curved horns, nose ring, loincloth.
      return (
        <g>
          <path d="M44 188 Q36 112 70 100 L130 100 Q164 112 156 188 Z" fill={body} stroke={INK} strokeWidth="3" />
          {['M62 112 Q26 132 38 172', 'M138 112 Q174 132 162 172'].map((d) => (
            <g key={d}>
              <path d={d} fill="none" stroke={INK} strokeWidth="24" strokeLinecap="round" />
              <path d={d} fill="none" stroke={body} strokeWidth="18" strokeLinecap="round" />
            </g>
          ))}
          <path d="M70 150 L130 150 L122 188 L78 188 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M72 46 Q30 42 26 4 Q52 22 84 30 Z M128 46 Q170 42 174 4 Q148 22 116 30 Z" fill="#f6f1e0" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <ellipse cx="62" cy="62" rx="14" ry="8" transform="rotate(20 62 62)" fill={body} stroke={INK} strokeWidth="3" />
          <ellipse cx="138" cy="62" rx="14" ry="8" transform="rotate(-20 138 62)" fill={body} stroke={INK} strokeWidth="3" />
          <ellipse cx="100" cy="62" rx="32" ry="36" fill={body} stroke={INK} strokeWidth="3" />
          <ellipse cx="100" cy="84" rx="21" ry="15" fill={accent} stroke={INK} strokeWidth="3" />
          <circle cx="92" cy="82" r="3.5" fill={INK} />
          <circle cx="108" cy="82" r="3.5" fill={INK} />
          <circle cx="100" cy="98" r="7" fill="none" stroke="#f2b632" strokeWidth="3.5" />
          <path d="M72 46 L90 54 M128 46 L110 54" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        </g>
      );
    case 'ape':
      // Gorilla: huge shoulders, long arms down to the knuckles, small head.
      return (
        <g>
          <path d="M44 188 Q22 104 62 86 L138 86 Q178 104 156 188 Z" fill={body} stroke={INK} strokeWidth="3" />
          {['M48 100 Q6 140 22 182', 'M152 100 Q194 140 178 182'].map((d) => (
            <g key={d}>
              <path d={d} fill="none" stroke={INK} strokeWidth="32" strokeLinecap="round" />
              <path d={d} fill="none" stroke={body} strokeWidth="26" strokeLinecap="round" />
            </g>
          ))}
          <ellipse cx="100" cy="136" rx="32" ry="34" fill={accent} opacity="0.45" />
          <path d="M76 188 L80 164 M124 188 L120 164" stroke={INK} strokeWidth="4" strokeLinecap="round" />
          <circle cx="100" cy="60" r="31" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M80 30 Q100 12 120 30 Q100 24 80 30 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <ellipse cx="100" cy="70" rx="21" ry="17" fill={accent} stroke={INK} strokeWidth="2.5" />
          <circle cx="94" cy="68" r="2.5" fill={INK} />
          <circle cx="106" cy="68" r="2.5" fill={INK} />
        </g>
      );
    case 'wolf':
      // Werewolf: pointy ears, long snout, fangs, claws.
      return (
        <g>
          <path d="M46 188 Q34 112 68 96 L132 96 Q166 112 154 188 Z" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M58 118 q8 -8 16 0 q8 -8 16 0 M110 118 q8 -8 16 0 q8 -8 16 0 M62 144 q8 -8 16 0 q8 -8 16 0" stroke={accent} strokeWidth="3" fill="none" />
          {['M64 106 Q26 132 38 172', 'M136 106 Q174 132 162 172'].map((d) => (
            <g key={d}>
              <path d={d} fill="none" stroke={INK} strokeWidth="22" strokeLinecap="round" />
              <path d={d} fill="none" stroke={body} strokeWidth="16" strokeLinecap="round" />
            </g>
          ))}
          <path d="M30 172 l-4 12 M38 174 l-1 12 M46 172 l3 12 M170 172 l4 12 M162 174 l1 12 M154 172 l-3 12" stroke="#f6f1e0" strokeWidth="4" strokeLinecap="round" />
          <path d="M68 40 L58 4 L90 28 Z M132 40 L142 4 L110 28 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M66 56 Q66 20 100 20 Q134 20 134 56 L122 86 Q100 104 78 86 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <ellipse cx="100" cy="82" rx="19" ry="15" fill={accent} opacity="0.5" />
          <ellipse cx="100" cy="72" rx="7" ry="5" fill={INK} />
          <path d="M84 88 Q100 98 116 88" fill="#7a1f1f" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M89 90 l3 9 l4 -8 M104 91 l4 8 l3 -9" fill="#fff" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
        </g>
      );
    case 'skeleton':
      // Bone-white skeleton with a skull, ribcage and a bow.
      return (
        <g>
          <path d="M162 98 Q198 146 162 194" fill="none" stroke="#8b5a2b" strokeWidth="6" strokeLinecap="round" />
          <path d="M162 98 L162 194" stroke={INK} strokeWidth="1.5" />
          {['M70 118 L44 168', 'M130 118 L158 150', 'M90 150 L82 184', 'M110 150 L118 184'].map((d) => (
            <g key={d}>
              <path d={d} stroke={INK} strokeWidth="13" strokeLinecap="round" />
              <path d={d} stroke={body} strokeWidth="8" strokeLinecap="round" />
            </g>
          ))}
          <rect x="94" y="108" width="12" height="46" fill={body} stroke={INK} strokeWidth="2.5" />
          {[116, 128, 140].map((y) => (
            <path key={y} d={`M68 ${y - 4} Q100 ${y + 14} 132 ${y - 4}`} fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" />
          ))}
          {[116, 128, 140].map((y) => (
            <path key={`b${y}`} d={`M68 ${y - 4} Q100 ${y + 14} 132 ${y - 4}`} fill="none" stroke={body} strokeWidth="5" strokeLinecap="round" />
          ))}
          <path d="M80 152 Q100 164 120 152 L116 164 L84 164 Z" fill={body} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <rect x="60" y="22" width="80" height="72" rx="28" fill={body} stroke={INK} strokeWidth="3" />
          <ellipse cx="80" cy="56" rx="13" ry="14" fill={INK} />
          <ellipse cx="120" cy="56" rx="13" ry="14" fill={INK} />
          <circle cx="82" cy="53" r="3" fill={accent} />
          <circle cx="122" cy="53" r="3" fill={accent} />
          <path d="M100 68 L93 82 L107 82 Z" fill={INK} />
          <rect x="76" y="86" width="48" height="16" rx="3" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <path d="M88 86 v16 M100 86 v16 M112 86 v16" stroke={INK} strokeWidth="2" />
        </g>
      );
    case 'frank':
      // Stitched-together giant: flat head, neck bolts, scars, heavy brow.
      return (
        <g>
          <rect x="56" y="104" width="88" height="64" rx="4" fill="#3b3f55" stroke={INK} strokeWidth="3" />
          <path d="M92 104 L100 134 L108 104" fill="#e9e4d6" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <rect x="44" y="108" width="18" height="48" rx="3" fill="#3b3f55" stroke={INK} strokeWidth="3" />
          <rect x="138" y="108" width="18" height="48" rx="3" fill="#3b3f55" stroke={INK} strokeWidth="3" />
          <rect x="42" y="152" width="22" height="20" rx="3" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="136" y="152" width="22" height="20" rx="3" fill={body} stroke={INK} strokeWidth="3" />
          <rect x="66" y="166" width="28" height="24" fill="#2c2f40" stroke={INK} strokeWidth="3" />
          <rect x="106" y="166" width="28" height="24" fill="#2c2f40" stroke={INK} strokeWidth="3" />
          <rect x="44" y="72" width="14" height="12" rx="2" fill="#9aa0ad" stroke={INK} strokeWidth="2.5" />
          <rect x="142" y="72" width="14" height="12" rx="2" fill="#9aa0ad" stroke={INK} strokeWidth="2.5" />
          <rect x="54" y="34" width="92" height="72" rx="6" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M54 56 L54 38 Q54 28 64 28 L136 28 Q146 28 146 38 L146 56 L130 46 L112 52 L88 46 L70 52 Z" fill="#23202b" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M66 64 L90 68 M134 64 L110 68" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <Eye x={78} y={74} r={8} />
          <Eye x={122} y={74} r={8} />
          <path d="M80 94 L120 94" stroke={INK} strokeWidth="4" strokeLinecap="round" />
          <path d="M86 89 v10 M94 89 v10 M102 89 v10 M110 89 v10" stroke={INK} strokeWidth="2.5" />
          <path d="M100 38 l-3 12 M104 38 l3 12" stroke={accent} strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'wyvern':
      // Side-on dragon facing right: big wing up, long neck, horned head, spiked tail, glowing eye.
      return (
        <g>
          <path d="M66 128 Q30 120 6 150 Q34 152 64 148 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M20 142 L8 126 L28 134 Z M36 140 L28 122 L46 134 Z" fill={accent} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M70 112 Q44 36 92 6 Q98 42 122 54 Q122 26 156 22 Q158 78 118 112 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" opacity="0.92" />
          <path d="M92 6 L100 100 M122 54 L110 106 M156 22 L124 104" fill="none" stroke={INK} strokeWidth="2.5" opacity="0.45" />
          {[78, 120].map((x) => (
            <rect key={x} x={x} y="150" width="20" height="34" rx="7" fill={body} stroke={INK} strokeWidth="3" />
          ))}
          <ellipse cx="98" cy="128" rx="52" ry="32" fill={body} stroke={INK} strokeWidth="3" />
          <ellipse cx="102" cy="142" rx="34" ry="14" fill={accent} opacity="0.3" />
          <path d="M130 118 Q166 116 160 78" fill="none" stroke={INK} strokeWidth="26" strokeLinecap="round" />
          <path d="M130 118 Q166 116 160 78" fill="none" stroke={body} strokeWidth="20" strokeLinecap="round" />
          <path d="M148 76 Q160 56 186 60 L206 72 Q208 84 190 86 L160 90 Q146 88 148 76 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M152 62 L136 36 L162 54 Z M168 56 L164 30 L180 54 Z" fill={accent} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M184 86 l4 9 l4 -9 M170 88 l4 9 l4 -9" fill="#fff" stroke={INK} strokeWidth="1.5" />
          <circle cx="170" cy="68" r="6" fill={accent} stroke={INK} strokeWidth="2" />
          <circle cx="170" cy="68" r="2.5" fill="#fff" />
          <circle cx="198" cy="72" r="2" fill={INK} />
        </g>
      );
    case 'sasquatch':
      // Shaggy upright ape-man: long arms, pointy head, giant feet.
      return (
        <g>
          <ellipse cx="72" cy="182" rx="28" ry="11" fill={body} stroke={INK} strokeWidth="3" />
          <ellipse cx="128" cy="182" rx="28" ry="11" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M54 176 Q36 100 70 84 L130 84 Q164 100 146 176 Z" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M62 112 q8 -8 16 0 q8 -8 16 0 M110 118 q8 -8 16 0 q8 -8 16 0 M66 142 q8 -8 16 0 q8 -8 16 0 M104 150 q8 -8 16 0" stroke={accent} strokeWidth="3" fill="none" />
          {['M58 98 Q20 128 34 172', 'M142 98 Q180 128 166 172'].map((d) => (
            <g key={d}>
              <path d={d} fill="none" stroke={INK} strokeWidth="28" strokeLinecap="round" />
              <path d={d} fill="none" stroke={body} strokeWidth="22" strokeLinecap="round" />
            </g>
          ))}
          <path d="M72 62 Q68 18 100 14 Q132 18 128 62 Q128 90 100 92 Q72 90 72 62 Z" fill={body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <ellipse cx="100" cy="66" rx="19" ry="17" fill="#d2ad88" stroke={INK} strokeWidth="2.5" />
          <Eye x={91} y={60} r={5} />
          <Eye x={109} y={60} r={5} />
          <ellipse cx="100" cy="70" rx="4" ry="3" fill={INK} />
          <path d="M92 78 Q100 84 108 78" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
        </g>
      );
    case 'mothman':
      // Dark winged figure with huge glowing red eyes in the chest-high head.
      return (
        <g>
          <path d="M92 92 Q30 16 6 40 Q10 96 42 130 Q70 134 92 122 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" opacity="0.9" />
          <path d="M108 92 Q170 16 194 40 Q190 96 158 130 Q130 134 108 122 Z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" opacity="0.9" />
          <path d="M92 96 L30 50 M92 108 L24 90 M108 96 L170 50 M108 108 L176 90" fill="none" stroke={INK} strokeWidth="2.5" opacity="0.4" />
          {[84, 106].map((x) => (
            <rect key={x} x={x} y="144" width="12" height="42" rx="5" fill={body} stroke={INK} strokeWidth="3" />
          ))}
          <ellipse cx="100" cy="118" rx="26" ry="36" fill={body} stroke={INK} strokeWidth="3" />
          <path d="M80 100 q20 10 40 0" fill="none" stroke={INK} strokeWidth="2.5" opacity="0.4" />
          <ellipse cx="100" cy="64" rx="28" ry="24" fill={body} stroke={INK} strokeWidth="3" />
          {[86, 114].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy="62" rx="11" ry="14" fill={accent} stroke={INK} strokeWidth="2.5" />
              <ellipse cx={x - 3} cy="57" rx="3" ry="4" fill="#fff" opacity="0.8" />
            </g>
          ))}
          <path d="M82 44 L78 28 M118 44 L122 28" stroke={INK} strokeWidth="3" strokeLinecap="round" />
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
  trike: { x: 168, y: 106, gap: 0, r: 7 },
  stego: { x: 184, y: 132, gap: 0, r: 6 },
  raptor: { x: 162, y: 68, gap: 0, r: 6 },
  spino: { x: 160, y: 98, gap: 0, r: 6 },
  ptero: { x: 106, y: 62, gap: 0, r: 6 },
  mosa: { x: 178, y: 98, gap: 0, r: 6 },
  nessie: { x: 98, y: 58, gap: 0, r: 7 },
  turtle: { x: 184, y: 124, gap: 0, r: 7 },
  moth: { x: 100, y: 76, gap: 7, r: 5 },
  griffin: { x: 168, y: 54, gap: 0, r: 6 },
  bull: { x: 100, y: 58, gap: 15, r: 7 },
  ape: { x: 100, y: 52, gap: 12, r: 6 },
  wolf: { x: 100, y: 52, gap: 17, r: 7 },
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

// What an unmet monster looks like: a spotted egg with a "?", the same for
// every monster, so neither the shape nor the colors give the real one away.
function MysteryEgg({ size, hit }: { size: number; hit: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-10 -14 220 214"
      role="img"
      aria-label="A mystery monster you have not met yet"
      style={{ color: 'var(--text)', transition: 'transform 0.15s', transform: hit ? 'translateX(6px) rotate(3deg)' : undefined, overflow: 'visible' }}
    >
      <ellipse cx="100" cy="190" rx="52" ry="7" fill="#000" opacity="0.14" />
      <path d="M100 30 C145 30 168 100 168 135 C168 168 138 188 100 188 C62 188 32 168 32 135 C32 100 55 30 100 30 Z" fill="currentColor" opacity="0.13" />
      <path
        d="M100 30 C145 30 168 100 168 135 C168 168 138 188 100 188 C62 188 32 168 32 135 C32 100 55 30 100 30 Z"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="4"
      />
      <circle cx="70" cy="80" r="9" fill="currentColor" opacity="0.12" />
      <circle cx="132" cy="64" r="6" fill="currentColor" opacity="0.12" />
      <circle cx="142" cy="132" r="10" fill="currentColor" opacity="0.12" />
      <circle cx="58" cy="140" r="7" fill="currentColor" opacity="0.12" />
      <text x="100" y="138" textAnchor="middle" fontSize="84" fontWeight="800" fill="currentColor" opacity="0.5" fontFamily="system-ui, sans-serif">
        ?
      </text>
    </svg>
  );
}

// The collectible you win with a monster: a die-cut round sticker (white
// border, soft shadow, a slight tilt) around the monster, ringed in its color.
export function MonsterSticker({ subject, grade, stage = 2, size = 84 }: { subject: EduSubject; grade: number; stage?: 1 | 2 | 3; size?: number }) {
  const m = monsterFor(subject, grade);
  const tilt = ((grade * 5 + subject.length * 3) % 9) - 4;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: '#fff',
        boxShadow: `0 0 0 3px #fff, 0 0 0 5px ${m.accent}, 0 3px 8px rgba(0,0,0,0.25)`,
        transform: `rotate(${tilt}deg)`,
      }}
    >
      <MonsterArt subject={subject} grade={grade} stage={stage} size={Math.round(size * 0.86)} />
    </span>
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
  if (silhouette) return <MysteryEgg size={size} hit={hit} />;
  const m = monsterFor(subject, grade);
  const scale = stage === 1 ? 0.8 : stage === 2 ? 0.92 : 1;
  return (
    <svg
      width={size}
      height={size}
      viewBox="-10 -14 220 214"
      role="img"
      aria-label={m.name}
      style={{ transition: 'transform 0.15s', transform: hit ? 'translateX(6px) rotate(3deg)' : undefined, overflow: 'visible' }}
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
