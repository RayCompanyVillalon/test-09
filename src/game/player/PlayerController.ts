import {
  COMBAT,
  PHYSICS,
  PLAYER,
  COMBO_ATTACKS,
  type AttackDef,
} from '../config';
import type { Rect } from '../physics/aabb';
import type { Body, CollisionWorld } from '../physics/kinematic';
import { moveBody } from '../physics/kinematic';
import type { Mettle } from '../systems/Mettle';
import { moveTowards } from '../util/math';

export type WeaponType = 'sword' | 'spear' | 'greatsword';

export interface PlayerInput {
  left: boolean;
  right: boolean;
  down: boolean;
  jump: boolean;
  jumpPressed: boolean;
  rollHeld: boolean;
  rollPressed: boolean;
  attackPressed: boolean;
  parryPressed: boolean;
  crouch: boolean;
}

export type ControllerEvent =
  | { type: 'jump' }
  | { type: 'land'; impact: number }
  | { type: 'roll'; direction: number }
  | { type: 'attack'; index: number }
  | { type: 'parry' }
  | { type: 'parrySuccess' }
  | { type: 'bonk'; impact: number }
  | { type: 'drop' }
  | { type: 'spearThrow' }
  | { type: 'weaponChange'; weapon: WeaponType };

export type PlayerStateName =
  | 'idle' | 'run' | 'jump' | 'fall' | 'roll'
  | 'attack' | 'parry' | 'hurt' | 'dead' | 'crouch';

export class PlayerController {
  readonly body: Body;

  facing: 1 | -1 = 1;
  coyote = 0;
  jumpBuffer = 0;
  rollTime = 0;
  rollCooldown = 0;
  rollDirection: 1 | -1 = 1;
  time = 0;
  runPhase = 0;
  standingOnOneWay = false;
  /** Last position where the player stood on solid ground (pit respawn point). */
  lastSafe: { x: number; y: number };

  // Crouch / slide
  crouching = false;
  slideTime = 0;

  health: number = COMBAT.playerMaxHealth;
  readonly maxHealth: number = COMBAT.playerMaxHealth;
  invulnerable = 0;
  stun = 0;
  parryWindow = 0;
  parryActive = false;
  isParrying = false;

  // Attack
  attackIndex = -1;
  attackTime = 0;
  attackId = 0;
  attackDamage = 0;
  attackReach = 0;
  comboQueued = false;
  currentAttack: AttackDef | null = null;

  // Scroll damage cooldown
  scrollDamageCooldown = 0;

  // Weapon system
  currentWeapon: WeaponType = 'sword';
  spearCharges = 0;
  spearThrowing = false;

  constructor(x: number, y: number) {
    this.body = {
      x, y,
      w: PLAYER.width,
      h: PLAYER.height,
      vx: 0, vy: 0,
      onGround: false,
      standingOnOneWay: false,
    };
    this.lastSafe = { x, y };
  }

  get stateName(): PlayerStateName {
    if (this.isDead) return 'dead';
    if (this.stun > 0) return 'hurt';
    if (this.isAttacking) return 'attack';
    if (this.isParrying) return 'parry';
    if (this.rollTime > 0) return 'roll';
    if (this.crouching && this.body.onGround) return 'crouch';
    if (!this.body.onGround) return this.body.vy < 0 ? 'jump' : 'fall';
    return Math.abs(this.body.vx) > 20 ? 'run' : 'idle';
  }

  get isAttacking(): boolean {
    return this.currentAttack !== null;
  }

  get isDead(): boolean {
    return this.health <= 0;
  }

  get attackProgress(): number {
    return this.currentAttack ? this.attackTime / this.currentAttack.duration : 0;
  }

  get isAttackActive(): boolean {
    return this.currentAttack !== null &&
      this.attackTime >= this.currentAttack.activeStart &&
      this.attackTime <= this.currentAttack.activeEnd;
  }

  getAttackBox(): Rect | null {
    if (!this.currentAttack || !this.isAttackActive) return null;
    const reach = this.attackReach;
    const x = this.facing === 1
      ? this.body.x + this.body.w - 4
      : this.body.x + 4 - reach;
    return { x, y: this.body.y + 2, w: reach, h: this.currentAttack.height };
  }

