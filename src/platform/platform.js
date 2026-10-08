// Platform abstraction. The game only talks to this interface, so supporting
// another portal (e.g. Playgama) means adding one adapter file.
//
//   init()                     -> Promise
//   loadingStart/Stop()        -> loading screen events
//   gameplayStart/Stop()       -> player is / isn't actively playing
//   happytime()                -> celebrate moment (e.g. winning)
//   midgameAd()                -> Promise<void>  (interstitial)
//   rewardedAd()               -> Promise<boolean> (true = reward earned)
//   getItem/setItem            -> persistent storage
//   isMobile                   -> boolean
//   onMute(cb)                 -> platform asks game to (un)mute
//   onPause(cb)                -> ad started/finished: pause/resume game

import { CrazyGamesPlatform } from './crazygames.js';
import { LocalPlatform } from './local.js';

export async function createPlatform() {
  const forced = new URLSearchParams(location.search).get('platform');
  let p;
  if (forced !== 'local' && window.CrazyGames?.SDK) p = new CrazyGamesPlatform(window.CrazyGames.SDK);
  else p = new LocalPlatform();
  try {
    await p.init();
  } catch (e) {
    console.warn('[platform] init failed, falling back to local', e);
    p = new LocalPlatform();
    await p.init();
  }
  return p;
}
