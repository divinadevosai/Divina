import 'server-only';
import { setting } from '@/lib/server/settings';
import { readFile } from 'node:fs/promises';
import { dataFile } from '@/lib/server/paths';
import { cached, fetchJson, type ProviderResult } from '../http';
import type { Project, ProjectsData } from '@/modules/types';

interface GhRepo {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string;
  language?: string;
}

export async function getProjects(): Promise<ProviderResult<ProjectsData>> {
  let projects: Project[];
  try {
    projects = JSON.parse(await readFile(dataFile('projects.json'), 'utf8')).projects;
  } catch {
    return { status: 'unconfigured', message: 'Describe your projects in data/projects.json.' };
  }
  const headers: Record<string, string> = setting('GITHUB_TOKEN') ? { authorization: `Bearer ${setting('GITHUB_TOKEN')}` } : {};
  await Promise.all(
    projects.map(async (p) => {
      const m = p.github && /github\.com\/([^/]+)\/([^/#?]+)/.exec(p.github);
      if (!m) return;
      try {
        const r = await cached(`gh:${m[1]}/${m[2]}`, 15 * 60_000, () =>
          fetchJson<GhRepo>(`https://api.github.com/repos/${m[1]}/${m[2]}`, { headers: { ...headers, accept: 'application/vnd.github+json' } }),
        );
        p.repo = { stars: r.stargazers_count, forks: r.forks_count, issues: r.open_issues_count, pushedAt: r.pushed_at, language: r.language };
      } catch {
        /* repo may be private; the project still renders */
      }
    }),
  );
  return { status: 'ok', data: { projects, source: 'data/projects.json · GitHub', fetchedAt: Date.now() } };
}
