/**
 * The window's real height in an installed app, when the browser will not say.
 *
 * iOS home-screen apps report a viewport that still allows for browser chrome
 * they do not have: `100dvh`, `100%` off the document element and
 * `window.innerHeight` all come out short by roughly a toolbar, so a frame
 * built from any of them ends above the bottom of the screen and everything
 * pinned to its foot floats. There is one number in the page that is not
 * derived from that viewport — `screen.height`, the device screen — and a
 * standalone app with `viewport-fit=cover` covers exactly that.
 *
 * So the height is measured rather than assumed, and the measurement is refused
 * unless it is certain:
 *
 * - Only in a standalone app. A browser tab has real chrome and `dvh` is the
 *   right unit there, including the height it changes to as the toolbar goes.
 * - Only when the window is as wide as the screen. An iPadOS app in split view
 *   is a window on part of the screen, and `screen.height` says nothing about
 *   how tall that window is.
 * - Only when the shortfall is toolbar-sized. A software keyboard takes far
 *   more than a toolbar, and an unrotated `screen.height` in landscape is out
 *   by hundreds; both fall outside the bound and are left alone.
 *
 * When none of that holds it returns null, which means "use the stylesheet's
 * value" rather than a guess. On a device with no bug the shortfall is zero and
 * this changes nothing at all.
 */

export interface WindowMetrics {
  /** Installed to a home screen rather than open in a browser tab. */
  standalone: boolean;
  screenWidth: number;
  screenHeight: number;
  innerWidth: number;
  innerHeight: number;
}

/**
 * The widest a browser toolbar can plausibly be. Safari's bottom bar is about
 * 50px, older ones about 90; a keyboard is 300 and up, which is the case this
 * bound exists to exclude.
 */
const MAX_CHROME = 120;

/** Rounding between the reported window and screen widths, not a real gap. */
const WIDTH_SLACK = 2;

/** The height to force, in pixels, or null to leave the stylesheet alone. */
export function measuredAppHeight(metrics: WindowMetrics): number | null {
  if (!metrics.standalone) return null;
  if (Math.abs(metrics.screenWidth - metrics.innerWidth) > WIDTH_SLACK) return null;

  const shortfall = metrics.screenHeight - metrics.innerHeight;
  if (shortfall <= 0 || shortfall > MAX_CHROME) return null;

  return metrics.screenHeight;
}

function readMetrics(): WindowMetrics {
  return {
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  };
}

function apply(): void {
  const height = measuredAppHeight(readMetrics());
  const root = document.documentElement;
  // Removing rather than writing the stylesheet's value back: the inline
  // property would otherwise shadow the media query that picks between them.
  if (height === null) root.style.removeProperty('--app-height');
  else root.style.setProperty('--app-height', `${height}px`);
}

/**
 * Measures now and again whenever the window itself could have changed shape.
 *
 * Deliberately not on `resize`: a keyboard fires that on every frame it
 * animates, and the frame following the keyboard up is not wanted — the bar
 * belongs at the bottom of the window, and the keyboard is over the window
 * rather than part of it. `visibilitychange` is here because iOS re-measures a
 * standalone app when it comes back to the foreground, which is the one moment
 * a stale height corrects itself.
 */
export function trackAppHeight(): () => void {
  if (typeof window === 'undefined') return () => {};

  apply();
  window.addEventListener('orientationchange', apply);
  document.addEventListener('visibilitychange', apply);

  return () => {
    window.removeEventListener('orientationchange', apply);
    document.removeEventListener('visibilitychange', apply);
  };
}
