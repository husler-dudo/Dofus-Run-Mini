import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  History,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  TimerReset,
} from 'lucide-react';

const DUNGEONS = [
  'Donjon 1',
  'Donjon 2',
  'Donjon 3',
  'Donjon 4',
  'Ben le Ripate',
  'Obsidiante',
  'Tengu',
  'Korriandre',
  'Kolosso',
  'Glourséleste',
  'La Forêt Pétrifiée',
  'La Crevasse Perge',
  'La Bourgade',
] as const;

const STORAGE_KEY = 'dofus-run-timer-state';

type CompletedRun = {
  id: string;
  dungeon: string;
  elapsedMs: number;
  completedAt: number;
};

type TimerState = {
  selectedDungeon: string;
  elapsedMs: number;
  running: boolean;
  startedAt: number | null;
  completed: CompletedRun[];
};

const initialState: TimerState = {
  selectedDungeon: DUNGEONS[0],
  elapsedMs: 0,
  running: false,
  startedAt: null,
  completed: [],
};

function readStoredState(): TimerState {
  if (typeof window === 'undefined') return initialState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<TimerState>;
    const selectedDungeon =
      typeof parsed.selectedDungeon === 'string' && DUNGEONS.includes(parsed.selectedDungeon as (typeof DUNGEONS)[number])
        ? parsed.selectedDungeon
        : initialState.selectedDungeon;
    const elapsedMs = typeof parsed.elapsedMs === 'number' && Number.isFinite(parsed.elapsedMs) && parsed.elapsedMs >= 0
      ? parsed.elapsedMs
      : 0;
    const completed = Array.isArray(parsed.completed)
      ? parsed.completed.filter((entry): entry is CompletedRun =>
          typeof entry?.id === 'string' &&
          typeof entry?.dungeon === 'string' &&
          typeof entry?.elapsedMs === 'number' &&
          typeof entry?.completedAt === 'number',
        )
      : [];
    const running = parsed.running === true;
    const startedAt = running && typeof parsed.startedAt === 'number' && Number.isFinite(parsed.startedAt)
      ? parsed.startedAt
      : null;
    return { selectedDungeon, elapsedMs, running: Boolean(startedAt) && running, startedAt, completed };
  } catch {
    return initialState;
  }
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function formatCompletedAt(timestamp: number) {
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(timestamp);
  } catch {
    return '';
  }
}

