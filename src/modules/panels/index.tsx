'use client';
import type { ModuleId } from '../ids';
import type { ModuleData } from '@/stores/data';
import type { AIData, CalendarData, CryptoData, EmailData, InstagramData, NewsData, ProjectsData, SportsData, StocksData, SystemData, WeatherData } from '../types';
import { StocksPanel } from './Stocks';
import { WeatherPanel } from './Weather';
import { NewsPanel } from './News';
import { SportsPanel } from './Sports';
import { CalendarPanel } from './Calendar';
import { InstagramPanel } from './Instagram';
import { ProjectsPanel } from './Projects';
import { MusicPanel } from './Music';
import { SystemPanel } from './System';
import { AIPanel } from './AI';
import { CryptoPanel } from './Crypto';
import { EmailPanel } from './Email';
import { NotesPanel } from './Notes';
import { AgentsPanel } from './Agents';
import type { AgentsData, NotesData } from '../types';

export function ModuleBody({ id, md, hue }: { id: ModuleId; md: ModuleData | undefined; hue: number }) {
  if (id === 'music') return <MusicPanel md={md ?? { status: 'loading' }} hue={hue} />;
  if (!md || md.status === 'loading' || md.status === 'idle') return <p className="font-mono text-[12px] tracking-[0.2em] text-ink-lo">SYNCING…</p>;
  if (!md.data) {
    return (
      <div className="space-y-2">
        <div className={`font-mono text-[11px] uppercase tracking-[0.2em] ${md.status === 'error' ? 'text-warn' : 'text-ink-mid'}`}>{md.status === 'error' ? 'source unavailable' : 'not connected'}</div>
        <p className="text-[15px] leading-relaxed text-ink">{md.message}</p>
      </div>
    );
  }
  const d = md.data;
  switch (id) {
    case 'stocks':
      return <StocksPanel d={d as StocksData} hue={hue} />;
    case 'crypto':
      return <CryptoPanel d={d as CryptoData} hue={hue} />;
    case 'email':
      return <EmailPanel d={d as EmailData} hue={hue} />;
    case 'weather':
      return <WeatherPanel d={d as WeatherData} hue={hue} />;
    case 'news':
      return <NewsPanel d={d as NewsData} hue={hue} />;
    case 'sports':
      return <SportsPanel d={d as SportsData} hue={hue} />;
    case 'calendar':
      return <CalendarPanel d={d as CalendarData} hue={hue} />;
    case 'instagram':
      return <InstagramPanel d={d as InstagramData} hue={hue} />;
    case 'projects':
      return <ProjectsPanel d={d as ProjectsData} hue={hue} />;
    case 'system':
      return <SystemPanel d={d as SystemData} hue={hue} />;
    case 'ai':
      return <AIPanel d={d as AIData} hue={hue} />;
    case 'notes':
      return <NotesPanel d={d as NotesData} hue={hue} />;
    case 'agents':
      return <AgentsPanel d={d as AgentsData} hue={hue} />;
  }
}
