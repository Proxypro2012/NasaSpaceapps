import { decodeLink, encodeLink } from '../ui/share';
import { useStore } from './store';

/** One bridge owns incoming navigation and outgoing URL writes. */
export function startLocationSync(): () => void {
  let seenHash = location.hash;
  let applying = false;

  const write = () => {
    const s = useStore.getState();
    if (applying || !s.data || s.moving || s.playing || s.monthTour?.status === 'playing') return;
    // A hash change can precede its queued browser event. Do not overwrite it.
    if (location.hash !== seenHash) return;
    const hash = encodeLink(s);
    if (hash !== location.hash) history.replaceState(null, '', hash);
    seenHash = hash;
  };
  const read = () => {
    const hash = location.hash;
    if (hash === seenHash) return;
    seenHash = hash;
    const { data, init } = useStore.getState();
    if (!data) return; // The loader reads the current hash when it finishes.
    const selection = decodeLink(hash);
    if (Object.keys(selection).length > 0) {
      applying = true;
      try { init(data, selection); } finally { applying = false; }
    }
    write();
  };
  window.addEventListener('hashchange', read);
  window.addEventListener('popstate', read);
  const unsubscribe = useStore.subscribe(write);
  write();
  return () => {
    unsubscribe();
    window.removeEventListener('hashchange', read);
    window.removeEventListener('popstate', read);
  };
}