function App() {
  const [state, setState] = useState<TimerState>(readStoredState);
  const [now, setNow] = useState(() => Date.now());
  const [justCompleted, setJustCompleted] = useState(false);

  const elapsedMs = state.running && state.startedAt
    ? state.elapsedMs + Math.max(0, now - state.startedAt)
    : state.elapsedMs;

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private browsing and full storage should not interrupt timer usage.
    }
  }, [state]);

  useEffect(() => {
    if (!state.running) return undefined;
    const intervalId = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [state.running]);

  useEffect(() => {
    const refreshClock = () => setNow(Date.now());
    document.addEventListener('visibilitychange', refreshClock);
    window.addEventListener('pageshow', refreshClock);
    return () => {
      document.removeEventListener('visibilitychange', refreshClock);
      window.removeEventListener('pageshow', refreshClock);
    };
  }, []);

  const currentDuration = useCallback(() => {
    if (state.running && state.startedAt) return state.elapsedMs + Math.max(0, Date.now() - state.startedAt);
    return state.elapsedMs;
  }, [state]);

  const startRun = () => {
    setJustCompleted(false);
    setState((current) => current.running ? current : { ...current, running: true, startedAt: Date.now() });
    setNow(Date.now());
  };

  const pauseRun = () => {
    const frozenElapsed = currentDuration();
    setState((current) => ({ ...current, elapsedMs: frozenElapsed, running: false, startedAt: null }));
    setNow(Date.now());
  };

  const finishRun = () => {
    const frozenElapsed = currentDuration();
    const completedRun: CompletedRun = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      dungeon: state.selectedDungeon,
      elapsedMs: frozenElapsed,
      completedAt: Date.now(),
    };
    setState((current) => ({
      ...current,
      elapsedMs: 0,
      running: false,
      startedAt: null,
      completed: [completedRun, ...current.completed],
    }));
    setJustCompleted(true);
    setNow(Date.now());
  };

  const resetAll = () => {
    if (!window.confirm('Commencer une nouvelle run ? Le chrono actuel et la liste des donjons terminés seront effacés.')) return;
    setState(initialState);
    setJustCompleted(false);
    setNow(Date.now());
  };

  const completedRuns = state.completed;

  return (
    <main className="app-shell">
      <div className="app-noise" aria-hidden="true" />
      <div className="app-container">
        <header className="flex items-center justify-between gap-4" data-testid="header-app">
          <div className="flex items-center gap-3">
            <div className="brand-mark" aria-hidden="true">DRT</div>
            <div>
              <p className="font-display m-0 text-[1.1rem] font-bold leading-tight tracking-[-0.04em] text-[hsl(var(--secondary))]">
                Dofus Run Timer
              </p>
              <p className="m-0 mt-0.5 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
                Chronomètre de donjon
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card)/.62)] px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))] sm:flex">
            <ShieldCheck size={14} strokeWidth={2.2} />
            Sauvegarde locale
          </div>
        </header>

        <section className="workspace-grid" aria-label="Espace de chronométrage">
          <section className="panel timer-panel" data-testid="section-timer">
            <div className="relative z-[1] flex items-start justify-between gap-4">
              <div>
                <p className="m-0 text-[0.68rem] font-extrabold uppercase tracking-[0.17em] text-[hsl(var(--primary))]">
                  Run actuelle
                </p>
                <h1 className="font-display m-0 mt-1 text-[1.65rem] font-bold leading-tight tracking-[-0.055em] text-[hsl(var(--secondary))] sm:text-[1.9rem]">
                  Prêt quand vous l’êtes.
                </h1>
              </div>
              <div className="rounded-full bg-[hsl(var(--accent)/.55)] px-2.5 py-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.1em] text-[hsl(var(--accent-foreground))]" data-testid="status-timer">
                <span className={`status-dot ${state.running ? 'is-running' : ''}`} />
                {state.running ? 'En cours' : elapsedMs > 0 ? 'En pause' : 'En attente'}
              </div>
            </div>

            <div className="relative z-[1] mt-6">
              <label className="mb-2 block text-[0.68rem] font-extrabold uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))]" htmlFor="dungeon-select">
                Donjon
              </label>
              <div className="select-wrap">
                <select
                  id="dungeon-select"
                  value={state.selectedDungeon}
                  onChange={(event) => {
                    setState((current) => ({ ...current, selectedDungeon: event.target.value }));
                    setJustCompleted(false);
                  }}
                  data-testid="select-dungeon"
                >
                  {DUNGEONS.map((dungeon) => <option key={dungeon} value={dungeon}>{dungeon}</option>)}
                </select>
                <ChevronDown className="select-chevron" size={18} />
              </div>
            </div>

            <div className="timer-face" data-testid="timer-face">
              <p className="m-0 mb-4 text-[0.67rem] font-extrabold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                Temps écoulé
              </p>
              <div className={`timer-digits ${state.running ? 'is-running' : ''}`} aria-live="polite" data-testid="text-elapsed-time">
                {formatDuration(elapsedMs)}
              </div>
              <p className="m-0 mt-5 text-[0.72rem] font-semibold text-[hsl(var(--muted-foreground))]" data-testid="text-timer-hint">
                {state.running ? 'Le chrono tourne, même si votre écran se met en veille.' : elapsedMs > 0 ? 'Chrono arrêté. Reprenez au même instant.' : 'Sélectionnez un donjon, puis lancez le chrono.'}
              </p>
            </div>

            <div className="control-row relative z-[1] mt-4 grid gap-2.5 sm:mt-5">
              {!state.running ? (
                <button type="button" className="action-button primary" onClick={startRun} data-testid="button-start-run">
                  {elapsedMs > 0 ? <Play size={17} fill="currentColor" /> : <TimerReset size={17} />}
                  {elapsedMs > 0 ? 'Reprendre' : 'Démarrer'}
                </button>
              ) : (
                <button type="button" className="action-button dark" onClick={pauseRun} data-testid="button-pause-run">
                  <Pause size={17} fill="currentColor" />
                  Pause
                </button>
              )}
              <button type="button" className="action-button ghost" onClick={resetAll} data-testid="button-new-run">
                <RotateCcw size={16} />
                Nouvelle run
              </button>
              <button
                type="button"
                className="action-button teal complete-button"
                onClick={finishRun}
                disabled={elapsedMs === 0 && !state.running}
                data-testid="button-complete-run"
              >
                <Check size={17} strokeWidth={2.8} />
                Terminer le donjon
              </button>
            </div>

            {justCompleted && (
              <div className="completed-note relative z-[1] mt-4 flex items-center gap-2 rounded-xl border border-[hsl(169_40%_52%/.3)] bg-[hsl(var(--accent)/.35)] px-3.5 py-3 text-[0.77rem] font-bold text-[hsl(var(--accent-foreground))]" data-testid="status-run-completed">
                <Check size={16} strokeWidth={2.5} />
                Run enregistrée. Le prochain chrono est prêt.
              </div>
            )}
          </section>

          <section className="panel history-panel" data-testid="section-history">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2 text-[hsl(var(--primary))]">
                  <History size={16} strokeWidth={2.4} />
                  <span className="text-[0.66rem] font-extrabold uppercase tracking-[0.17em]">Journal de run</span>
                </div>
                <h2 className="font-display m-0 text-[1.45rem] font-bold tracking-[-0.055em] text-[hsl(var(--secondary))]">
                  Donjons terminés
                </h2>
              </div>
            </div>

            {completedRuns.length === 0 ? (
              <div className="empty-history" data-testid="empty-history">
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[hsl(var(--accent)/.48)] text-[hsl(var(--accent-foreground))]">
                  <Clock3 size={22} strokeWidth={1.8} />
                </div>
                <p className="m-0 text-[0.92rem] font-extrabold tracking-[-0.02em] text-[hsl(var(--secondary))]">
                  Votre journal est vierge.
                </p>
                <p className="m-0 mt-1.5 max-w-[15rem] text-[0.76rem] font-medium leading-relaxed text-[hsl(var(--muted-foreground))]">
                  Chaque donjon terminé apparaîtra ici, avec son temps exact.
                </p>
              </div>
            ) : (
              <div className="history-list" aria-live="polite">
                {completedRuns.map((run, index) => (
                  <div className="history-row" key={run.id} data-testid={`row-completed-run-${run.id}`}>
                    <div className="history-index">{String(completedRuns.length - index).padStart(2, '0')}</div>
                    <div className="min-w-0">
                      <p className="m-0 truncate text-[0.82rem] font-extrabold text-[hsl(var(--secondary))]" data-testid={`text-dungeon-${run.id}`}>
                        {run.dungeon}
                      </p>
                      <p className="m-0 mt-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">
                        {formatCompletedAt(run.completedAt)}
                      </p>
                    </div>
                    <div className="history-time" data-testid={`text-duration-${run.id}`}>{formatDuration(run.elapsedMs)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>

        <footer className="mt-5 flex items-center justify-center gap-2 text-center text-[0.66rem] font-semibold text-[hsl(var(--muted-foreground))]">
          <CircleDot size={12} />
          Votre temps reste sur cet appareil, rien de plus.
        </footer>
      </div>
    </main>
  );
}

export default App;
