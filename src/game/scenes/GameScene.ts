import { Actor, CollisionType, Scene, vec, type Engine, Color } from 'excalibur';
import * as CONFIG from '../config';
import { COMBAT, VIEW } from '../config';
import { overlaps } from '../physics/aabb';
import type { CollisionWorld } from '../physics/kinematic';
import { ROOM, enemySpawnY } from '../level/room';
import { Background } from '../level/background';
import { stoneGraphic, woodGraphic, spearPickupGraphic, greatswordPickupGraphic } from '../level/terrainArt';
import { PlayerController, type ControllerEvent } from '../player/PlayerController';
import { PlayerActor } from '../player/PlayerActor';
import { EnemyController } from '../enemies/EnemyController';
import { EnemyActor } from '../enemies/EnemyActor';
import { MothmanController } from '../enemies/MothmanController';
import { MothmanRig } from '../enemies/MothmanRig';
import { Mettle } from '../systems/Mettle';
import { ParticleSystem } from '../fx/Particles';
import { Sfx } from '../audio/Sfx';
import { Hud } from '../ui/Hud';
import { InputMap } from '../input/InputMap';
import { clamp } from '../util/math';

const SPAWN = ROOM.spawn;

interface PickupDef {
  id: string;
  x: number;
  y: number;
  kind: 'spear' | 'greatsword';
}

interface SpearProjectile {
  actor: Actor;
  vx: number;
  vy: number;
  life: number;
  hit: boolean;
}

export class GameScene extends Scene {
  private controller!: PlayerController;
  private mettle!: Mettle;
  private player!: PlayerActor;
  private background!: Background;
  private particles!: ParticleSystem;
  private controls!: InputMap;
  private hud!: Hud;
  private sfx!: Sfx;

  private readonly collisionWorld: CollisionWorld = {
    solids: ROOM.solids,
    oneWays: ROOM.oneWays,
  };

  private enemies: {
    actor: EnemyActor;
    kind: 'chaff' | 'boss';
    lastPlayerAttack: number;
    lastEnemyAttack: number;
  }[] = [];

  private boss: EnemyActor | null = null;
  private bossIntroShown = false;
  private bossDefeated = false;

  private time = 0;
  private hudTimer = 0;
  private debugTimer = 0;
  private hitstop = 0;
  private deathTimer = 0;
  private won = false;
  private debug = false;

  // Pickups
  private pickups: {
    def: PickupDef;
    actor: Actor;
    taken: boolean;
  }[] = [];

  // Spear projectiles
  private spears: SpearProjectile[] = [];

  onInitialize(engine: Engine): void {
    this.engine = engine;
    this.camera.zoom = 1;

    this.mettle = new Mettle();
    this.controller = new PlayerController(SPAWN.x, SPAWN.y);
    this.sfx = new Sfx();
    this.hud = new Hud();

    this.background = new Background(this);
    this.buildRoom();
    this.buildPickups();

    this.player = new PlayerActor();
    this.add(this.player);
    this.player.sync(this.controller, 0);

    this.particles = new ParticleSystem(this);
    this.controls = new InputMap(engine, {
      onToggleDebug: () => this.toggleDebug(),
    });
    this.hud.update(this.mettle, this.controller);

    // Start camera at spawn, following player
    this.camera.pos = vec(VIEW.width / 2, VIEW.height / 2);

    const unlock = () => this.sfx.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    if (new URLSearchParams(window.location.search).has('debug')) {
      this.toggleDebug();
    }

    window.__panda = {
      scene: this,
      controller: this.controller,
      mettle: this.mettle,
      enemies: this.enemies,
      boss: this.boss,
      room: ROOM,
      config: CONFIG,
    };

    window.setTimeout(() => {
      this.hud.toast('SURVIVE THE PATH');
    }, 650);
  }

