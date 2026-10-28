/**
 * Every gameplay number lives here. The entire feel of the game is tuned from
 * this file.
 */

export const VIEW = {
  width: 1280,
  height: 720,
} as const;

export const TILE = 32;

export const PLAYER = {
  width: 32,
  height: 56,
  visualHeight: 68,
} as const;

export const ENEMY = {
  width: 36,
  height: 60,
} as const;

/**
 * The Moth Mother — the level boss. She is a flying enemy, so none of the
 * ground-bound physics tuning above applies to her.
 */
export const BOSS = {
  width: 116,
  height: 92,
  maxHealth: 260,
  /** Distance from the arena floor to her feet while hovering. */
  hoverHeight: 120,
  hoverAmplitude: 16,
  hoverSpeed: 40,
  aggroRange: 820,
  /** Telegraph before a dive. */
  diveTelegraphTime: 0.7,
  diveSpeed: 700,
  diveTime: 0.55,
  diveActiveStart: 0.05,
  diveActiveEnd: 0.4,
  /** How long she takes to climb back to hover altitude after a dive. */
  riseTime: 1.0,
  cooldown: 1.4,
  /** Below this fraction of health she enters her enraged phase. */
  phaseTwoAt: 0.5,
  contactDamage: 20,
  /** Parry knock-down: she hits the floor and stays vulnerable. */
  stunTime: 1.5,
  /** Short flinch when hit. */
  hurtTime: 0.3,
  deathTime: 1.8,
} as const;

export const PHYSICS = {
  maxRunSpeed: 320,
  groundAccel: 2800,
  groundDecel: 3800,
  airAccel: 2000,
  airDrag: 800,
  gravityUp: 2400,
  gravityDown: 3000,
  jumpVelocity: 740,
  jumpCutGravityMul: 1.85,
  apexThreshold: 120,
  apexGravityMul: 0.6,
  maxFallSpeed: 1100,
  coyoteTime: 0.08,
  jumpBufferTime: 0.1,
  dashSpeed: 700,
  dashTime: 0.16,
  dashCooldown: 0.5,
  dashEndSpeedMul: 0.5,
  cornerCorrection: 6,
  dropThroughTime: 0.2,
  crouchHeight: 28,
  crouchMoveMul: 0.6,
  slideSpeed: 500,
  slideTime: 0.35,
  /** Forward auto-scroll speed of the camera. */
  scrollSpeed: 140,
  /** How far behind scroll the player can be before taking damage. */
  scrollLimit: 180,
} as const;

export const COMBAT = {
  playerMaxHealth: 100,
  playerInvulnerableTime: 0.8,
  playerHurtStun: 0.25,
  playerKnockbackX: 280,
  playerKnockbackY: -220,
  playerAttackMoveMul: 0.3,
  playerHurtHitstop: 0.06,

  /** Damage taken from falling into a pit (respawn is at last safe ground). */
  fallDamage: 20,

  /** Parry */
  parryWindow: 0.12,
  parryStunEnemy: 0.6,
  parryKnockbackX: 400,
  parryDamage: 8,

  /** Roll i-frames */
  rollInvulnerableTime: 0.3,

  /** Mettle / Stamina */
  mettleMax: 100,
  mettleRechargePerSecond: 8,
  mettleAttackCost: 12,
  mettleParryCost: 15,
  mettleRollCost: 20,

  /** Enemy */
  enemyMaxHealth: 60,
  enemyDamage: 12,
  enemyAggroRange: 350,
  enemyAggroHeight: 100,
  enemyAttackRange: 52,
  enemyAttackReach: 60,
  enemyAttackHeight: 44,
  enemyWindup: 0.45,
  enemyAttackDuration: 0.22,
  enemyAttackActiveStart: 0.04,
  enemyAttackActiveEnd: 0.16,
  enemyRecover: 0.45,
  enemyCooldown: 0.85,
  enemyPatrolSpeed: 50,
  enemyChaseSpeed: 110,
  enemyAccel: 900,
  enemyMaxFallSpeed: 950,
  enemyKnockbackX: 250,
  enemyKnockbackY: -200,
  enemyHurtTime: 0.24,
  enemyDeathTime: 0.7,
  /** Enemies that get pushed off-screen behind the scroll die. */
  enemyScrollDeathDistance: 300,
} as const;

export const COMBO_ATTACKS: readonly AttackDef[] = [
  { damage: 10, duration: 0.25, activeStart: 0.05, activeEnd: 0.14, reach: 52, height: 44, hitstop: 0.04, lunge: 80 },
  { damage: 12, duration: 0.26, activeStart: 0.05, activeEnd: 0.15, reach: 56, height: 46, hitstop: 0.04, lunge: 70 },
  { damage: 20, duration: 0.4,  activeStart: 0.1,  activeEnd: 0.26, reach: 64, height: 52, hitstop: 0.08, lunge: 110 },
] as const;

export interface AttackDef {
  damage: number;
  duration: number;
  activeStart: number;
  activeEnd: number;
  reach: number;
  height: number;
  hitstop: number;
  lunge: number;
}

export const FIXED_UPDATE_FPS = 120;