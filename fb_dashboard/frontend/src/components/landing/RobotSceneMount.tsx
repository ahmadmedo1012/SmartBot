'use client';

import dynamic from 'next/dynamic';

/* P12-2c — the hero's browser-only robot mount. `ssr: false` is not
 * allowed in Server Components (Next.js 16/Turbopack), so the dynamic
 * import lives in this thin client wrapper; the landing page (server
 * component) mounts it and keeps its instant inline h1/sub paint.
 * P16-A: the mounted engine is now the CHARACTER scene (the authored
 * GLB attendant + its lazy GLTFLoader ride this chunk — the retired
 * primitives RobotScene is deleted). */

const CharacterScene = dynamic(() => import('@/components/landing/CharacterScene'), {
  ssr: false,
  loading: () => null, /* the CSS stage ground carries the first paint */
});

export function RobotSceneMount({ className }: { className?: string }) {
  return <CharacterScene className={className} />;
}
