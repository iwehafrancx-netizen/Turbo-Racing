// Fallback used when running outside a game portal (local testing, own site).
export class LocalPlatform {
  constructor() {
    this.name = 'local';
    this._mute = [];
    this._pause = [];
  }
  async init() {}
  loadingStart() {}
  loadingStop() {}
  gameplayStart() {}
  gameplayStop() {}
  happytime() {}
  async midgameAd() {}
  async rewardedAd() {
    // No ad network locally: grant the reward so the flow can be tested.
    return true;
  }
  getItem(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  }
  setItem(k, v) {
    try { localStorage.setItem(k, v); } catch { /* storage disabled */ }
  }
  get isMobile() {
    return matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }
  onMute(cb) { this._mute.push(cb); }
  onPause(cb) { this._pause.push(cb); }
}
