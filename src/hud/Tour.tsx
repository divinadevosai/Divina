'use client';
/**
 * First-run tour: a minute of "here's how" — turn the ring, open a card,
 * talk, type, make it yours. Steps that ask you to do something move on by
 * themselves when you do it. Shown once; "show me around" replays it.
 */
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';
import { bus } from '@/core/bus';
import { useT } from '@/lib/i18n';
import { usePrefs } from '@/stores/prefs';
import { browserLanguage } from '@/lib/languages';
import { useCompact } from './useCompact';
import { prefStorage } from '@/lib/consent';

const KEY = 'divina.tour.done';
export const useTour = create<{ step: number | null }>(() => ({ step: null }));
export const startTour = () => useTour.setState({ step: 0 });
export function tourDone(): boolean {
  try {
    return prefStorage.get(KEY) === '1';
  } catch {
    return true; // no storage: don't nag every visit
  }
}
function finish() {
  try {
    prefStorage.set(KEY, '1');
  } catch {
    /* fine */
  }
  useTour.setState({ step: null });
}

type Step = { title: string; body: string; phone?: string; waitFor?: 'rotate' | 'open' };
const STEPS: Record<string, Step[]> = {
  en: [
    { title: 'Hi, I’m Divina', body: 'Your screen, turned into a room. I’m an AI assistant, so my answers can be wrong. Let me show you around — it takes a minute.' },
    { title: 'Turn the ring', body: 'Drag sideways, scroll, or press ← →. Try it now.', phone: 'Swipe left or right. Try it now.', waitFor: 'rotate' },
    { title: 'Open a card', body: 'Click the card in front to open it. Esc closes it.', phone: 'Tap the card in front to open it.', waitFor: 'open' },
    { title: 'Talk to me', body: 'Press Space (or “voice”) and say “Divina, what’s the weather?”', phone: 'Tap “talk” and say “what’s the weather?”' },
    { title: 'Or type', body: 'Press Ctrl+K (⌘K on a Mac) and type anything: “add milk to my list”, “set a timer for 10 minutes”.', phone: 'Tap “type” and write anything: “add milk to my list”, “set a timer for 10 minutes”.' },
    { title: 'Make it yours', body: 'In ⚙ Settings: add your own AI key to talk freely, design a world with its own planet, make agents, routines and more.' },
    { title: 'Try these', body: '“Take me to Saturn.” “Turn into a human.” “Good morning.” “What can you do?”' },
  ],
  es: [
    { title: 'Hola, soy Divina', body: 'Tu pantalla, convertida en una sala. Soy una asistente de IA, así que puedo equivocarme. Te enseño cómo va — es un minuto.' },
    { title: 'Gira el anillo', body: 'Arrastra de lado, desplaza o pulsa ← →. Pruébalo.', phone: 'Desliza a izquierda o derecha. Pruébalo.', waitFor: 'rotate' },
    { title: 'Abre una tarjeta', body: 'Haz clic en la tarjeta de delante. Esc la cierra.', phone: 'Toca la tarjeta de delante para abrirla.', waitFor: 'open' },
    { title: 'Háblame', body: 'Pulsa Espacio (o «voz») y di «Divina, ¿qué tiempo hace?»', phone: 'Toca «hablar» y di «¿qué tiempo hace?»' },
    { title: 'O escribe', body: 'Pulsa Ctrl+K (⌘K en Mac) y escribe lo que quieras.', phone: 'Toca «escribir» y escribe lo que quieras.' },
    { title: 'Hazla tuya', body: 'En ⚙ Ajustes: añade tu clave de IA, diseña un mundo con su planeta, crea agentes, rutinas y más.' },
    { title: 'Prueba esto', body: '«Llévame a Saturno.» «Conviértete en humana.» «¿Qué sabes hacer?»' },
  ],
  fr: [
    { title: 'Bonjour, je suis Divina', body: 'Votre écran, transformé en pièce. Je suis une assistante IA : mes réponses peuvent être fausses. Je vous fais visiter — une minute.' },
    { title: 'Tournez l’anneau', body: 'Glissez sur le côté, faites défiler ou appuyez sur ← →. Essayez.', phone: 'Glissez à gauche ou à droite. Essayez.', waitFor: 'rotate' },
    { title: 'Ouvrez une carte', body: 'Cliquez sur la carte de devant. Échap la ferme.', phone: 'Touchez la carte de devant pour l’ouvrir.', waitFor: 'open' },
    { title: 'Parlez-moi', body: 'Appuyez sur Espace (ou « voix ») et dites « Divina, quel temps fait-il ? »', phone: 'Touchez « parler » et dites « quel temps fait-il ? »' },
    { title: 'Ou écrivez', body: 'Appuyez sur Ctrl+K (⌘K sur Mac) et écrivez ce que vous voulez.', phone: 'Touchez « écrire » et écrivez ce que vous voulez.' },
    { title: 'Personnalisez', body: 'Dans ⚙ Réglages : ajoutez votre clé d’IA, créez un monde avec sa planète, des agents, des routines…' },
    { title: 'Essayez', body: '« Emmène-moi sur Saturne. » « Deviens humaine. » « Que sais-tu faire ? »' },
  ],
  de: [
    { title: 'Hallo, ich bin Divina', body: 'Dein Bildschirm als Raum. Ich bin eine KI-Assistentin, meine Antworten können falsch sein. Ich zeige dir alles — dauert eine Minute.' },
    { title: 'Dreh den Ring', body: 'Seitlich ziehen, scrollen oder ← → drücken. Probier es.', phone: 'Nach links oder rechts wischen. Probier es.', waitFor: 'rotate' },
    { title: 'Öffne eine Karte', body: 'Klick auf die vordere Karte. Esc schließt sie.', phone: 'Tippe auf die vordere Karte.', waitFor: 'open' },
    { title: 'Sprich mit mir', body: 'Drück die Leertaste (oder „Stimme“) und sag „Divina, wie ist das Wetter?“', phone: 'Tippe auf „sprechen“ und sag „wie ist das Wetter?“' },
    { title: 'Oder tippe', body: 'Drück Strg+K (⌘K am Mac) und schreib, was du willst.', phone: 'Tippe auf „tippen“ und schreib, was du willst.' },
    { title: 'Mach sie zu deiner', body: 'In ⚙ Einstellungen: KI-Schlüssel, eigene Welt mit Planet, Agenten, Routinen und mehr.' },
    { title: 'Probier das', body: '„Bring mich zum Saturn.“ „Werde ein Mensch.“ „Was kannst du?“' },
  ],
  it: [
    { title: 'Ciao, sono Divina', body: 'Il tuo schermo, trasformato in una stanza. Sono un’assistente IA, quindi posso sbagliare. Ti mostro come funziona — un minuto.' },
    { title: 'Gira l’anello', body: 'Trascina di lato, scorri o premi ← →. Prova.', phone: 'Scorri a sinistra o a destra. Prova.', waitFor: 'rotate' },
    { title: 'Apri una scheda', body: 'Clicca la scheda davanti. Esc la chiude.', phone: 'Tocca la scheda davanti per aprirla.', waitFor: 'open' },
    { title: 'Parlami', body: 'Premi Spazio (o «voce») e di’ «Divina, che tempo fa?»', phone: 'Tocca «parla» e di’ «che tempo fa?»' },
    { title: 'Oppure scrivi', body: 'Premi Ctrl+K (⌘K su Mac) e scrivi ciò che vuoi.', phone: 'Tocca «scrivi» e scrivi ciò che vuoi.' },
    { title: 'Rendila tua', body: 'In ⚙ Impostazioni: la tua chiave IA, un mondo con il suo pianeta, agenti, routine e altro.' },
    { title: 'Prova', body: '«Portami su Saturno.» «Diventa umana.» «Cosa sai fare?»' },
  ],
  pt: [
    { title: 'Olá, sou a Divina', body: 'O seu ecrã, transformado numa sala. Sou uma assistente de IA, por isso posso errar. Mostro-lhe como funciona — é um minuto.' },
    { title: 'Rode o anel', body: 'Arraste para o lado, faça scroll ou carregue em ← →. Experimente.', phone: 'Deslize para a esquerda ou direita. Experimente.', waitFor: 'rotate' },
    { title: 'Abra um cartão', body: 'Clique no cartão da frente. Esc fecha-o.', phone: 'Toque no cartão da frente para o abrir.', waitFor: 'open' },
    { title: 'Fale comigo', body: 'Carregue em Espaço (ou «voz») e diga «Divina, como está o tempo?»', phone: 'Toque em «falar» e diga «como está o tempo?»' },
    { title: 'Ou escreva', body: 'Carregue em Ctrl+K (⌘K no Mac) e escreva o que quiser.', phone: 'Toque em «escrever» e escreva o que quiser.' },
    { title: 'Torne-a sua', body: 'Em ⚙ Definições: a sua chave de IA, um mundo com o seu planeta, agentes, rotinas e mais.' },
    { title: 'Experimente', body: '«Leva-me a Saturno.» «Transforma-te em humana.» «O que sabes fazer?»' },
  ],
};

