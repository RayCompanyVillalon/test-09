import type { PlayerController, WeaponType } from '../player/PlayerController';
import type { Mettle } from '../systems/Mettle';

type ToastTone = 'amber' | 'red' | '';

export class Hud {
  private readonly mettleValue = mustGet<HTMLElement>('mettle-value');
  private readonly mettleFill = mustGet<HTMLElement>('mettle-fill');
  private readonly staminaFill = mustGet<HTMLElement>('stamina-fill');
  private readonly healthFill = mustGet<HTMLElement>('health-fill');
  private readonly healthValue = mustGet<HTMLElement>('health-value');
  private readonly toastEl = mustGet<HTMLElement>('toast');
  private readonly victoryEl = mustGet<HTMLElement>('victory');
  private readonly flashEl = mustGet<HTMLElement>('flash');
  private readonly debugEl = mustGet<HTMLElement>('debug');
  private readonly debugBody = mustGet<HTMLElement>('debug-body');
  private readonly weaponName = mustGet<HTMLElement>('weapon-name');
  private readonly weaponCharges = mustGet<HTMLElement>('weapon-charges');
  private readonly bossPanel = mustGet<HTMLElement>('boss-panel');
  private readonly bossName = mustGet<HTMLElement>('boss-name');
  private readonly bossValue = mustGet<HTMLElement>('boss-value');
  private readonly bossFill = mustGet<HTMLElement>('boss-fill');

  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private bossPercent = -1;

  update(mettle: Mettle, controller: PlayerController): void {
    const mettleRatio = mettle.ratio;
    this.mettleValue.textContent = `${Math.round(mettleRatio * 100)}%`;
    this.mettleFill.style.width = `${mettleRatio * 100}%`;
    if (mettle.broken) {
      this.mettleFill.style.background = '#8a6a4a';
    } else if (mettleRatio < 0.25) {
      this.mettleFill.style.background = '#d08050';
    } else {
      this.mettleFill.style.background = '#5a8fc4';
    }

    // Stamina is just mettle visualization
    const staminaRatio = mettleRatio;
    this.staminaFill.style.width = `${staminaRatio * 100}%`;

    const healthRatio = Math.max(0, Math.min(1, controller.health / controller.maxHealth));
    this.healthFill.style.width = `${healthRatio * 100}%`;
    this.healthFill.style.background = healthRatio > 0.5 ? '#8a3a2a' : healthRatio > 0.25 ? '#b05a30' : '#d03020';
    this.healthValue.textContent = `${Math.ceil(controller.health)}`;

    // Weapon display
    this.updateWeapon(controller.currentWeapon, controller.spearCharges);
  }

  private updateWeapon(weapon: WeaponType, spearCharges: number): void {
    switch (weapon) {
      case 'sword':
        this.weaponName.textContent = 'SWORD';
        this.weaponName.style.color = '#c0b090';
        this.weaponCharges.textContent = '';
        break;
      case 'spear':
        this.weaponName.textContent = 'SPEAR';
        this.weaponName.style.color = '#a0b0c0';
        this.weaponCharges.textContent = `${'●'.repeat(spearCharges)}${'○'.repeat(3 - spearCharges)}`;
        break;
      case 'greatsword':
        this.weaponName.textContent = 'HEAVY GSWORD';
        this.weaponName.style.color = '#d0a060';
        this.weaponCharges.textContent = '2x DMG';
        break;
    }
  }

  toast(text: string, tone: ToastTone = 'amber'): void {
    if (this.toastTimer) { clearTimeout(this.toastTimer); this.toastTimer = null; }
    this.toastEl.textContent = text;
    this.toastEl.className = `toast show ${tone}`.trim();
    this.toastTimer = setTimeout(() => { this.toastEl.classList.remove('show'); this.toastTimer = null; }, 1550);
  }

  showVictory(): void {
    this.victoryEl.hidden = false;
  }

  flash(): void {
    this.flashEl.classList.remove('show');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('show');
  }

  setDebugVisible(visible: boolean): void {
    this.debugEl.hidden = !visible;
  }

  setDebugText(text: string): void {
    this.debugBody.textContent = text;
  }
}

function mustGet<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`HUD element #${id} is missing from the document`);
  return el as T;
}