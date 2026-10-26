const ALL_MODULE_IDS = [
  'instagram',
  'stocks',
  'crypto',
  'projects',
  'sports',
  'calendar',
  'notes',
  'email',
  'weather',
  'ai',
  'agents',
  'news',
  'music',
  'system',
] as const;

export type ModuleId = (typeof ALL_MODULE_IDS)[number];

/**
 * The cards on the ring. The iPhone app and the new-tab extension leave out the
 * ones only Divina for Windows can fill: a store listing can't show features
 * that aren't there.
 */
const APP_ONLY: readonly ModuleId[] = ['instagram', 'stocks', 'projects', 'sports', 'email'];
const STORE_BUILD = ['ios', 'extension'].includes(process.env.NEXT_PUBLIC_DIVINA_PLATFORM ?? '');
export const MODULE_IDS: readonly ModuleId[] = STORE_BUILD ? ALL_MODULE_IDS.filter((id) => !APP_ONLY.includes(id)) : ALL_MODULE_IDS;

export function isModuleId(x: string): x is ModuleId {
  return (MODULE_IDS as readonly string[]).includes(x);
}
