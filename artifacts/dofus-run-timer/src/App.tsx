import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleDot,
  Clock3,
  LockKeyhole,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Trophy,
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
const STATE_VERSION = 2;

type RouteId = 'tour' | 'nematompousse' | 'frigost' | 'custom';
type RunStatus = 'preparing' | 'active' | 'completed';

type TimerState = {
  elapsedMs: number;
  running: boolean;
  startedAt: number | null;
};

type CompletedDungeon = {
  id: string;
  dungeon: string;
  elapsedMs: number;
  completedAt: number;
  routeId: RouteId;
};

type AppState = {
  version: number;
  selectedRoute: RouteId;
  routes: Record<RouteId, string[]>;
  activeRoute: RouteId | null;
  activeIndex: number;
  status: RunStatus;
  completed: CompletedDungeon[];
  globalTimer: TimerState;
  dungeonTimer: TimerState;
  dungeonResumeOnRunResume: boolean;
};

const ROUTE_LABELS: Record<RouteId, string> = {
  tour: 'Tour du monde',
  nematompousse: 'Nematompousse',
  frigost: 'Frigost',
  custom: 'Route personnalisée',
};

const ROUTE_IDS: RouteId[] = ['tour', 'nematompousse', 'frigost', 'custom'];

function createInitialRoutes(): Record<RouteId, string[]> {
  return {
    tour: ['Donjon 1', 'Donjon 2', 'Donjon 3', 'Donjon 4', 'Ben le Ripate', 'Obsidiante'],
    nematompousse: ['Donjon 1', 'Donjon 2', 'Tengu', 'Korriandre', 'Kolosso'],
    frigost: ['Ben le Ripate', 'Obsidiante', 'Tengu', 'Korriandre', 'Kolosso', 'Glourséleste', 'La Forêt Pétrifiée', 'La Crevasse Perge', 'La Bourgade'],
    custom: ['Donjon 1'],
  };
}

function createInitialState(): AppState {
  return {
    version: STATE_VERSION,
    selectedRoute: 'tour',
    routes: createInitialRoutes(),
    activeRoute: null,
    activeIndex: 0,
    status: 'preparing',
    completed: [],
    globalTimer: { elapsedMs: 0, running: false, startedAt: null },
    dungeonTimer: { elapsedMs: 0, running: false, startedAt: null },
    dungeonResumeOnRunResume: false,
  };
}

function isRouteId(value: unknown): value is RouteId {
  return typeof value === 'string' && ROUTE_IDS.includes(value as RouteId);
}

function isDungeon(value: unknown): value is string {
  return typeof value === 'string' && DUNGEONS.includes(value as (typeof DUNGEONS)[number]);
}

function asElapsed(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function readTimer(value: unknown): TimerState {
  if (!value || typeof value !== 'object') return { elapsedMs: 0, running: false, startedAt: null };
  const candidate = value as Partial<TimerState>;
  const running = candidate.running === true && typeof candidate.startedAt === 'number' && Number.isFinite(candidate.startedAt);
  return {
    elapsedMs: asElapsed(candidate.elapsedMs),
    running,
    startedAt: running ? candidate.startedAt as number : null,
  };
}

function readCompleted(value: unknown, fallbackRoute: RouteId): CompletedDungeon[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as Partial<CompletedDungeon>;
    if (!isDungeon(candidate.dungeon) || !Number.isFinite(candidate.elapsedMs) || !Number.isFinite(candidate.completedAt)) return [];
    return [{
      id: typeof candidate.id === 'string' ? candidate.id : `${fallbackRoute}-${index}-${candidate.completedAt}`,
      dungeon: candidate.dungeon,
      elapsedMs: asElapsed(candidate.elapsedMs),
      completedAt: candidate.completedAt as number,
      routeId: isRouteId(candidate.routeId) ? candidate.routeId : fallbackRoute,
    }];
  });
}

function readRoutes(value: unknown, defaults: Record<RouteId, string[]>) {
  if (!value || typeof value !== 'object') return defaults;
  const candidate = value as Partial<Record<RouteId, unknown>>;
  return ROUTE_IDS.reduce<Record<RouteId, string[]>>((routes, routeId) => {
    const route = Array.isArray(candidate[routeId]) ? candidate[routeId].filter(isDungeon) : defaults[routeId];
    routes[routeId] = [...route];
    return routes;
  }, {} as Record<RouteId, string[]>);
}

