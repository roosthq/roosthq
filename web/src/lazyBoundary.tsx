import { lazy, Suspense, type ComponentType } from 'react';

// React.lazy + its own Suspense boundary in one: the returned component has
// the same props as the real one and renders nothing while its chunk loads.
// A boundary per lazy component (instead of one around the whole screen) means
// a modal's first open never hides the page behind it - a single shared
// boundary would blank everything underneath while that chunk downloads.
export function lazyBoundary<C extends ComponentType<any>>(loader: () => Promise<{ default: C }>): C {
  const Lazy = lazy(loader);
  const Wrapped = (props: any) => (
    <Suspense fallback={null}>
      <Lazy {...props} />
    </Suspense>
  );
  return Wrapped as unknown as C;
}
