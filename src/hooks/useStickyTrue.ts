import { useState } from 'react';

// Returns `true` once `active` has been true at least once, then stays true.
// Uses React's documented "adjust state during render" pattern so callers can
// keep lazy children mounted across hide/show toggles without re-fetching the
// chunk. See: https://react.dev/reference/react/useState#storing-information-from-previous-renders
export function useStickyTrue(active: boolean): boolean {
  const [sticky, setSticky] = useState(active);
  if (active && !sticky) {
    setSticky(true);
  }
  return sticky;
}