function readStoredState(): AppState {
  const defaults = createInitialState();
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;
    const candidate = parsed as Partial<AppState> & {
      selectedDungeon?: unknown;
      elapsedMs?: unknown;
      running?: unknown;
      startedAt?: unknown;
    };

    if (candidate.version !== STATE_VERSION) {
      const selectedDungeon = isDungeon(candidate.selectedDungeon) ? candidate.selectedDungeon : DUNGEONS[0];
      const legacyElapsed = asElapsed(candidate.elapsedMs)
        + (candidate.running === true && typeof candidate.startedAt === 'number'
          ? Math.max(0, Date.now() - candidate.startedAt)
          : 0);
      const migratedCompleted = readCompleted(candidate.completed, 'custom');
      return {
        ...defaults,
        selectedRoute: 'custom',
        routes: { ...defaults.routes, custom: [selectedDungeon] },
        activeRoute: legacyElapsed > 0 || migratedCompleted.length > 0 ? 'custom' : null,
        status: legacyElapsed > 0 || migratedCompleted.length > 0 ? 'active' : 'preparing',
        completed: migratedCompleted,
        globalTimer: { elapsedMs: legacyElapsed, running: false, startedAt: null },
        dungeonTimer: { elapsedMs: legacyElapsed, running: false, startedAt: null },
      };
    }

    const routes = readRoutes(candidate.routes, defaults.routes);
    const selectedRoute = isRouteId(candidate.selectedRoute) ? candidate.selectedRoute : defaults.selectedRoute;
    const activeRoute = isRouteId(candidate.activeRoute) ? candidate.activeRoute : null;
    const status: RunStatus = candidate.status === 'active' || candidate.status === 'completed' ? candidate.status : 'preparing';
    const activeRouteItems = activeRoute ? routes[activeRoute] : [];
    const activeIndex = activeRouteItems.length
      ? Math.min(Math.max(0, Math.floor(asElapsed(candidate.activeIndex))), activeRouteItems.length - 1)
      : 0;
    return {
      version: STATE_VERSION,
      selectedRoute,
      routes,
      activeRoute,
      activeIndex,
      status,
      completed: readCompleted(candidate.completed, activeRoute ?? selectedRoute),
      globalTimer: readTimer(candidate.globalTimer),
      dungeonTimer: readTimer(candidate.dungeonTimer),
      dungeonResumeOnRunResume: candidate.dungeonResumeOnRunResume === true,
    };
  } catch {
    return defaults;
  }
}

function timerElapsed(timer: TimerState, now: number) {
  return timer.running && timer.startedAt !== null
    ? timer.elapsedMs + Math.max(0, now - timer.startedAt)
    : timer.elapsedMs;
}

function freezeTimer(timer: TimerState, now: number): TimerState {
  return { elapsedMs: timerElapsed(timer, now), running: false, startedAt: null };
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
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(timestamp);
  } catch {
    return '';
  }
}

