import 'server-only';
import { setting } from './settings';

/**
 * ESPN's scoreboard and Yahoo's quote endpoints are public but not licensed
 * for use in apps. Divina only calls them when the person has switched them
 * on for their own personal use (Settings → Sports), never by default.
 */
export const unofficialFeedsOn = () => setting('DIVINA_UNOFFICIAL_FEEDS') === 'on';

export const UNOFFICIAL_OFF = (what: string) =>
  `${what} come from a free public feed that isn’t licensed for apps, so it’s off. You can switch it on for your own personal use in ⚙ Settings → Sports & stocks.`;