  onPreUpdate(_engine: Engine, elapsed: number): void {
    const dt = Math.min(elapsed / 1000, 1 / 30);
    if (dt <= 0) return;

    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dt);
      return;
    }

    if (this.deathTimer > 0) {
      this.time += dt;
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) { this.respawnFromDeath(); return; }
      this.particles.update(dt);
      this.updateSpears(dt);
      this.updateHud(dt);
      return;
    }

    if (this.won) {
      this.time += dt;
      this.updateCamera(dt);
      this.background.update(this.camera.pos);
      this.particles.update(dt);
      this.updateSpears(dt);
      this.updateHud(dt);
      return;
    }

    this.time += dt;

    // --- Camera follows player (no auto-scroll) ---
    this.updateCamera(dt);

    // --- Input & systems ---
    const input = this.controls.sample();
    this.mettle.update(dt);
    const events = this.controller.step(input, dt, this.collisionWorld, this.mettle);

    this.handleEvents(events);

    // Spear throw from controller
    if (this.controller.currentWeapon === 'spear' && this.controller.spearThrowing) {
      this.controller.spearThrowing = false;
      this.throwSpear();
    }

    this.resolvePlayerAttack();
    this.updateEnemies(dt);

    if (!this.won && !this.controller.isDead && this.controller.body.x >= ROOM.endX) {
      this.triggerVictory();
    }

    if (!this.controller.isDead) {
      this.checkFall();
      this.handlePickups();
    }

    this.player.sync(this.controller, dt);
    this.background.update(this.camera.pos);
    this.particles.update(dt);
    this.updateSpears(dt);
    this.updateHud(dt);
  }

  private buildRoom(): void {
    for (const solid of ROOM.solids) {
      const graphic = solid.kind === 'wood'
        ? woodGraphic(solid.w, solid.h)
        : stoneGraphic(solid.w, solid.h);
      const actor = new Actor({
        x: solid.x, y: solid.y,
        width: solid.w, height: solid.h,
        anchor: vec(0, 0),
        collisionType: CollisionType.Passive,
        z: 0, graphic,
      });
      this.add(actor);
    }

    for (const spawn of ROOM.enemies) {
      // Feet rest exactly on the spawn surface — never sunk into it.
      const controller = new EnemyController(
        spawn.x, enemySpawnY(spawn), spawn.patrolMin, spawn.patrolMax, spawn.maxHealth,
      );
      const actor = new EnemyActor(controller, spawn.id);
      this.add(actor);
      actor.sync(0);
      this.enemies.push({ actor, kind: 'chaff', lastPlayerAttack: -1, lastEnemyAttack: -1 });
    }

    // The Moth Mother, waiting in her arena.
    const bossDef = ROOM.boss;
    const bossController = new MothmanController(
      bossDef.x, bossDef.groundTop, bossDef.arenaMin, bossDef.arenaMax, bossDef.maxHealth,
    );
    const bossActor = new EnemyActor(bossController, bossDef.id, new MothmanRig(bossController));
    this.add(bossActor);
    bossActor.sync(0);
    this.boss = bossActor;
    this.enemies.push({ actor: bossActor, kind: 'boss', lastPlayerAttack: -1, lastEnemyAttack: -1 });
  }

  private buildPickups(): void {
    const defs: PickupDef[] = [
      { id: 'spear-1', x: 1400, y: 570, kind: 'spear' },
      { id: 'spear-2', x: 3350, y: 550, kind: 'spear' },
      { id: 'greatsword-1', x: 2700, y: 582, kind: 'greatsword' },
    ];

    for (const def of defs) {
      const graphic = def.kind === 'spear' ? spearPickupGraphic() : greatswordPickupGraphic();
      const actor = new Actor({
        x: def.x, y: def.y,
        z: 8,
        graphic,
      });
      this.add(actor);
      this.pickups.push({ def, actor, taken: false });
    }
  }

  private handlePickups(): void {
    const body = this.controller.body;
    const cx = body.x + body.w / 2;
    const cy = body.y + body.h / 2;

    for (const p of this.pickups) {
      if (p.taken) continue;
      const dx = p.def.x - cx;
      const dy = p.def.y - cy;
      if (dx * dx + dy * dy > 40 * 40) continue;

      p.taken = true;
      p.actor.graphics.visible = false;
      this.controller.equipWeapon(p.def.kind);
      this.sfx.pickup();
      this.hud.toast(p.def.kind === 'spear' ? 'SPEAR · 3 THROWS' : 'HEAVY GREATSWORD · 2x DAMAGE');
    }
  }

  private throwSpear(): void {
    const body = this.controller.body;
    const startX = this.controller.facing === 1
      ? body.x + body.w
      : body.x - 20;
    const startY = body.y + body.h / 2 - 6;

    const actor = new Actor({
      x: startX, y: startY,
      width: 24, height: 6,
      color: Color.fromHex('#8888a0'),
      z: 25,
    });
    this.add(actor);

    this.spears.push({
      actor,
      vx: this.controller.facing * 700,
      vy: 0,
      life: 1.5,
      hit: false,
    });

    this.particles.jumpDust(startX, startY);
  }

  private updateSpears(dt: number): void {
    for (let i = this.spears.length - 1; i >= 0; i--) {
      const s = this.spears[i]!;
      s.life -= dt;
      if (s.life <= 0 || s.actor.pos.x > ROOM.width + 100 || s.actor.pos.x < -100) {
        this.remove(s.actor);
        s.actor.kill();
        this.spears.splice(i, 1);
        continue;
      }

      s.actor.pos = vec(s.actor.pos.x + s.vx * dt, s.actor.pos.y + s.vy * dt);

      // Hit enemy check
      if (!s.hit) {
        const spearBox = {
          x: s.actor.pos.x - 12, y: s.actor.pos.y - 3,
          w: 24, h: 6,
        };
        for (const enemy of this.enemies) {
          const m = enemy.actor.controller;
          if (!m.isAlive) continue;
          if (overlaps(spearBox, m.body)) {
            s.hit = true;
            const dmg = 25;
            const result = m.takeDamage(dmg, m.centerX);
            this.particles.hitSpark(m.centerX, m.centerY, '#a0a0c0');
            this.particles.damageNumber(m.centerX, m.centerY - 12, `${dmg}`, '#a0a0c0');
            this.sfx.hit(false);
            if (result === 'dead') this.onEnemyKilled(enemy.actor);
            break;
          }
        }
      }
    }
  }

  private updateCamera(dt: number): void {
    const body = this.controller.body;
    const cx = body.x + body.w / 2;
    const cy = body.y + body.h / 2;

    const halfW = VIEW.width / 2;
    const halfH = VIEW.height / 2;
    const minX = Math.min(halfW, ROOM.width - halfW);
    const maxX = Math.max(halfW, ROOM.width - halfW);
    const minY = Math.min(halfH, ROOM.height - halfH);
    const maxY = Math.max(halfH, ROOM.height - halfH);

    const lookAhead = clamp(body.vx * 0.1, -50, 50);
    const desiredX = cx + lookAhead;
    const delta = desiredX - this.camera.pos.x;
    let targetX = this.camera.pos.x;
    if (Math.abs(delta) > 60) {
      targetX += delta - Math.sign(delta) * 60;
    }

    let x = lerpTowards(this.camera.pos.x, targetX, 9, dt);
    x = clamp(x, minX, maxX);
    let y = clamp(cy, minY, maxY);

    this.camera.pos = vec(x, y);
  }

  private handleEvents(events: ControllerEvent[]): void {
    const body = this.controller.body;
    const centerX = body.x + body.w / 2;
    const feetY = body.y + body.h;

    for (const event of events) {
      switch (event.type) {
        case 'jump':
          this.sfx.jump();
          this.particles.jumpDust(centerX, feetY);
          break;
        case 'land':
          this.sfx.land(event.impact);
          this.particles.landDust(centerX, feetY, event.impact);
          if (event.impact > 650) this.camera.shake(3, 2, 120);
          break;
        case 'roll':
          this.sfx.roll();
          this.camera.shake(1.4, 0, 70);
          break;
        case 'attack':
          this.sfx.attack(event.index);
          if (event.index === 2) this.camera.shake(1.8, 1, 70);
          break;
        case 'parry':
          break;
        case 'parrySuccess':
          this.sfx.parry();
          this.camera.shake(2, 2, 100);
          break;
        case 'bonk':
          this.sfx.playerHurt();
          this.particles.landDust(centerX, body.y, 260);
          this.camera.shake(2.5, 1.5, 100);
          break;
        case 'spearThrow':
          // handled in onPreUpdate before handleEvents
          break;
        case 'weaponChange':
          this.hud.toast(event.weapon === 'spear' ? 'SPEAR · 3 THROWS' : 'HEAVY GREATSWORD · 2x DAMAGE');
          break;
      }
    }
  }

  private resolvePlayerAttack(): void {
    const box = this.controller.getAttackBox();
    if (!box) return;

    const attackId = this.controller.attackId;
    const damage = this.controller.attackDamage;
    const heavy = this.controller.attackIndex === 2;
    const sourceX = this.controller.body.x + this.controller.body.w / 2;
    let hits = 0;

    for (const enemy of this.enemies) {
      const monster = enemy.actor.controller;
      if (!monster.isAlive || enemy.lastPlayerAttack === attackId) continue;
      if (!overlaps(box, monster.body)) continue;

      enemy.lastPlayerAttack = attackId;
      const result = monster.takeDamage(damage, sourceX);
      if (result === 'ignored') continue;

      hits += 1;
      const left = Math.max(box.x, monster.body.x);
      const right = Math.min(box.x + box.w, monster.body.x + monster.body.w);
      const top = Math.max(box.y, monster.body.y);
      const bottom = Math.min(box.y + box.h, monster.body.y + monster.body.h);
      const hitX = (left + right) / 2;
      const hitY = (top + bottom) / 2;

      this.particles.hitSpark(hitX, hitY, heavy ? '#e0a060' : '#c0c0e0');
      this.particles.damageNumber(hitX, hitY - 12, `${Math.round(damage)}`, heavy ? '#e0a060' : '#c0c0e0');

      if (result === 'dead') this.onEnemyKilled(enemy.actor);
    }

    if (hits > 0) {
      this.sfx.hit(heavy);
      this.camera.shake(heavy ? 5 : 3, heavy ? 3 : 2, heavy ? 150 : 100);
      this.hitstop = Math.max(this.hitstop, heavy ? 0.09 : 0.05);
    }
  }

  private onEnemyKilled(enemy: EnemyActor): void {
    const monster = enemy.controller;
    const isBoss = enemy === this.boss;

    this.particles.enemyDeathBurst(monster.centerX, monster.centerY);
    this.particles.damageNumber(
      monster.centerX,
      monster.centerY - 28,
      isBoss ? 'THE MOTH MOTHER FALLS' : 'VANQUISHED',
      '#c0a080',
    );
    this.sfx.enemyDeath();
    this.camera.shake(isBoss ? 9 : 4, isBoss ? 6 : 3, isBoss ? 420 : 160);
    this.hitstop = Math.max(this.hitstop, isBoss ? 0.2 : 0.11);

    if (isBoss) {
      this.bossDefeated = true;
      this.hud.toast('THE MOTH MOTHER FALLS', 'amber');
      window.setTimeout(() => this.hud.hideBoss(), 1400);
    }
  }

  private updateEnemies(dt: number): void {
    const player = this.controller.body;
    const playerAlive = !this.controller.isDead;

    for (const enemy of this.enemies) {
      const monster = enemy.actor.controller;
      if (monster.removed) continue;

      const events = monster.step(dt, this.collisionWorld, {
        x: player.x, y: player.y, w: player.w, h: player.h, alive: playerAlive,
      });

      for (const event of events) {
        if (event.type === 'windup') this.sfx.enemyWindup();
        else if (event.type === 'attack') this.sfx.enemyAttack();
      }

      // Safety net: nothing is allowed to fall out of the world through a pit.
      // Chaff are returned to their spawn ledge; the boss is clamped to hers.
      if (monster.body.y > ROOM.height + 80) {
        if (enemy.kind === 'boss') {
          monster.body.y = ROOM.boss.groundTop - monster.body.h;
          monster.body.vy = 0;
          monster.body.onGround = true;
        } else {
          monster.placeAtSpawn();
          enemy.actor.sync(0);
          this.particles.jumpDust(monster.centerX, monster.centerY + monster.body.h / 2);
          continue;
        }
      }

      // Check parry
      const parryBox = this.controller.getParryBox();
      if (parryBox && monster.attackActive && overlaps(parryBox, monster.body)) {
        if (this.controller.tryParry(monster.centerX)) {
          monster.parryStun();
          this.particles.parryFlash(monster.centerX, monster.centerY);
          if (monster.health <= 0) {
            this.onEnemyKilled(enemy.actor);
          }
        }
      }

      // Normal enemy attack on player
      if (playerAlive) {
        const attackBox = monster.getAttackBox();
        if (attackBox && enemy.lastEnemyAttack !== monster.attackId && overlaps(attackBox, player)) {
          enemy.lastEnemyAttack = monster.attackId;
          this.damagePlayer(monster.contactDamage, monster.centerX);
        }
      }

      enemy.actor.sync(dt);
    }
  }

  private damagePlayer(amount: number, sourceX: number): void {
    if (this.controller.isDead) return;
    if (!this.controller.takeDamage(amount, sourceX)) return;

    const body = this.controller.body;
    const centerX = body.x + body.w / 2;
    const centerY = body.y + body.h / 2;

    this.hitstop = Math.max(this.hitstop, COMBAT.playerHurtHitstop);
    this.hud.flash();
    this.camera.shake(5, 3, 180);
    this.sfx.playerHurt();
    this.particles.hitSpark(centerX, centerY, '#d03020');
    this.particles.damageNumber(centerX, centerY - 30, `${Math.round(amount)}`, '#d06040');

    if (this.controller.isDead) this.beginDeath();
  }

  private triggerVictory(): void {
    this.won = true;
    this.hud.showVictory();
    this.hud.toast('THE PATH IS CLEARED');
    this.camera.shake(3, 2, 200);
  }

  private beginDeath(): void {
    this.deathTimer = 1.0;
    this.hud.toast('FALLEN', 'red');
    this.hud.flash();
    this.camera.shake(7, 5, 320);
    this.sfx.playerDeath();
    this.hitstop = Math.max(this.hitstop, 0.1);
    const body = this.controller.body;
    this.particles.enemyDeathBurst(body.x + body.w / 2, body.y + body.h / 2);
    this.player.sync(this.controller, 0);
  }

  private respawnFromDeath(): void {
    this.deathTimer = 0;
    this.hitstop = 0;

    // Respawn at a safe spot near the player's last position
    const respawnX = Math.max(80, this.controller.body.x);
    const respawnY = 540;
    this.controller.teleport(respawnX, respawnY);
    this.controller.resetCombat();
    this.controller.invulnerable = 1.5;
    this.mettle.reset();
    this.resetEnemies();
    this.hud.flash();
    this.hud.toast('RISE AGAIN');
    this.hud.update(this.mettle, this.controller);
    this.sfx.reset();
    this.particles.jumpDust(respawnX + 16, respawnY + 56);
    this.player.sync(this.controller, 0);
  }

  private resetEnemies(): void {
    for (const enemy of this.enemies) {
      enemy.actor.controller.reset();
      enemy.actor.controller.attackCooldown = 1.5;
      enemy.actor.resetVisual();
      enemy.lastPlayerAttack = -1;
      enemy.lastEnemyAttack = -1;
    }
    this.bossDefeated = false;
    this.hud.hideBoss();
  }

  private checkFall(): void {
    if (this.controller.body.y > ROOM.height + 100) {
      this.respawnFall();
    }
  }

  private respawnFall(): void {
    // Falling into a pit always costs vigor, even during i-frames.
    const lethal = this.controller.applyFallDamage(COMBAT.fallDamage);
    this.hud.update(this.mettle, this.controller);
    this.hud.flash();
    this.sfx.playerHurt();

    // Return to the last spot the player was standing safely (never mid-pit).
    const { x, y } = this.controller.lastSafe;
    this.controller.respawnAt(x, y);
    this.hitstop = 0;
    this.particles.landDust(x + 16, y + 56, 700);

    if (lethal) {
      this.beginDeath();
      return;
    }

    this.controller.invulnerable = 0.8;
    this.hud.toast('WATCH YOUR STEP', 'red');
  }

  private updateHud(dt: number): void {
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.05;
      this.hud.update(this.mettle, this.controller);
      this.updateBossHud();
    }

    if (this.debug) {
      this.debugTimer -= dt;
      if (this.debugTimer <= 0) {
        this.debugTimer = 0.1;
        this.hud.setDebugText(this.debugText());
      }
    }
  }

  private toggleDebug(): void {
    this.debug = !this.debug;
    this.engine!.toggleDebug();
    this.hud.setDebugVisible(this.debug);
    if (this.debug) { this.debugTimer = 0; this.hud.setDebugText(this.debugText()); }
  }

  /** Boss health bar + arena introduction. */
  private updateBossHud(): void {
    if (!this.boss) return;

    if (this.bossDefeated) {
      this.hud.hideBoss();
      return;
    }

    const monster = this.boss.controller;
    const nearArena = this.controller.body.x > ROOM.boss.arenaMin - 340;

    if (!this.bossIntroShown && nearArena) {
      this.bossIntroShown = true;
      this.hud.toast('THE MOTH MOTHER', 'red');
      this.sfx.enemyWindup();
    }

    if (nearArena && monster.isAlive) {
      this.hud.setBoss('THE MOTH MOTHER', monster.health, monster.maxHealth);
    }
  }

  private debugText(): string {
    const body = this.controller.body;
    const stats = this.engine!.stats.currFrame;
    const weaponName = this.controller.currentWeapon;
    return [
      `fps      ${stats.fps.toFixed(0)}`,
      `state    ${this.controller.stateName}`,
      `weapon   ${weaponName}${weaponName === 'spear' ? ` (${this.controller.spearCharges})` : ''}`,
      `health   ${this.controller.health.toFixed(0)} / ${this.controller.maxHealth}`,
      `mettle   ${this.mettle.value.toFixed(0)} / ${this.mettle.max}${this.mettle.broken ? ' (BROKEN)' : ''}`,
      `pos      ${body.x.toFixed(1)}, ${body.y.toFixed(1)}`,
      `vel      ${body.vx.toFixed(0)}, ${body.vy.toFixed(0)}`,
      `ground   ${body.onGround}`,
      `coyote   ${(this.controller.coyote * 1000).toFixed(0)} ms`,
      `attack   ${this.controller.attackIndex >= 0 ? this.controller.attackIndex + 1 : '-'}`,
      `iframes  ${(this.controller.invulnerable * 1000).toFixed(0)} ms`,
      `hitstop  ${(this.hitstop * 1000).toFixed(0)} ms`,
      `enemies  ${this.enemies.filter((e) => e.actor.controller.isAlive).length} / ${this.enemies.length}`,
      `actors   ${this.actors.length}`,
    ].join('\n');
  }
}

/** Frame-rate independent exponential interpolation towards a target. */
function lerpTowards(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}