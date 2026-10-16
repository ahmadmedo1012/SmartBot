/* P16-A (concept A — CHARACTER-LED CINEMATIC) — THE HERO BEAT BUS.
 *
 * A one-file, zero-dependency event bridge between the honest scenario
 * engine (HeroTicker's stage machine — inbound → classify → reply →
 * handoff → reset) and the character scene (CharacterScene's reaction
 * layer). The ticker already owns the product truth (honest scenarios,
 * published plan digits, DEMO badges, the sr-only announcer); the bus
 * only ADDS the "the character reacts to the conversation it is having"
 * channel — the interaction that makes the product feel alive.
 *
 * Contract: window CustomEvents + one module-level "last beat" snapshot
 * (the character GLB loads asynchronously AFTER the ticker may have
 * already advanced — the late-mounting scene reads the current beat
 * instead of waiting for the next one). No shared state beyond that, no
 * import cycles — the scene is a dynamic import and must not pull
 * ticker bytes into its chunk, and vice versa. Client-only; the scene
 * ignores the channel entirely under prefers-reduced-motion (its own
 * contract composes a static frame). */

export type HeroBeat = 'inbound' | 'classify' | 'reply' | 'handoff' | 'reset';

export type HeroBeatDetail = {
  beat: HeroBeat;
  scenarioId: string;
};

export const HERO_BEAT_EVENT = 'smartbot:hero-beat';

let lastDetail: HeroBeatDetail | null = null;

export function dispatchHeroBeat(detail: HeroBeatDetail): void {
  lastDetail = detail;
  window.dispatchEvent(new CustomEvent<HeroBeatDetail>(HERO_BEAT_EVENT, { detail }));
}

export function lastHeroBeat(): HeroBeatDetail | null {
  return lastDetail;
}

export function subscribeHeroBeat(cb: (detail: HeroBeatDetail) => void): () => void {
  const fn = (e: Event) => cb((e as CustomEvent<HeroBeatDetail>).detail);
  window.addEventListener(HERO_BEAT_EVENT, fn);
  return () => window.removeEventListener(HERO_BEAT_EVENT, fn);
}