export function Tour() {
  const step = useTour((s) => s.step);
  const lang = usePrefs((s) => s.lang) || browserLanguage();
  const steps = STEPS[lang === 'pt-br' ? 'pt' : lang] ?? STEPS.en;
  const tr = useT();
  const compact = useCompact();
  const [did, setDid] = useState(false);
  const s = step === null ? null : steps[step];
  // steps that wait for an action move on once it's done
  useEffect(() => {
    setDid(false);
    if (!s?.waitFor) return;
    return bus.on((i) => {
      if ((s.waitFor === 'rotate' && i.type === 'rotate') || (s.waitFor === 'open' && i.type === 'open')) {
        setDid(true);
        window.setTimeout(() => useTour.setState((t) => (t.step === step ? { step: (step ?? 0) + 1 } : t)), 900);
      }
    });
  }, [step, s?.waitFor]);
  const last = step !== null && step === steps.length - 1;
  return (
    <AnimatePresence>
      {s && step !== null && (
        <motion.div
          key={step}
          className={`glass fixed left-1/2 z-[65] w-[min(460px,92vw)] -translate-x-1/2 rounded-2xl p-5 ${compact ? 'top-[calc(max(16px,env(safe-area-inset-top))+56px)]' : 'bottom-24'}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          role="dialog"
          aria-label="Tour"
        >
          <div className="flex items-center justify-between">
            <span className="hud-label !text-holo-hi">
              {step + 1} / {steps.length}
            </span>
            {!last && (
              <button className="text-[12px] text-ink-lo hover:text-ink" onClick={finish}>
                {tr('tour.skip')}
              </button>
            )}
          </div>
          <h3 className="mt-2 text-[19px] text-ink">
            {s.title}
            {did ? ' ✓' : ''}
          </h3>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-mid">{compact && s.phone ? s.phone : s.body}</p>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {steps.map((_, i) => (
                <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-holo/80' : 'bg-ink-faint'}`} />
              ))}
            </div>
            {step > 0 && (
              <button className="rounded-lg border border-ink-faint px-3 py-1.5 text-[13px] text-ink-mid" onClick={() => useTour.setState({ step: step - 1 })}>
                {tr('tour.back')}
              </button>
            )}
            <button className="rounded-lg border border-holo/60 bg-holo/15 px-4 py-1.5 text-[13px] text-ink" onClick={() => (last ? finish() : useTour.setState({ step: step + 1 }))}>
              {last ? tr('tour.done') : tr('tour.next')}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
