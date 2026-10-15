// Settings utility to store, retrieve, and respect settings like reduceShake, volume, and graphics

export interface GameSettings {
  graphicsQuality: 'Low' | 'Medium' | 'High';
  fpsCap: 30 | 60 | 120;
  reduceShake: boolean;
  masterVolume: number; // 0 to 1
}

export function getDefaultSettings(): GameSettings {
  const isWeak =
    (typeof navigator !== 'undefined' &&
      ((navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
        ('maxTouchPoints' in navigator && navigator.maxTouchPoints > 0)));

  return {
    graphicsQuality: isWeak ? 'Low' : 'Medium',
    fpsCap: 60,
    reduceShake: false,
    masterVolume: 0.8,
  };
}

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem('game_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...getDefaultSettings(),
        ...parsed,
      };
    }
    // Also check standalone keys if set
    const standaloneShake = localStorage.getItem('reduceShake');
    if (standaloneShake !== null) {
      return {
        ...getDefaultSettings(),
        reduceShake: standaloneShake === 'true',
      };
    }
  } catch {}
  return getDefaultSettings();
}

export function saveSettings(settings: Partial<GameSettings>): GameSettings {
  const current = loadSettings();
  const updated = { ...current, ...settings };
  try {
    localStorage.setItem('game_settings', JSON.stringify(updated));
    if (updated.reduceShake !== undefined) {
      localStorage.setItem('reduceShake', updated.reduceShake ? 'true' : 'false');
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('game_settings_changed', { detail: updated }));
    }
  } catch {}
  return updated;
}

export function isReduceShakeEnabled(): boolean {
  try {
    const standalone = localStorage.getItem('reduceShake');
    if (standalone === 'true') return true;
    const settings = loadSettings();
    return Boolean(settings.reduceShake);
  } catch {}
  return false;
}

export function getShakeMultiplier(): number {
  return isReduceShakeEnabled() ? 0.3 : 1.0;
}

