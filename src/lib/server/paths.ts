import 'server-only';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where Divina keeps things that belong to the person, not the program:
 * settings, API keys, portfolio, calendar. The Windows installer points
 * DIVINA_DATA_DIR at %APPDATA%\Divina so reinstalling or updating never
 * touches them. Running from source, it is the project's data/ folder.
 */
export const userDataDir = (): string => process.env.DIVINA_DATA_DIR || join(process.cwd(), 'data');

/** A data file: the person's own copy if they have one, else the one shipped with Divina. */
export function dataFile(name: string): string {
  const own = join(userDataDir(), name);
  return existsSync(own) ? own : join(process.cwd(), 'data', name);
}
