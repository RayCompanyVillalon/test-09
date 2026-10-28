import type { Rect } from '../physics/aabb';
import { ENEMY } from '../config';

export type SolidKind = 'stone' | 'wood';

export interface SolidDef extends Rect {
  kind: SolidKind;
}

export interface EnemySpawnDef {
  id: string;
  x: number;
  /**
   * Y of the solid top this enemy stands on. The body's Y is derived from this
   * so the feet always rest exactly on the surface — never sunk into it, which
   * would make the horizontal collision pass shove the enemy sideways.
   */
  groundTop: number;
  patrolMin: number;
  patrolMax: number;
  maxHealth?: number;
}

export interface BossSpawnDef {
  id: string;
  x: number;
  groundTop: number;
  /** Horizontal bounds (body centres) the flying boss is confined to. */
  arenaMin: number;
  arenaMax: number;
  maxHealth: number;
}

export interface RoomData {
  width: number;
  height: number;
  spawn: { x: number; y: number };
  solids: SolidDef[];
  oneWays: Rect[];
  enemies: EnemySpawnDef[];
  boss: BossSpawnDef;
  endX: number;
}

/** Feet-on-the-floor Y for a ground enemy. */
export function enemySpawnY(spawn: EnemySpawnDef): number {
  return spawn.groundTop - ENEMY.height;
}

/**
 * The graveyard path. A ruined cemetery with uneven terrain, collapsed crypts,
 * and hollow knights guarding the way to the Moth Mother's arena.
 */
export const ROOM: RoomData = {
  width: 6400,
  height: 720,
  spawn: { x: 80, y: 530 },
  endX: 6000,
  solids: [
    // === Left wall ===
    { x: 0, y: 0, w: 32, h: 640, kind: 'stone' },

    // === Opening area — cobblestone path, slightly raised ===
    { x: 0, y: 600, w: 700, h: 120, kind: 'stone' },

    // === First pit gap (dash-jump needed) ===
    // Landing on the far side
    { x: 900, y: 600, w: 350, h: 120, kind: 'stone' },

    // === Collapsed crypt platform (mid-air) ===
    // Sits high enough that a 60px-tall enemy can walk underneath it.
    { x: 1100, y: 500, w: 80, h: 24, kind: 'stone' },

    // === Graveyard ground section with uneven terrain ===
    { x: 1400, y: 620, w: 500, h: 100, kind: 'stone' },
    // Low tombstone step
    { x: 1550, y: 588, w: 60, h: 32, kind: 'stone' },
    // Higher tomb platform
    { x: 1750, y: 548, w: 48, h: 72, kind: 'stone' },

    // === Second gap over sunken graves ===
    { x: 2100, y: 620, w: 400, h: 100, kind: 'stone' },
    // Mid-gap crumbling pillar (stepping stone across the gap)
    { x: 1980, y: 540, w: 40, h: 80, kind: 'stone' },

    // === Mausoleum ruins — multi-level ===
    { x: 2650, y: 640, w: 600, h: 80, kind: 'stone' },
    // Mausoleum floor (raised)
    { x: 2750, y: 560, w: 180, h: 20, kind: 'stone' },
    // Mausoleum wall stub
    { x: 2680, y: 480, w: 24, h: 100, kind: 'stone' },
    { x: 2900, y: 480, w: 24, h: 100, kind: 'stone' },
    // Collapsed roof beam (bridge)
    { x: 3100, y: 580, w: 120, h: 16, kind: 'wood' },

    // === Crypt staircase ===
    { x: 3300, y: 640, w: 500, h: 80, kind: 'stone' },
    { x: 3350, y: 608, w: 80, h: 32, kind: 'stone' },
    { x: 3430, y: 576, w: 80, h: 64, kind: 'stone' },

    // === Lower catacomb path ===
    { x: 3900, y: 660, w: 400, h: 60, kind: 'stone' },
    // Broken archway pillars
    { x: 3950, y: 560, w: 24, h: 100, kind: 'stone' },
    { x: 4200, y: 560, w: 24, h: 100, kind: 'stone' },

    // === Ascent back up ===
    { x: 4400, y: 640, w: 500, h: 80, kind: 'stone' },
    { x: 4550, y: 572, w: 80, h: 32, kind: 'stone' },

    // === Final approach to boss arena ===
    { x: 5000, y: 620, w: 400, h: 100, kind: 'stone' },
    // Boss arena floor — wide and flat
    { x: 5500, y: 600, w: 900, h: 120, kind: 'stone' },

    // Arena pillars (decorative, broken stumps — clear of the boss's hover lane)
    { x: 5550, y: 520, w: 32, h: 80, kind: 'stone' },
    { x: 5850, y: 520, w: 32, h: 80, kind: 'stone' },
    { x: 6150, y: 520, w: 32, h: 80, kind: 'stone' },

    // === Right wall ===
    { x: 6368, y: 0, w: 32, h: 640, kind: 'stone' },
  ],
  oneWays: [
    // Crumbling wooden plank over first pit
    { x: 740, y: 584, w: 120, h: 10 },
    // Fallen crypt door over second gap
    { x: 2100, y: 600, w: 80, h: 10 },
  ],
  enemies: [
    // Five chaff hollow knights, each planted on a wide flat stretch away from
    // every ledge, so patrol and chase can never walk them into a pit.
    // Opening stretch — solid spans x 32..700 at y=600. Kept far enough down
    // the path that it does not aggro the player while the page is still
    // loading, so nobody takes a hit before touching the keyboard.
    { id: 'chaff-1', x: 600, groundTop: 600, patrolMin: 470, patrolMax: 640 },
    // Landing after the first pit — solid spans x 900..1250 at y=600.
    { id: 'chaff-2', x: 1000, groundTop: 600, patrolMin: 950, patrolMax: 1200 },
    // Crypt staircase landing — solid spans x 3300..3800 at y=640, steps end 3510.
    { id: 'chaff-3', x: 3660, groundTop: 640, patrolMin: 3560, patrolMax: 3740 },
    // Catacomb pocket between the broken archways — solid x 3900..4300 at y=660.
    { id: 'chaff-4', x: 4080, groundTop: 660, patrolMin: 4000, patrolMax: 4170 },
    // Final approach — solid spans x 5000..5400 at y=620.
    { id: 'chaff-5', x: 5220, groundTop: 620, patrolMin: 5100, patrolMax: 5340 },
  ],
  boss: {
    id: 'moth-mother',
    x: 6000,
    groundTop: 600,
    arenaMin: 5620,
    arenaMax: 6300,
    maxHealth: 260,
  },
};