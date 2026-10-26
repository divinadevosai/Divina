'use client';
import { useState } from 'react';
import type { ProjectsData } from '../types';
import { fmt } from '../format';
import { LinkButton, Section } from './kit';
import { openLink } from '@/lib/client/desktop';

export function ProjectsPanel({ d, hue }: { d: ProjectsData; hue: number }) {
  const [sel, setSel] = useState(0);
  const p = d.projects[sel];
  if (!p) return <p className="text-ink-mid">No projects yet — describe them in data/projects.json.</p>;
  return (
    <div className="space-y-5">
      {d.projects.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {d.projects.map((x, i) => (
            <button key={x.id} onClick={() => setSel(i)} className={`rounded-full border px-3 py-1 text-[12px] ${i === sel ? 'border-holo/60 text-ink' : 'border-ink-faint text-ink-mid'}`}>
              {x.name}
            </button>
          ))}
        </div>
      )}
      <div>
        <h3 className="text-[26px] font-light text-ink">{p.name}</h3>
        <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: `hsl(${hue} 90% 75%)` }}>{p.status}</div>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-mid">{p.description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {p.github && <LinkButton href={p.github} onOpen={openLink}>github</LinkButton>}
          {p.links?.map((l) => (
            <LinkButton key={l.url} href={l.url} onOpen={openLink}>{l.label}</LinkButton>
          ))}
        </div>
        {p.repo && (
          <div className="mt-3 flex gap-5 font-mono text-[11px] text-ink-mid tabular">
            <span>★ {p.repo.stars}</span>
            <span>forks {p.repo.forks}</span>
            <span>issues {p.repo.issues}</span>
            {p.repo.language && <span>{p.repo.language}</span>}
            <span>pushed {fmt.age(new Date(p.repo.pushedAt).getTime())}</span>
          </div>
        )}
      </div>
      {p.media.length > 0 && (
        <Section title="media">
          <div className="grid grid-cols-3 gap-2">
            {p.media.map((m) =>
              m.kind === 'video' ? <video key={m.src} src={m.src} className="rounded-md border border-ink-faint" muted loop playsInline controls /> : <img key={m.src} src={m.src} alt={m.caption ?? ''} className="rounded-md border border-ink-faint" />,
            )}
          </div>
        </Section>
      )}
      <Section title="prompt history">
        <ol className="relative space-y-3 border-l border-ink-faint pl-4">
          {p.prompts.map((pr, i) => (
            <li key={i} className="text-[13px]">
              <span className="absolute -left-[3px] mt-1.5 h-1.5 w-1.5 rounded-full" style={{ background: `hsl(${hue} 90% 70%)` }} />
              <span className="mr-2 font-mono text-[10px] uppercase text-ink-lo">{pr.at}</span>
              <span className="text-ink-mid">{pr.text}</span>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