function App() {
  const [state, setState] = useState<AppState>(readStoredState);
  const [now, setNow] = useState(() => Date.now());
  const [addDungeon, setAddDungeon] = useState<string>(DUNGEONS[0]);

  const selectedRouteItems = state.routes[state.selectedRoute];
  const activeRouteId = state.activeRoute ?? state.selectedRoute;
  const activeRouteItems = state.routes[activeRouteId];
  const currentDungeon = activeRouteItems[state.activeIndex] ?? '';
  const globalElapsed = timerElapsed(state.globalTimer, now);
  const dungeonElapsed = timerElapsed(state.dungeonTimer, now);
  const isPreparing = state.status === 'preparing';
  const isActive = state.status === 'active';
  const isCompleted = state.status === 'completed';
  const availableDungeons = useMemo(
    () => DUNGEONS.filter((dungeon) => !selectedRouteItems.includes(dungeon)),
    [selectedRouteItems],
  );
  const currentCompleted = useMemo(
    () => state.completed.filter((entry) => entry.routeId === activeRouteId),
    [state.completed, activeRouteId],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Un stockage plein ou privé ne doit pas interrompre les chronos.
    }
  }, [state]);

  useEffect(() => {
    if (!state.globalTimer.running && !state.dungeonTimer.running) return undefined;
    const intervalId = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [state.globalTimer.running, state.dungeonTimer.running]);

  useEffect(() => {
    const rehydrate = () => {
      setState(readStoredState());
      setNow(Date.now());
    };
    document.addEventListener('visibilitychange', rehydrate);
    window.addEventListener('pageshow', rehydrate);
    return () => {
      document.removeEventListener('visibilitychange', rehydrate);
      window.removeEventListener('pageshow', rehydrate);
    };
  }, []);

  useEffect(() => {
    if (!isDungeon(addDungeon) || !availableDungeons.includes(addDungeon as (typeof DUNGEONS)[number])) setAddDungeon(availableDungeons[0] ?? DUNGEONS[0]);
  }, [availableDungeons, addDungeon]);

  const updateRoute = (routeId: RouteId, updater: (route: string[]) => string[]) => {
    if (!isPreparing) return;
    setState((current) => ({
      ...current,
      routes: { ...current.routes, [routeId]: updater(current.routes[routeId]) },
    }));
  };

  const selectRoute = (routeId: RouteId) => {
    if (!isPreparing) return;
    setState((current) => ({ ...current, selectedRoute: routeId }));
  };

  const addToRoute = () => {
    if (!isPreparing || !isDungeon(addDungeon) || selectedRouteItems.includes(addDungeon)) return;
    updateRoute(state.selectedRoute, (route) => [...route, addDungeon]);
  };

  const removeFromRoute = (index: number) => {
    updateRoute(state.selectedRoute, (route) => route.filter((_, itemIndex) => itemIndex !== index));
  };

  const moveInRoute = (index: number, direction: -1 | 1) => {
    updateRoute(state.selectedRoute, (route) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= route.length) return route;
      const next = [...route];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const beginRun = () => {
    if (!isPreparing || selectedRouteItems.length === 0) return;
    const startedAt = Date.now();
    setState((current) => ({
      ...current,
      status: 'active',
      activeRoute: current.selectedRoute,
      activeIndex: 0,
      globalTimer: { elapsedMs: 0, running: true, startedAt },
      dungeonTimer: { elapsedMs: 0, running: false, startedAt: null },
      dungeonResumeOnRunResume: false,
    }));
    setNow(startedAt);
  };

  const resumeRun = () => {
    const startedAt = Date.now();
    setState((current) => ({
      ...current,
      globalTimer: { elapsedMs: timerElapsed(current.globalTimer, startedAt), running: true, startedAt },
      dungeonTimer: current.dungeonResumeOnRunResume
        ? { elapsedMs: timerElapsed(current.dungeonTimer, startedAt), running: true, startedAt }
        : current.dungeonTimer,
      dungeonResumeOnRunResume: false,
    }));
    setNow(startedAt);
  };

  const pauseRun = () => {
    const pauseAt = Date.now();
    setState((current) => ({
      ...current,
      globalTimer: freezeTimer(current.globalTimer, pauseAt),
      dungeonTimer: freezeTimer(current.dungeonTimer, pauseAt),
      dungeonResumeOnRunResume: current.dungeonTimer.running,
    }));
    setNow(pauseAt);
  };

  const startOrResumeDungeon = () => {
    if (!isActive || !state.globalTimer.running || !currentDungeon || state.dungeonTimer.running) return;
    const startedAt = Date.now();
    setState((current) => ({
      ...current,
      dungeonTimer: { elapsedMs: timerElapsed(current.dungeonTimer, startedAt), running: true, startedAt },
      dungeonResumeOnRunResume: false,
    }));
    setNow(startedAt);
  };

  const pauseDungeon = () => {
    const pauseAt = Date.now();
    setState((current) => ({
      ...current,
      dungeonTimer: freezeTimer(current.dungeonTimer, pauseAt),
      dungeonResumeOnRunResume: false,
    }));
    setNow(pauseAt);
  };

  const completeDungeon = () => {
    if (!isActive || !currentDungeon || dungeonElapsed <= 0) return;
    const completedAt = Date.now();
    setState((current) => {
      const routeId = current.activeRoute ?? current.selectedRoute;
      const route = current.routes[routeId];
      const isLastDungeon = current.activeIndex >= route.length - 1;
      const record: CompletedDungeon = {
        id: `${routeId}-${current.activeIndex}-${completedAt}-${current.completed.length}`,
        dungeon: route[current.activeIndex],
        elapsedMs: timerElapsed(current.dungeonTimer, completedAt),
        completedAt,
        routeId,
      };
      return {
        ...current,
        status: isLastDungeon ? 'completed' : 'active',
        activeIndex: isLastDungeon ? current.activeIndex : current.activeIndex + 1,
        completed: [...current.completed, record],
        globalTimer: isLastDungeon
          ? freezeTimer(current.globalTimer, completedAt)
          : current.globalTimer,
        dungeonTimer: { elapsedMs: 0, running: false, startedAt: null },
        dungeonResumeOnRunResume: false,
      };
    });
    setNow(completedAt);
  };

  const resetRun = () => {
    if (!window.confirm('Commencer une nouvelle run ? Le parcours actif et les donjons terminés seront effacés.')) return;
    setState((current) => ({
      ...createInitialState(),
      selectedRoute: current.selectedRoute,
      routes: current.routes,
    }));
    setAddDungeon(DUNGEONS[0]);
    setNow(Date.now());
  };

  const runButtonLabel = isPreparing
    ? 'Commencer la run'
    : state.globalTimer.running
      ? 'Pause la run'
      : 'Reprendre la run';
  const dungeonButtonLabel = state.dungeonTimer.running
    ? 'Pause le donjon'
    : dungeonElapsed > 0
      ? 'Reprendre le donjon'
      : 'Démarrer le donjon';

  return (
    <main className="app-shell">
      <div className="app-noise" aria-hidden="true" />
      <div className="app-container">
        <header className="topbar" data-testid="header-app">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">DRT</div>
            <div>
              <p className="eyebrow">Compagnon de route</p>
              <p className="brand-name">Dofus Run Timer</p>
            </div>
          </div>
          <div className="local-badge" data-testid="status-local-storage">
            <ShieldCheck size={14} />
            Sauvegarde locale
          </div>
        </header>

        <div className="workspace">
          <section className="panel route-panel" aria-label="Préparation du parcours" data-testid="section-route-editor">
            <div className="section-heading">
              <div>
                <p className="eyebrow">01 · Préparer</p>
                <h1 className="section-title">Votre parcours</h1>
                <p className="section-subtitle">Choisissez une route, puis ajustez l’ordre avant de partir.</p>
              </div>
              <div className={`mode-pill ${isPreparing ? '' : 'active'}`}>
                {isPreparing ? 'Édition' : <><LockKeyhole size={12} /> Verrouillé</>}
              </div>
            </div>

            <div className="route-tabs" role="tablist" aria-label="Routes disponibles">
              {ROUTE_IDS.map((routeId) => (
                <button
                  key={routeId}
                  type="button"
                  role="tab"
                  aria-selected={state.selectedRoute === routeId}
                  className={`route-tab ${state.selectedRoute === routeId ? 'selected' : ''}`}
                  onClick={() => selectRoute(routeId)}
                  disabled={!isPreparing}
                  data-testid={`button-route-${routeId}`}
                >
                  {ROUTE_LABELS[routeId]}
                  <small>{state.routes[routeId].length} donjon{state.routes[routeId].length > 1 ? 's' : ''}</small>
                </button>
              ))}
            </div>

            <div className="route-list">
              <div className="route-list-header">
                <span>Ordre de passage</span>
                <span className="route-count">{selectedRouteItems.length} étapes</span>
              </div>
              {selectedRouteItems.length === 0 ? (
                <div className="editor-lock" data-testid="empty-route">
                  <Clock3 size={15} />
                  Ajoutez au moins un donjon pour pouvoir commencer.
                </div>
              ) : selectedRouteItems.map((dungeon, index) => (
                <div className="route-item" key={`${dungeon}-${index}`} data-testid={`row-route-${index}`}>
                  <div className="route-number">{String(index + 1).padStart(2, '0')}</div>
                  <div className="route-name" title={dungeon}>{dungeon}</div>
                  <div className="route-actions">
                    <button type="button" className="icon-button" onClick={() => moveInRoute(index, -1)} disabled={!isPreparing || index === 0} aria-label={`Monter ${dungeon}`} data-testid={`button-move-up-${index}`}>
                      <ArrowUp size={15} />
                    </button>
                    <button type="button" className="icon-button" onClick={() => moveInRoute(index, 1)} disabled={!isPreparing || index === selectedRouteItems.length - 1} aria-label={`Descendre ${dungeon}`} data-testid={`button-move-down-${index}`}>
                      <ArrowDown size={15} />
                    </button>
                    <button type="button" className="icon-button" onClick={() => removeFromRoute(index)} disabled={!isPreparing} aria-label={`Retirer ${dungeon}`} data-testid={`button-remove-dungeon-${index}`}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {isPreparing ? (
              <div className="route-add">
                <select
                  className="field-select"
                  value={addDungeon}
                  onChange={(event) => setAddDungeon(event.target.value)}
                  disabled={availableDungeons.length === 0}
                  aria-label="Choisir un donjon à ajouter"
                  data-testid="select-add-dungeon"
                >
                  {availableDungeons.length === 0
                    ? <option value="">Catalogue complet</option>
                    : availableDungeons.map((dungeon) => <option key={dungeon} value={dungeon}>{dungeon}</option>)}
                </select>
                <button type="button" className="add-button" onClick={addToRoute} disabled={availableDungeons.length === 0} data-testid="button-add-dungeon">
                  <Plus size={15} /> Ajouter
                </button>
              </div>
            ) : (
              <div className="editor-lock" data-testid="status-route-locked">
                <LockKeyhole size={15} />
                Parcours verrouillé pendant la run. Les étapes avancent automatiquement.
              </div>
            )}
          </section>

          <section className="panel timer-panel" aria-label="Chronomètres de run" data-testid="section-timers">
            <div className="run-heading">
              <div>
                <p className="eyebrow">{isCompleted ? 'Run terminée' : isActive ? '02 · En mission' : '02 · Prêt au départ'}</p>
                <h2 className="current-name">{isPreparing ? (selectedRouteItems[0] ?? 'Aucun donjon') : isCompleted ? 'Parcours terminé' : currentDungeon}</h2>
                <p className="current-label">{isPreparing ? 'Premier donjon de la route' : isCompleted ? 'Tous les donjons sont enregistrés' : `Étape ${state.activeIndex + 1} sur ${activeRouteItems.length}`}</p>
              </div>
              <div className={`status-badge ${state.globalTimer.running ? 'running' : ''}`} data-testid="status-run">
                <span className={`status-dot ${state.globalTimer.running ? 'running' : ''}`} />
                {isCompleted ? 'Terminé' : state.globalTimer.running ? 'En cours' : isActive ? 'En pause' : 'En attente'}
              </div>
            </div>

            <div className="timer-grid">
              <div className={`timer-card primary-timer ${state.globalTimer.running ? 'is-running' : ''}`}>
                <div className="timer-card-label">
                  <span>Temps de la run</span>
                  <span>{state.globalTimer.running ? 'Actif' : 'Total'}</span>
                </div>
                <div className={`timer-digits accent ${state.globalTimer.running ? 'is-running' : ''}`} aria-live="polite" data-testid="text-global-time">
                  {formatDuration(globalElapsed)}
                </div>
                <p className="timer-hint">{state.globalTimer.running ? 'Le temps continue entre chaque donjon.' : 'Le temps est conservé sur cet appareil.'}</p>
              </div>
              <div className="timer-card">
                <div className="timer-card-label">
                  <span>Donjon actuel</span>
                  <span>{isPreparing ? 'À venir' : state.dungeonTimer.running ? 'Actif' : 'En pause'}</span>
                </div>
                <div className={`timer-digits ${state.dungeonTimer.running ? 'is-running' : ''}`} aria-live="polite" data-testid="text-dungeon-time">
                  {formatDuration(dungeonElapsed)}
                </div>
                <p className="timer-hint">{isPreparing ? 'Il démarrera quand vous le déciderez.' : state.dungeonTimer.running ? 'Chrono en cours sur ce donjon.' : 'Démarrez ce donjon quand vous êtes prêt.'}</p>
              </div>
            </div>

            {isActive && (
              <div className="active-progress" data-testid="status-progress">
                <span>{state.activeIndex + 1} / {activeRouteItems.length}</span>
                <div className="progress-track" aria-hidden="true">
                  <div className="progress-fill" style={{ width: `${((state.activeIndex + 1) / Math.max(1, activeRouteItems.length)) * 100}%` }} />
                </div>
                <span>{ROUTE_LABELS[activeRouteId]}</span>
              </div>
            )}

            <div className="run-controls">
              {isPreparing ? (
                <button type="button" className="action-button primary" onClick={beginRun} disabled={selectedRouteItems.length === 0} data-testid="button-start-run">
                  <Play size={16} fill="currentColor" /> Commencer la run
                </button>
              ) : isCompleted ? (
                <button type="button" className="action-button primary" onClick={resetRun} data-testid="button-new-run-completed">
                  <RotateCcw size={16} /> Nouvelle run
                </button>
              ) : (
                <>
                  <button type="button" className={`action-button ${state.globalTimer.running ? 'dark' : 'primary'}`} onClick={state.globalTimer.running ? pauseRun : resumeRun} data-testid="button-toggle-run">
                    {state.globalTimer.running ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                    {runButtonLabel}
                  </button>
                  <button type="button" className={`action-button ${state.dungeonTimer.running ? 'dark' : 'ghost'}`} onClick={state.dungeonTimer.running ? pauseDungeon : startOrResumeDungeon} disabled={!state.globalTimer.running} data-testid="button-toggle-dungeon">
                    {state.dungeonTimer.running ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                    {dungeonButtonLabel}
                  </button>
                  <button type="button" className="action-button accent" onClick={completeDungeon} disabled={dungeonElapsed <= 0} data-testid="button-complete-dungeon">
                    <Check size={16} strokeWidth={2.8} /> Donjon terminé
                  </button>
                </>
              )}
              {!isCompleted && (
                <button type="button" className="action-button ghost" onClick={resetRun} data-testid="button-new-run">
                  <RotateCcw size={15} /> Nouvelle run
                </button>
              )}
            </div>

            {isCompleted && (
              <div className="completed-state" data-testid="status-run-completed">
                <Trophy size={18} />
                Run terminée. Chaque temps est conservé dans le journal.
              </div>
            )}
          </section>

          <section className="panel journal-panel" aria-label="Journal des donjons terminés" data-testid="section-journal">
            <div className="section-heading">
              <div>
                <p className="eyebrow">03 · Journal</p>
                <h2 className="section-title">Donjons terminés</h2>
              </div>
              <div className="mode-pill">{currentCompleted.length} enregistré{currentCompleted.length > 1 ? 's' : ''}</div>
            </div>
            {currentCompleted.length === 0 ? (
              <div className="empty-journal" data-testid="empty-journal">
                <Clock3 size={22} />
                <strong>Le journal attend votre premier donjon.</strong>
                <span>Terminez une étape pour conserver son temps exact, même après avoir fermé la page.</span>
              </div>
            ) : (
              <div className="journal-list" aria-live="polite">
                {currentCompleted.map((entry, index) => (
                  <div className="journal-row" key={entry.id} data-testid={`row-completed-dungeon-${entry.id}`}>
                    <div className="journal-index">{String(index + 1).padStart(2, '0')}</div>
                    <div>
                      <div className="journal-name" data-testid={`text-completed-dungeon-${entry.id}`}>{entry.dungeon}</div>
                      <div className="journal-meta">{formatCompletedAt(entry.completedAt)}</div>
                    </div>
                    <div className="journal-time" data-testid={`text-completed-duration-${entry.id}`}>{formatDuration(entry.elapsedMs)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="footer-note">
          <CircleDot size={12} />
          Chronos et parcours restent sur cet appareil.
        </footer>
      </div>
    </main>
  );
}

export default App;