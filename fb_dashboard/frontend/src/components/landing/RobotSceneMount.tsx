'use client';

import dynamic from 'next/dynamic';

/* P12-2c — the hero's browser-only robot mount. `ssr: false` is not
 * allowed in Server Components (Next.js 16/Turbopack), so the dynamic
 * import lives in this thin client wrapper; the landing page (server
 * component) mounts it and keeps its instant inline h1/sub paint. */

const RobotScene = dynamic(() => import('@/components/landing/RobotScene'), {
  ssr: false,
  loading: () => null, /* the CSS stage ground carries the first paint */
});

export function RobotSceneMount({ className }: { className?: string }) {
  return <RobotScene className={className} />;
}
