/**
 * The words on Divina's main screens, in the languages with a full
 * translation. Anything not here (and every other language) falls back to
 * English. Divina's speech and answers follow the language setting fully;
 * these are the buttons and headings around her.
 */
import { usePrefs } from '@/stores/prefs';
import { browserLanguage, LANG_BY_CODE } from './languages';

const en = {
  talk: 'talk',
  listening: 'listening',
  voice: 'voice',
  type: 'type',
  settings: 'settings',
  hands: 'hands',
  returnSpatial: 'return to spatial',
  divinaWants: 'divina wants to',
  deny: 'Deny · Esc',
  allow: 'Allow · Enter',
  welcomeTitle: 'Welcome to Divina — free browser edition',
  welcomePhone: 'Swipe to turn the ring, tap a card to open it, or tap “type” and try “open weather”.',
  welcomeDesktop: 'Try “open weather” or the arrow keys.',
  welcomeKey: 'To talk freely, add your own Gemini, Claude or OpenAI API key in ⚙ Settings → AI. Divina is for adults (18+).',
  translator: 'translator',
  takeTurns: 'take turns',
  stop: 'stop',
  translating: 'Translating…',
  speakIn: 'Speak in {from} — I’ll say it in {to}. Say “stop translating” to finish.',
  settingsTitle: 'Settings',
  close: 'close · esc',
  'section.Voice & replies': 'Voice & replies',
  'section.Language': 'Language',
  'section.AI': 'AI',
  'section.Memory': 'Memory',
  'section.Routines': 'Routines',
  'section.Heads-ups': 'Heads-ups',
  'section.Backup & restore': 'Backup & restore',
  'section.Crypto': 'Crypto',
  'section.Weather & news': 'Weather & news',
  'section.Calendar': 'Calendar',
  'section.Email': 'Email',
  'section.Sports & stocks': 'Sports & stocks',
  'section.Accounts': 'Accounts',
  'section.Computer control': 'Computer control',
  'section.Divina for Windows': 'Divina for Windows',
  'section.Worlds': 'Worlds',
  'tour.next': 'Next',
  'tour.back': 'Back',
  'tour.skip': 'Skip tour',
  'tour.done': 'Let’s go',
  'mind.title': 'Mind',
  'mind.sub': '{n} things she knows and can do · only on this device',
  'mind.close': 'close · esc',
  'mind.empty': 'Tell her things to remember, add notes, agents and routines, and her mind grows.',
  'mind.hint': 'Tap a branch to look closer · drag to turn',
  'mind.hintFocus': 'Tap a light to open it · tap the branch again to step back',
  'mind.learned': 'Learned {when}',
  'mind.you': 'About you',
  'mind.people': 'People',
  'mind.health': 'Food & health',
  'mind.work': 'Work & study',
  'mind.places': 'Places',
  'mind.plans': 'Plans & to-dos',
  'mind.routines': 'Routines',
  'mind.agents': 'Agents',
  'mind.worlds': 'Worlds',
  'mind.skills': 'Skills',
  'cookie.title': 'Cookies and your privacy',
  'cookie.body': 'Divina uses no tracking or advertising cookies and no analytics. It keeps your settings on this device so it works, with anything personal encrypted. Should it also remember your preferences (language, the tour, hand tracking) between visits?',
  'cookie.all': 'Remember preferences',
  'cookie.essential': 'Essential only',
  'cookie.details': 'See what’s stored',
  'section.Privacy & cookies': 'Privacy & cookies',
};
export type Key = keyof typeof en;
type Dict = Partial<Record<Key, string>>;

