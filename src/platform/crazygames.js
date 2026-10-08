// CrazyGames HTML5 SDK v3 adapter.
// Docs: https://docs.crazygames.com/sdk/
export class CrazyGamesPlatform {
  constructor(sdk) {
    this.sdk = sdk;
    this.name = 'crazygames';
    this._mute = [];
    this._pause = [];
    this._playing = false;
  }

  async init() {
    await this.sdk.init();
    this.env = this.sdk.environment; // 'local' | 'crazygames' | 'disabled'
    if (this.env === 'disabled') throw new Error('CrazyGames SDK disabled on this domain');
    // Respect the portal's global mute setting.
    try {
      const apply = (s) => this._mute.forEach((cb) => cb(!!s?.muteAudio));
      this.sdk.game.addSettingsChangeListener?.((s) => apply(s));
      this._initialSettings = this.sdk.game.settings;
    } catch { /* optional API */ }
  }

  _safe(fn) {
    try { fn(); } catch (e) { console.warn('[crazygames]', e); }
  }

  loadingStart() { this._safe(() => this.sdk.game.loadingStart()); }
  loadingStop() { this._safe(() => this.sdk.game.loadingStop()); }
  gameplayStart() {
    if (this._playing) return;
    this._playing = true;
    this._safe(() => this.sdk.game.gameplayStart());
  }
  gameplayStop() {
    if (!this._playing) return;
    this._playing = false;
    this._safe(() => this.sdk.game.gameplayStop());
  }
  happytime() { this._safe(() => this.sdk.game.happytime()); }

  _ad(type) {
    return new Promise((resolve) => {
      let started = false;
      const done = (ok) => {
        if (started) this._pause.forEach((cb) => cb(false));
        resolve(ok);
      };
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => { started = true; this._pause.forEach((cb) => cb(true)); },
          adFinished: () => done(true),
          adError: (err) => { console.info('[crazygames] ad error', err); done(false); },
        });
      } catch (e) {
        console.warn('[crazygames] requestAd failed', e);
        resolve(false);
      }
    });
  }
  async midgameAd() { await this._ad('midgame'); }
  async rewardedAd() { return this._ad('rewarded'); }

  // SDK data module syncs to the player's CrazyGames account; falls back to localStorage.
  getItem(k) {
    try {
      if (this.sdk.data) return this.sdk.data.getItem(k);
    } catch { /* fall through */ }
    try { return localStorage.getItem(k); } catch { return null; }
  }
  setItem(k, v) {
    try {
      if (this.sdk.data) { this.sdk.data.setItem(k, v); return; }
    } catch { /* fall through */ }
    try { localStorage.setItem(k, v); } catch { /* */ }
  }

  get isMobile() {
    try {
      const t = this.sdk.user?.systemInfo?.device?.type;
      if (t) return t === 'mobile' || t === 'tablet';
    } catch { /* */ }
    return matchMedia('(pointer: coarse)').matches;
  }
  onMute(cb) {
    this._mute.push(cb);
    if (this._initialSettings?.muteAudio) cb(true);
  }
  onPause(cb) { this._pause.push(cb); }
}