  /** Parry hitbox — wider than attack, covers the knight's front. */
  getParryBox(): Rect | null {
    if (!this.parryActive) return null;
    const w = 40;
    const x = this.facing === 1
      ? this.body.x + this.body.w - 6
      : this.body.x + 6 - w;
    return { x, y: this.body.y - 4, w, h: this.body.h + 8 };
  }

  isRolling(): boolean {
    return this.rollTime > 0;
  }

  step(
    input: PlayerInput,
    dt: number,
    world: CollisionWorld,
    mettle: Mettle,
  ): ControllerEvent[] {
    const events: ControllerEvent[] = [];
    this.time += dt;

    const wasOnGround = this.body.onGround;
    this.rollCooldown = Math.max(0, this.rollCooldown - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.parryWindow = Math.max(0, this.parryWindow - dt);
    this.scrollDamageCooldown = Math.max(0, this.scrollDamageCooldown - dt);
    const stunned = this.stun > 0;

    // Parry active window
    if (this.isParrying && this.parryWindow <= 0) {
      this.isParrying = false;
      this.parryActive = false;
    }

    if (wasOnGround) {
      this.coyote = PHYSICS.coyoteTime;
    } else {
      this.coyote = Math.max(0, this.coyote - dt);
    }

    if (stunned) {
      this.cancelAttack();
      this.isParrying = false;
      this.parryActive = false;
    }

    if (input.jumpPressed && !stunned && !this.isDead) {
      this.jumpBuffer = PHYSICS.jumpBufferTime;
    }

    // --- Crouch / Slide ---
    if (input.crouch && wasOnGround && !this.isAttacking && !stunned && !this.isDead && this.rollTime <= 0) {
      this.crouching = true;
      this.slideTime = PHYSICS.slideTime;
      this.body.h = PHYSICS.crouchHeight;
    }

    if (this.crouching) {
      this.slideTime -= dt;
      if (this.slideTime <= 0 || !wasOnGround || stunned) {
        this.crouching = false;
        this.body.h = PLAYER.height;
      }
    }

    // --- Roll dodge ---
    if (this.rollTime > 0) {
      this.rollTime = Math.max(0, this.rollTime - dt);
      this.body.vx = this.rollDirection * PHYSICS.dashSpeed * 0.7;
      if (this.rollTime <= 0) {
        this.body.vx *= PHYSICS.dashEndSpeedMul;
        this.invulnerable = Math.max(this.invulnerable, 0.1);
      }
    }

    // --- Attack state ---
    if (this.isAttacking && this.currentAttack) {
      this.attackTime += dt;
      if (input.attackPressed && this.attackIndex < COMBO_ATTACKS.length - 1 && !stunned) {
        this.comboQueued = true;
      }
      if (this.attackTime >= this.currentAttack.duration) {
        if (this.comboQueued && this.attackIndex < COMBO_ATTACKS.length - 1 && !stunned && !this.isDead) {
          this.startAttack(this.attackIndex + 1, events);
        } else {
          this.cancelAttack();
        }
      }
    }

    // --- Start an attack ---
    if (input.attackPressed && !this.isAttacking && !stunned && !this.isDead && this.rollTime <= 0) {
      if (this.currentWeapon === 'spear' && this.spearCharges > 0) {
        // Spear throw
        this.spearThrowing = true;
        this.spearCharges -= 1;
        this.crouching = false;
        this.body.h = PLAYER.height;
        this.facing = input.left || input.right ? (input.right ? 1 : -1) : this.facing;
        events.push({ type: 'spearThrow' });
        if (this.spearCharges <= 0) {
          this.currentWeapon = 'sword';
          events.push({ type: 'weaponChange', weapon: 'sword' });
        }
      } else if (mettle.spend(COMBAT.mettleAttackCost)) {
        this.crouching = false;
        this.body.h = PLAYER.height;
        this.facing = input.left || input.right ? (input.right ? 1 : -1) : this.facing;
        this.startAttack(0, events);
      }
    }

    // --- Parry ---
    if (input.parryPressed && !this.isAttacking && !stunned && !this.isDead && this.rollTime <= 0) {
      if (!this.isParrying) {
        if (mettle.spend(COMBAT.mettleParryCost)) {
          this.isParrying = true;
          this.parryActive = true;
          this.parryWindow = COMBAT.parryWindow;
          this.crouching = false;
          this.body.h = PLAYER.height;
          events.push({ type: 'parry' });
        }
      }
    }

    // --- Jump ---
    if (this.jumpBuffer > 0 && (wasOnGround || this.coyote > 0) &&
        !this.isAttacking && !stunned && this.rollTime <= 0 && !this.crouching) {
      this.body.vy = -PHYSICS.jumpVelocity;
      this.body.onGround = false;
      this.body.standingOnOneWay = false;
      this.jumpBuffer = 0;
      this.coyote = 0;
      events.push({ type: 'jump' });
    }

    // --- Roll input ---
    if (input.rollPressed && !stunned && !this.isAttacking && this.rollCooldown <= 0 && this.rollTime <= 0) {
      if (mettle.spend(COMBAT.mettleRollCost)) {
        this.crouching = false;
        this.body.h = PLAYER.height;
        const dir: 1 | -1 = input.left ? -1 : 1;
        this.facing = dir;
        this.rollDirection = dir;
        this.rollTime = PHYSICS.dashTime;
        this.rollCooldown = PHYSICS.dashCooldown;
        this.body.vx = dir * PHYSICS.dashSpeed;
        if (wasOnGround) this.body.vy = 0;
        this.body.onGround = false;
        this.invulnerable = COMBAT.rollInvulnerableTime;
        events.push({ type: 'roll', direction: dir });
      }
    }

    // --- Horizontal movement ---
    if (this.rollTime > 0) {
      this.body.vx = this.rollDirection * PHYSICS.dashSpeed * 0.7;
    } else {
      const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (!this.isAttacking && !stunned && direction !== 0) {
        this.facing = direction as 1 | -1;
      }

      const speedMul = this.crouching ? PHYSICS.crouchMoveMul : 1;

      if (stunned) {
        this.body.vx = moveTowards(this.body.vx, 0, 700 * dt);
      } else if (this.isAttacking) {
        const target = direction * PHYSICS.maxRunSpeed * COMBAT.playerAttackMoveMul;
        this.body.vx = moveTowards(this.body.vx, target, 900 * dt);
      } else {
        const target = direction * PHYSICS.maxRunSpeed * speedMul;
        const acceleration = wasOnGround
          ? (direction !== 0 ? PHYSICS.groundAccel : PHYSICS.groundDecel)
          : (direction !== 0 ? PHYSICS.airAccel : PHYSICS.airDrag);
        this.body.vx = moveTowards(this.body.vx, target, acceleration * dt);
      }
    }

    // --- Gravity ---
    if (this.rollTime <= 0) {
      if (!this.body.onGround) {
        let gravity = this.body.vy < 0 ? PHYSICS.gravityUp : PHYSICS.gravityDown;
        if (this.body.vy < 0 && !input.jump && !stunned) {
          gravity *= PHYSICS.jumpCutGravityMul;
        }
        if (Math.abs(this.body.vy) < PHYSICS.apexThreshold) {
          gravity *= PHYSICS.apexGravityMul;
        }
        this.body.vy = Math.min(this.body.vy + gravity * dt, PHYSICS.maxFallSpeed);
      } else if (this.body.vy > 0) {
        this.body.vy = 0;
      }
    }

    // --- Move + resolve ---
    const fallSpeed = this.body.vy;
    const result = moveBody(this.body, dt, world, {
      dropThrough: false,
      cornerCorrection: PHYSICS.cornerCorrection,
    });
    this.standingOnOneWay = this.body.standingOnOneWay;

    if (this.body.onGround) {
      this.lastSafe = { x: this.body.x, y: this.body.y };
    }

    if (!wasOnGround && this.body.onGround) {
      events.push({ type: 'land', impact: Math.abs(fallSpeed) });
    }

    if (result.bonked) {
      events.push({ type: 'bonk', impact: result.impact });
    }

    this.runPhase += (Math.abs(this.body.vx) * dt) / 36;

    return events;
  }

  /** Check if a parry would succeed against an attack from sourceX. */
  tryParry(_sourceX: number): boolean {
    if (!this.parryActive) return false;
    // Parry success
    this.parryActive = false;
    this.isParrying = false;
    this.parryWindow = 0;
    return true;
  }

  takeDamage(amount: number, sourceX: number): boolean {
    if (amount <= 0 || this.invulnerable > 0 || this.isDead) return false;

    this.health = Math.max(0, this.health - amount);
    this.invulnerable = COMBAT.playerInvulnerableTime;
    this.stun = COMBAT.playerHurtStun;
    this.cancelAttack();
    this.isParrying = false;
    this.parryActive = false;
    this.rollTime = 0;

    const centerX = this.body.x + this.body.w / 2;
    const direction = Math.sign(centerX - sourceX) || -this.facing;
    this.body.vx = direction * COMBAT.playerKnockbackX;
    this.body.vy = COMBAT.playerKnockbackY;
    this.body.onGround = false;
    this.body.standingOnOneWay = false;
    this.facing = sourceX < centerX ? -1 : 1;
    return true;
  }

  heal(amount: number): void {
    if (this.isDead || amount <= 0) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /**
   * Damage from falling into a pit. Unlike takeDamage this ignores i-frames and
   * applies no knockback or stun — the fall itself already moved the player.
   * Returns true when the hit was lethal.
   */
  applyFallDamage(amount: number): boolean {
    if (this.isDead || amount <= 0) return false;
    this.health = Math.max(0, this.health - amount);
    return this.isDead;
  }

  resetCombat(): void {
    this.health = this.maxHealth;
    this.invulnerable = 0;
    this.stun = 0;
    this.cancelAttack();
    this.isParrying = false;
    this.parryActive = false;
  }

  teleport(x: number, y: number): void {
    this.body.x = x;
    this.body.y = y;
    this.body.vx = 0;
    this.body.vy = 0;
    this.body.onGround = false;
    this.body.standingOnOneWay = false;
    this.standingOnOneWay = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.rollTime = 0;
    this.rollCooldown = 0;
    this.crouching = false;
    this.slideTime = 0;
    this.isParrying = false;
    this.parryActive = false;
    this.invulnerable = 0;
    this.stun = 0;
    this.cancelAttack();
    this.currentWeapon = 'sword';
    this.spearCharges = 0;
    this.spearThrowing = false;
  }

  /**
   * Reposition after a pit fall: resets movement/combat state but keeps the
   * player's equipped weapon (unlike teleport).
   */
  respawnAt(x: number, y: number): void {
    this.body.x = x;
    this.body.y = y;
    this.body.vx = 0;
    this.body.vy = 0;
    this.body.onGround = false;
    this.body.standingOnOneWay = false;
    this.standingOnOneWay = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.rollTime = 0;
    this.rollCooldown = 0;
    this.crouching = false;
    this.slideTime = 0;
    this.isParrying = false;
    this.parryActive = false;
    this.stun = 0;
    this.cancelAttack();
  }

  equipWeapon(weapon: WeaponType): void {
    this.currentWeapon = weapon;
    if (weapon === 'spear') {
      this.spearCharges = 3;
    }
    this.cancelAttack();
  }

  private startAttack(index: number, events: ControllerEvent[]): void {
    const attack = COMBO_ATTACKS[index];
    if (!attack) return;

    this.currentAttack = attack;
    this.attackIndex = index;
    this.attackTime = 0;
    this.attackId += 1;
    this.comboQueued = false;

    // Apply weapon damage multiplier
    const weaponMul = this.currentWeapon === 'greatsword' ? 2.0 : 1.0;
    this.attackDamage = attack.damage * weaponMul;
    this.attackReach = attack.reach;

    if (this.body.onGround) {
      this.body.vx = this.facing * attack.lunge;
    } else {
      this.body.vx = this.body.vx * 0.25 + this.facing * attack.lunge * 0.3;
    }

    events.push({ type: 'attack', index });
  }

  private cancelAttack(): void {
    this.currentAttack = null;
    this.attackIndex = -1;
    this.attackTime = 0;
    this.attackDamage = 0;
    this.attackReach = 0;
    this.comboQueued = false;
  }

  
}