const es: Dict = {
  talk: 'hablar', listening: 'escuchando', voice: 'voz', type: 'escribir', settings: 'ajustes', hands: 'manos', returnSpatial: 'volver al espacio',
  divinaWants: 'divina quiere', deny: 'Denegar · Esc', allow: 'Permitir · Intro',
  welcomeTitle: 'Bienvenido a Divina — versión gratuita para navegador',
  welcomePhone: 'Desliza para girar el anillo, toca una tarjeta para abrirla, o toca «escribir» y prueba «abre el tiempo».',
  welcomeDesktop: 'Prueba «abre el tiempo» o las flechas del teclado.',
  welcomeKey: 'Para hablar libremente, añade tu propia clave de Gemini, Claude u OpenAI en ⚙ Ajustes → IA. Divina es para adultos (18+).',
  translator: 'traductor', takeTurns: 'por turnos', stop: 'parar', translating: 'Traduciendo…', speakIn: 'Habla en {from} y lo diré en {to}. Di «deja de traducir» para terminar.',
  settingsTitle: 'Ajustes', close: 'cerrar · esc',
  'section.Voice & replies': 'Voz y respuestas', 'section.Language': 'Idioma', 'section.AI': 'IA', 'section.Memory': 'Memoria', 'section.Routines': 'Rutinas', 'section.Heads-ups': 'Avisos',
  'section.Backup & restore': 'Copia de seguridad', 'section.Crypto': 'Cripto', 'section.Weather & news': 'Tiempo y noticias', 'section.Calendar': 'Calendario', 'section.Email': 'Correo',
  'section.Sports & stocks': 'Deportes y bolsa', 'section.Accounts': 'Cuentas', 'section.Computer control': 'Control del ordenador', 'section.Divina for Windows': 'Divina para Windows', 'section.Worlds': 'Mundos',
  'tour.next': 'Siguiente', 'tour.back': 'Atrás', 'tour.skip': 'Saltar', 'tour.done': '¡Vamos!', 'mind.title': 'Mente', 'mind.sub': '{n} cosas que sabe y puede hacer · solo en este dispositivo', 'mind.close': 'cerrar · esc', 'mind.empty': 'Cuéntale cosas que recordar, añade notas, agentes y rutinas, y su mente crece.', 'mind.hint': 'Toca una rama para verla de cerca · arrastra para girar', 'mind.hintFocus': 'Toca una luz para abrirla · toca la rama otra vez para volver', 'mind.learned': 'Aprendido el {when}', 'mind.you': 'Sobre ti', 'mind.people': 'Personas', 'mind.health': 'Comida y salud', 'mind.work': 'Trabajo y estudios', 'mind.places': 'Lugares', 'mind.plans': 'Planes y tareas', 'mind.routines': 'Rutinas', 'mind.agents': 'Agentes', 'mind.worlds': 'Mundos', 'mind.skills': 'Habilidades', 'cookie.title': 'Cookies y tu privacidad', 'cookie.body': 'Divina no usa cookies de seguimiento ni de publicidad, ni analíticas. Guarda tus ajustes en este dispositivo para funcionar, y todo lo personal va cifrado. ¿Quieres que también recuerde tus preferencias (idioma, la guía, el seguimiento de manos) entre visitas?', 'cookie.all': 'Recordar preferencias', 'cookie.essential': 'Solo lo esencial', 'cookie.details': 'Ver qué se guarda', 'section.Privacy & cookies': 'Privacidad y cookies',
};
const fr: Dict = {
  talk: 'parler', listening: 'à l’écoute', voice: 'voix', type: 'écrire', settings: 'réglages', hands: 'mains', returnSpatial: 'retour à l’espace',
  divinaWants: 'divina veut', deny: 'Refuser · Échap', allow: 'Autoriser · Entrée',
  welcomeTitle: 'Bienvenue dans Divina — version navigateur gratuite',
  welcomePhone: 'Glissez pour tourner l’anneau, touchez une carte pour l’ouvrir, ou touchez « écrire » et essayez « ouvre la météo ».',
  welcomeDesktop: 'Essayez « ouvre la météo » ou les flèches du clavier.',
  welcomeKey: 'Pour parler librement, ajoutez votre propre clé Gemini, Claude ou OpenAI dans ⚙ Réglages → IA. Divina est réservée aux adultes (18+).',
  translator: 'traducteur', takeTurns: 'chacun son tour', stop: 'arrêter', translating: 'Traduction…', speakIn: 'Parlez en {from}, je le dirai en {to}. Dites « arrête de traduire » pour finir.',
  settingsTitle: 'Réglages', close: 'fermer · échap',
  'section.Voice & replies': 'Voix et réponses', 'section.Language': 'Langue', 'section.AI': 'IA', 'section.Memory': 'Mémoire', 'section.Routines': 'Routines', 'section.Heads-ups': 'Alertes',
  'section.Backup & restore': 'Sauvegarde', 'section.Crypto': 'Crypto', 'section.Weather & news': 'Météo et actus', 'section.Calendar': 'Agenda', 'section.Email': 'E-mail',
  'section.Sports & stocks': 'Sport et bourse', 'section.Accounts': 'Comptes', 'section.Computer control': 'Contrôle de l’ordinateur', 'section.Divina for Windows': 'Divina pour Windows', 'section.Worlds': 'Mondes',
  'tour.next': 'Suivant', 'tour.back': 'Retour', 'tour.skip': 'Passer', 'tour.done': 'C’est parti', 'mind.title': 'Esprit', 'mind.sub': '{n} choses qu’elle sait et sait faire · seulement sur cet appareil', 'mind.close': 'fermer · échap', 'mind.empty': 'Dites-lui des choses à retenir, ajoutez des notes, des agents et des routines : son esprit grandit.', 'mind.hint': 'Touchez une branche pour la voir de près · faites glisser pour tourner', 'mind.hintFocus': 'Touchez une lumière pour l’ouvrir · touchez la branche pour revenir', 'mind.learned': 'Appris le {when}', 'mind.you': 'À propos de vous', 'mind.people': 'Personnes', 'mind.health': 'Alimentation et santé', 'mind.work': 'Travail et études', 'mind.places': 'Lieux', 'mind.plans': 'Projets et tâches', 'mind.routines': 'Routines', 'mind.agents': 'Agents', 'mind.worlds': 'Mondes', 'mind.skills': 'Compétences', 'cookie.title': 'Cookies et confidentialité', 'cookie.body': 'Divina n’utilise aucun cookie de suivi ou publicitaire, ni d’outil d’analyse. Elle garde vos réglages sur cet appareil pour fonctionner, et tout ce qui est personnel est chiffré. Doit-elle aussi retenir vos préférences (langue, visite guidée, suivi des mains) d’une visite à l’autre ?', 'cookie.all': 'Retenir mes préférences', 'cookie.essential': 'L’essentiel uniquement', 'cookie.details': 'Voir ce qui est enregistré', 'section.Privacy & cookies': 'Confidentialité et cookies',
};
const de: Dict = {
  talk: 'sprechen', listening: 'hört zu', voice: 'Stimme', type: 'tippen', settings: 'Einstellungen', hands: 'Hände', returnSpatial: 'zurück zum Raum',
  divinaWants: 'Divina möchte', deny: 'Ablehnen · Esc', allow: 'Erlauben · Enter',
  welcomeTitle: 'Willkommen bei Divina — kostenlose Browser-Version',
  welcomePhone: 'Wischen, um den Ring zu drehen, eine Karte antippen, um sie zu öffnen, oder „tippen“ wählen und „öffne das Wetter“ versuchen.',
  welcomeDesktop: 'Versuche „öffne das Wetter“ oder die Pfeiltasten.',
  welcomeKey: 'Um frei zu sprechen, füge deinen eigenen Gemini-, Claude- oder OpenAI-Schlüssel unter ⚙ Einstellungen → KI hinzu. Divina ist für Erwachsene (18+).',
  translator: 'Übersetzer', takeTurns: 'abwechselnd', stop: 'stopp', translating: 'Übersetze…', speakIn: 'Sprich {from} — ich sage es auf {to}. Sag „Übersetzen beenden“, um aufzuhören.',
  settingsTitle: 'Einstellungen', close: 'schließen · esc',
  'section.Voice & replies': 'Stimme und Antworten', 'section.Language': 'Sprache', 'section.AI': 'KI', 'section.Memory': 'Gedächtnis', 'section.Routines': 'Routinen', 'section.Heads-ups': 'Hinweise',
  'section.Backup & restore': 'Sicherung', 'section.Crypto': 'Krypto', 'section.Weather & news': 'Wetter und News', 'section.Calendar': 'Kalender', 'section.Email': 'E-Mail',
  'section.Sports & stocks': 'Sport und Börse', 'section.Accounts': 'Konten', 'section.Computer control': 'Computersteuerung', 'section.Divina for Windows': 'Divina für Windows', 'section.Worlds': 'Welten',
  'tour.next': 'Weiter', 'tour.back': 'Zurück', 'tour.skip': 'Überspringen', 'tour.done': 'Los geht’s', 'mind.title': 'Gedanken', 'mind.sub': '{n} Dinge, die sie weiß und kann · nur auf diesem Gerät', 'mind.close': 'schließen · esc', 'mind.empty': 'Erzähl ihr, was sie sich merken soll, füge Notizen, Agenten und Routinen hinzu – und ihr Geist wächst.', 'mind.hint': 'Tippe auf einen Zweig für mehr · ziehen zum Drehen', 'mind.hintFocus': 'Tippe auf ein Licht zum Öffnen · noch einmal auf den Zweig für zurück', 'mind.learned': 'Gelernt am {when}', 'mind.you': 'Über dich', 'mind.people': 'Menschen', 'mind.health': 'Essen und Gesundheit', 'mind.work': 'Arbeit und Studium', 'mind.places': 'Orte', 'mind.plans': 'Pläne und To-dos', 'mind.routines': 'Routinen', 'mind.agents': 'Agenten', 'mind.worlds': 'Welten', 'mind.skills': 'Fähigkeiten', 'cookie.title': 'Cookies und Datenschutz', 'cookie.body': 'Divina verwendet keine Tracking- oder Werbe-Cookies und keine Analyse. Sie speichert deine Einstellungen auf diesem Gerät, damit sie funktioniert, und alles Persönliche verschlüsselt. Soll sie auch deine Vorlieben (Sprache, Tour, Handsteuerung) zwischen Besuchen behalten?', 'cookie.all': 'Vorlieben merken', 'cookie.essential': 'Nur das Nötigste', 'cookie.details': 'Gespeichertes ansehen', 'section.Privacy & cookies': 'Datenschutz und Cookies',
};
const it: Dict = {
  talk: 'parla', listening: 'in ascolto', voice: 'voce', type: 'scrivi', settings: 'impostazioni', hands: 'mani', returnSpatial: 'torna allo spazio',
  divinaWants: 'divina vuole', deny: 'Nega · Esc', allow: 'Consenti · Invio',
  welcomeTitle: 'Benvenuto in Divina — versione gratuita per browser',
  welcomePhone: 'Scorri per girare l’anello, tocca una scheda per aprirla, oppure tocca «scrivi» e prova «apri il meteo».',
  welcomeDesktop: 'Prova «apri il meteo» o i tasti freccia.',
  welcomeKey: 'Per parlare liberamente, aggiungi la tua chiave Gemini, Claude o OpenAI in ⚙ Impostazioni → IA. Divina è per adulti (18+).',
  translator: 'traduttore', takeTurns: 'a turno', stop: 'stop', translating: 'Traduco…', speakIn: 'Parla in {from}, lo dirò in {to}. Di’ «smetti di tradurre» per finire.',
  settingsTitle: 'Impostazioni', close: 'chiudi · esc',
  'section.Voice & replies': 'Voce e risposte', 'section.Language': 'Lingua', 'section.AI': 'IA', 'section.Memory': 'Memoria', 'section.Routines': 'Routine', 'section.Heads-ups': 'Avvisi',
  'section.Backup & restore': 'Backup', 'section.Crypto': 'Cripto', 'section.Weather & news': 'Meteo e notizie', 'section.Calendar': 'Calendario', 'section.Email': 'Email',
  'section.Sports & stocks': 'Sport e borsa', 'section.Accounts': 'Account', 'section.Computer control': 'Controllo del computer', 'section.Divina for Windows': 'Divina per Windows', 'section.Worlds': 'Mondi',
  'tour.next': 'Avanti', 'tour.back': 'Indietro', 'tour.skip': 'Salta', 'tour.done': 'Andiamo', 'mind.title': 'Mente', 'mind.sub': '{n} cose che sa e sa fare · solo su questo dispositivo', 'mind.close': 'chiudi · esc', 'mind.empty': 'Dille cose da ricordare, aggiungi note, agenti e routine, e la sua mente cresce.', 'mind.hint': 'Tocca un ramo per vederlo da vicino · trascina per ruotare', 'mind.hintFocus': 'Tocca una luce per aprirla · tocca di nuovo il ramo per tornare', 'mind.learned': 'Imparato il {when}', 'mind.you': 'Su di te', 'mind.people': 'Persone', 'mind.health': 'Cibo e salute', 'mind.work': 'Lavoro e studio', 'mind.places': 'Luoghi', 'mind.plans': 'Piani e cose da fare', 'mind.routines': 'Routine', 'mind.agents': 'Agenti', 'mind.worlds': 'Mondi', 'mind.skills': 'Abilità', 'cookie.title': 'Cookie e privacy', 'cookie.body': 'Divina non usa cookie di tracciamento o pubblicitari né strumenti di analisi. Conserva le tue impostazioni su questo dispositivo per funzionare, e tutto ciò che è personale è cifrato. Vuoi che ricordi anche le tue preferenze (lingua, tour, tracciamento delle mani) tra una visita e l’altra?', 'cookie.all': 'Ricorda le preferenze', 'cookie.essential': 'Solo l’essenziale', 'cookie.details': 'Vedi cosa viene salvato', 'section.Privacy & cookies': 'Privacy e cookie',
};
const pt: Dict = {
  talk: 'falar', listening: 'a ouvir', voice: 'voz', type: 'escrever', settings: 'definições', hands: 'mãos', returnSpatial: 'voltar ao espaço',
  divinaWants: 'a divina quer', deny: 'Recusar · Esc', allow: 'Permitir · Enter',
  welcomeTitle: 'Bem-vindo à Divina — versão gratuita no navegador',
  welcomePhone: 'Deslize para rodar o anel, toque num cartão para o abrir, ou toque em «escrever» e experimente «abre o tempo».',
  welcomeDesktop: 'Experimente «abre o tempo» ou as setas do teclado.',
  welcomeKey: 'Para falar à vontade, adicione a sua chave Gemini, Claude ou OpenAI em ⚙ Definições → IA. A Divina é para adultos (18+).',
  translator: 'tradutor', takeTurns: 'à vez', stop: 'parar', translating: 'A traduzir…', speakIn: 'Fale em {from} e eu digo em {to}. Diga «parar de traduzir» para terminar.',
  settingsTitle: 'Definições', close: 'fechar · esc',
  'section.Voice & replies': 'Voz e respostas', 'section.Language': 'Idioma', 'section.AI': 'IA', 'section.Memory': 'Memória', 'section.Routines': 'Rotinas', 'section.Heads-ups': 'Avisos',
  'section.Backup & restore': 'Cópia de segurança', 'section.Crypto': 'Cripto', 'section.Weather & news': 'Tempo e notícias', 'section.Calendar': 'Calendário', 'section.Email': 'Email',
  'section.Sports & stocks': 'Desporto e bolsa', 'section.Accounts': 'Contas', 'section.Computer control': 'Controlo do computador', 'section.Divina for Windows': 'Divina para Windows', 'section.Worlds': 'Mundos',
  'tour.next': 'Seguinte', 'tour.back': 'Voltar', 'tour.skip': 'Saltar', 'tour.done': 'Vamos', 'mind.title': 'Mente', 'mind.sub': '{n} coisas que sabe e sabe fazer · só neste dispositivo', 'mind.close': 'fechar · esc', 'mind.empty': 'Diga-lhe coisas para lembrar, adicione notas, agentes e rotinas, e a mente dela cresce.', 'mind.hint': 'Toque num ramo para ver de perto · arraste para rodar', 'mind.hintFocus': 'Toque numa luz para a abrir · toque no ramo outra vez para voltar', 'mind.learned': 'Aprendido a {when}', 'mind.you': 'Sobre si', 'mind.people': 'Pessoas', 'mind.health': 'Comida e saúde', 'mind.work': 'Trabalho e estudo', 'mind.places': 'Lugares', 'mind.plans': 'Planos e tarefas', 'mind.routines': 'Rotinas', 'mind.agents': 'Agentes', 'mind.worlds': 'Mundos', 'mind.skills': 'Capacidades', 'cookie.title': 'Cookies e privacidade', 'cookie.body': 'A Divina não usa cookies de rastreio nem de publicidade, nem análises. Guarda as suas definições neste dispositivo para funcionar, e tudo o que é pessoal fica cifrado. Deve também lembrar as suas preferências (idioma, a visita guiada, o seguimento das mãos) entre visitas?', 'cookie.all': 'Lembrar preferências', 'cookie.essential': 'Só o essencial', 'cookie.details': 'Ver o que é guardado', 'section.Privacy & cookies': 'Privacidade e cookies',
};

const DICTS: Record<string, Dict> = { es, fr, de, it, pt, 'pt-br': pt };
/** Languages whose buttons and headings are translated (others: speech and answers only). */
export const UI_LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'pt-br'];

export const effectiveLang = () => usePrefs.getState().lang || browserLanguage();
export const langTagOf = (code: string) => LANG_BY_CODE[code]?.tag ?? 'en-GB';

export function translate(lang: string, key: Key, vars?: Record<string, string>): string {
  let s = DICTS[lang]?.[key] ?? en[key];
  for (const [k, v] of Object.entries(vars ?? {})) s = s.replace(`{${k}}`, v);
  return s;
}
/** Words for the current language, for non-React code. */
export const t = (key: Key, vars?: Record<string, string>) => translate(effectiveLang(), key, vars);

/** In components: re-renders when the language changes. */
export function useT() {
  const lang = usePrefs((s) => s.lang) || browserLanguage();
  return (key: Key, vars?: Record<string, string>) => translate(lang, key, vars);
}
/** A heading that may have a translation (falls back to itself). */
export function useSectionTitle() {
  const tr = useT();
  return (title: string) => (`section.${title}` in en ? tr(`section.${title}` as Key) : title);
}
