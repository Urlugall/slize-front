import type {
  BlockCellState,
  GameOverInfo,
  HotGameState,
  PendingResize,
  PlayerInfo,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  PlayerListPayload,
  PowerUpType,
  PowerUpUpdatePayload,
  ScoreUpdatePayload,
  ServerMessage,
  SlotAssignment,
  TeamId,
  TeamState,
} from '@/features/game/types';

type RawStateMessage = { type: 'state'; payload: Record<string, unknown> };
type RawPlayerListMessage = { type: 'player_list'; payload: Record<string, unknown> };
type RawScoreUpdateMessage = { type: 'score_update'; payload: Record<string, unknown> };
type RawPowerUpUpdateMessage = { type: 'powerup_update'; payload: Record<string, unknown> };
type RawPlayerJoinedMessage = { type: 'player_joined'; payload: Record<string, unknown> };
type RawPlayerLeftMessage = { type: 'player_left'; payload: Record<string, unknown> };
type RawPlayerDiedMessage = { type: 'player_died'; payload: Record<string, unknown> };
type RawGameOverMessage = { type: 'game_over'; payload: Record<string, unknown> };
type RawTeamSwitchedMessage = { type: 'team_switched'; payload: Record<string, unknown> };
type RawTeamSwitchDeniedMessage = { type: 'team_switch_denied'; payload: Record<string, unknown> };

type RawServerMessage =
  | RawStateMessage
  | RawPlayerListMessage
  | RawScoreUpdateMessage
  | RawPowerUpUpdateMessage
  | RawPlayerJoinedMessage
  | RawPlayerLeftMessage
  | RawPlayerDiedMessage
  | RawGameOverMessage
  | RawTeamSwitchedMessage
  | RawTeamSwitchDeniedMessage;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isString = (value: unknown): value is string => typeof value === 'string';

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const isDirection = (value: unknown): value is 'up' | 'down' | 'left' | 'right' =>
  value === 'up' || value === 'down' || value === 'left' || value === 'right';

const resolveDirection = (value: unknown): 'up' | 'down' | 'left' | 'right' | null => {
  if (isDirection(value)) return value;
  switch (value) {
    case 'u':
      return 'up';
    case 'd':
      return 'down';
    case 'l':
      return 'left';
    case 'r':
      return 'right';
    default:
      return null;
  }
};

const isTeamId = (value: unknown): value is TeamId => value === 'alpha' || value === 'bravo';

const isGameModeKey = (value: unknown): value is HotGameState['mode'] =>
  value === 'free_for_all' || value === 'team_battle';

const POWERUP_TYPE_MAP: PowerUpType[] = [
  'SpeedBoost', // 0
  'ScoreBoost', // 1
  'Projectile', // 2
  'Ghost', // 3
  'Reverse', // 4
  'Swap', // 5
];

const POWERUP_TYPES = new Set<PowerUpType>(POWERUP_TYPE_MAP);

const BLOCK_CELL_STATE_MAP: BlockCellState[] = ['warning', 'kill', 'solid'];

const resolvePowerUpType = (value: unknown): PowerUpType | null => {
  if (typeof value === 'number') {
    return POWERUP_TYPE_MAP[value] ?? null;
  }
  if (typeof value === 'string' && POWERUP_TYPES.has(value as PowerUpType)) {
    return value as PowerUpType;
  }
  return null;
};

const resolveBlockState = (value: unknown): BlockCellState | null => {
  if (typeof value === 'number') {
    return BLOCK_CELL_STATE_MAP[value] ?? null;
  }
  if (value === 'warning' || value === 'kill' || value === 'solid') {
    return value;
  }
  return null;
};

const toPoint = (value: unknown): { x: number; y: number } | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [x, y] = value;
  if (!isNumber(x) || !isNumber(y)) return null;
  return { x, y };
};

const toPointList = (value: unknown): { x: number; y: number }[] => {
  if (!Array.isArray(value) || value.length === 0) return [];
  const numbers: number[] = [];
  for (const entry of value) {
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      numbers.push(entry);
    } else {
      return [];
    }
  }
  const result: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    result.push({ x: numbers[i], y: numbers[i + 1] });
  }
  return result;
};

const parsePowerUpSlots = (value: unknown): (PowerUpType | null)[] | null => {
  if (!Array.isArray(value)) return null;
  const result: (PowerUpType | null)[] = [];
  for (const entry of value) {
    if (entry === null) {
      result.push(null);
      continue;
    }
    const resolved = resolvePowerUpType(entry);
    if (!resolved) return null;
    result.push(resolved);
  }
  return result;
};

const extractActiveEffects = (value: unknown): PlayerInfo['activeEffects'] | null => {
  if (!isObject(value)) return null;
  let speedBoost: number | null = null;
  if (isNumber(value.speedBoostUntil)) speedBoost = value.speedBoostUntil;
  else if (isNumber(value.sb)) speedBoost = value.sb;
  let isGhost: number | null = null;
  if (isNumber(value.isGhostUntil)) isGhost = value.isGhostUntil;
  else if (isNumber(value.gh)) isGhost = value.gh;
  if (speedBoost === null || isGhost === null) return null;
  return {
    speedBoostUntil: speedBoost,
    isGhostUntil: isGhost,
  };
};

const parsePlayerInfo = (value: unknown): PlayerInfo | null => {
  if (!isObject(value)) return null;
  if (!isString(value.nickname) || !isNumber(value.score)) return null;
  const powerUpSlotSource =
    'powerUpSlots' in value ? value.powerUpSlots : 'slots' in value ? value.slots : undefined;
  const activeEffectsSource =
    'activeEffects' in value ? value.activeEffects : 'effects' in value ? value.effects : undefined;
  if (powerUpSlotSource === undefined || activeEffectsSource === undefined) return null;
  const powerUpSlots = parsePowerUpSlots(powerUpSlotSource);
  if (!powerUpSlots) return null;
  const activeEffects = extractActiveEffects(activeEffectsSource);
  if (!activeEffects) return null;
  const teamIdCandidate =
    'teamId' in value ? value.teamId : 'team' in value ? value.team : 't' in value ? value.t : null;
  if (!(teamIdCandidate === null || isTeamId(teamIdCandidate))) return null;
  return {
    nickname: value.nickname,
    score: value.score,
    powerUpSlots,
    teamId: teamIdCandidate ?? null,
    activeEffects,
  };
};

const parseSlotAssignments = (value: unknown): SlotAssignment[] | null => {
  if (!Array.isArray(value)) return null;
  const result: SlotAssignment[] = [];
  for (const entry of value) {
    if (Array.isArray(entry)) {
      const [slotId, playerId] = entry;
      if (!isNumber(slotId) || !isString(playerId)) return null;
      result.push({ slotId, playerId });
      continue;
    }
    if (!isObject(entry)) return null;
    let slotId: number | null = null;
    if (isNumber(entry.slotId)) slotId = entry.slotId;
    else if (isNumber(entry.slot)) slotId = entry.slot;
    else if (isNumber(entry.s)) slotId = entry.s;
    let playerId: string | null = null;
    if (isString(entry.playerId)) playerId = entry.playerId;
    else if (isString(entry.player)) playerId = entry.player;
    else if (isString(entry.p)) playerId = entry.p;
    if (slotId === null || !playerId) return null;
    result.push({ slotId, playerId });
  }
  return result;
};

const parsePlayerListPayload = (value: unknown): PlayerListPayload | null => {
  if (!isObject(value) || !isObject(value.players)) return null;
  const playersRaw = value.players as Record<string, unknown>;
  const players: Record<string, PlayerInfo> = {};
  for (const [playerId, info] of Object.entries(playersRaw)) {
    const parsedInfo = parsePlayerInfo(info);
    if (!parsedInfo) return null;
    players[playerId] = parsedInfo;
  }
  const slotAssignments = parseSlotAssignments(
    'slotAssignments' in value ? value.slotAssignments : value.slots,
  );
  if (!slotAssignments) return null;
  return { players, slotAssignments };
};

const parseScoreUpdatePayload = (value: unknown): ScoreUpdatePayload | null => {
  if (!isObject(value)) return null;
  if (!isString(value.playerId)) return null;
  const score = isNumber(value.score) ? value.score : isNumber(value.s) ? value.s : null;
  if (score === null) return null;
  return {
    playerId: value.playerId,
    score,
  };
};

const parsePowerUpUpdatePayload = (value: unknown): PowerUpUpdatePayload | null => {
  if (!isObject(value)) return null;
  const slots = parsePowerUpSlots(
    'powerUpSlots' in value ? value.powerUpSlots : 'slots' in value ? value.slots : undefined,
  );
  if (!slots) return null;
  const activeEffects = extractActiveEffects(value.activeEffects);
  if (!isString(value.playerId) || !activeEffects) return null;
  return {
    playerId: value.playerId,
    powerUpSlots: slots,
    activeEffects,
  };
};

const parsePlayerJoinedPayload = (value: unknown): PlayerJoinedPayload | null => {
  if (!isObject(value)) return null;
  if (!isString(value.playerId)) return null;
  const slotId = isNumber(value.slotId) ? value.slotId : isNumber(value.slot) ? value.slot : null;
  if (slotId === null) return null;
  const playerInfo = parsePlayerInfo(value.player);
  if (!playerInfo) return null;
  return {
    playerId: value.playerId,
    slotId,
    player: playerInfo,
  };
};

const parsePlayerLeftPayload = (value: unknown): PlayerLeftPayload | null => {
  if (!isObject(value)) return null;
  if (!isString(value.playerId)) return null;
  const slotId = isNumber(value.slotId) ? value.slotId : isNumber(value.slot) ? value.slot : null;
  if (slotId === null) return null;
  return {
    playerId: value.playerId,
    slotId,
  };
};

const parsePlayerDiedPayload = (value: unknown): { playerId: string } | null => {
  if (!isObject(value) || !isString(value.playerId)) return null;
  return { playerId: value.playerId };
};

const parseGameOverPayload = (value: unknown): GameOverInfo | null => {
  if (!isObject(value)) return null;
  if (
    !isString(value.winnerId) ||
    !isString(value.winnerNickname) ||
    !isNumber(value.resetAt) ||
    !isNumber(value.winnerScore)
  ) {
    return null;
  }
  return {
    winnerId: value.winnerId,
    winnerNickname: value.winnerNickname,
    resetAt: value.resetAt,
    winnerScore: value.winnerScore,
  };
};

const parseTeamSwitchedPayload = (value: unknown): { playerId: string; teamId: TeamId } | null => {
  if (!isObject(value) || !isString(value.playerId) || !isTeamId(value.teamId)) return null;
  return { playerId: value.playerId, teamId: value.teamId };
};

const parseTeamSwitchDeniedPayload = (value: unknown): { reason: string } | null => {
  if (!isObject(value) || !isString(value.reason)) return null;
  return { reason: value.reason };
};

const parseTeams = (value: unknown): TeamState[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const teams: TeamState[] = [];
  for (const entry of value) {
    if (!isObject(entry)) continue;
    const id = isTeamId(entry.id) ? entry.id : isTeamId(entry.i) ? entry.i : null;
    const displayName = isString(entry.displayName)
      ? entry.displayName
      : isString(entry.name)
        ? entry.name
        : isString(entry.n)
          ? entry.n
          : null;
    const score = isNumber(entry.score) ? entry.score : isNumber(entry.s) ? entry.s : null;
    const playerIds = isStringArray(entry.playerIds)
      ? entry.playerIds
      : isStringArray(entry.p)
        ? entry.p
        : null;
    if (!id || !displayName || score === null || !playerIds) continue;
    teams.push({
      id,
      displayName,
      score,
      playerIds,
    });
  }
  return teams.length ? teams : undefined;
};

const parsePendingResize = (value: unknown): PendingResize | undefined => {
  if (!isObject(value)) return undefined;
  const from = isNumber(value.from) ? value.from : isNumber(value.f) ? value.f : null;
  const to = isNumber(value.to) ? value.to : isNumber(value.t) ? value.t : null;
  const announcedAt = isNumber(value.announcedAt)
    ? value.announcedAt
    : isNumber(value.a)
      ? value.a
      : null;
  const warnMs = isNumber(value.warnMs) ? value.warnMs : isNumber(value.w) ? value.w : null;
  const killMs = isNumber(value.killMs) ? value.killMs : isNumber(value.k) ? value.k : null;
  if (
    from === null ||
    to === null ||
    announcedAt === null ||
    warnMs === null ||
    killMs === null
  ) {
    return undefined;
  }
  return {
    from,
    to,
    announcedAt,
    warnMs,
    killMs,
  };
};

const parseBlocks = (value: unknown) => {
  if (!Array.isArray(value)) return undefined;
  const blocks = [];
  for (const entry of value) {
    if (!isObject(entry)) continue;
    const position = toPoint(entry.p ?? [entry.x, entry.y]);
    const state = resolveBlockState(entry.s);
    if (!position || !state) continue;
    const activateAt = isNumber(entry.a) ? entry.a : 0;
    const expireAt = isNumber(entry.e) ? entry.e : undefined;
    blocks.push({
      x: position.x,
      y: position.y,
      state,
      activateAt,
      expireAt,
    });
  }
  return blocks.length ? blocks : undefined;
};

const parsePowerUps = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const powerUps = [];
  for (const entry of value) {
    if (!isObject(entry)) continue;
    const id = isString(entry.i) ? entry.i : isNumber(entry.i) ? String(entry.i) : null;
    const position = toPoint(entry.p);
    const type = resolvePowerUpType(entry.t);
    if (!id || !position || !type) continue;
    powerUps.push({
      id,
      type,
      position,
    });
  }
  return powerUps;
};

const parseProjectiles = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const projectiles = [];
  for (const entry of value) {
    if (!isObject(entry)) continue;
    const id = isString(entry.i) ? entry.i : isNumber(entry.i) ? String(entry.i) : null;
    const ownerId = isNumber(entry.o) ? entry.o : null;
    const position = toPoint(entry.p);
    const direction = resolveDirection(entry.d);
    if (!id || ownerId === null || !position || !direction) continue;
    projectiles.push({
      id,
      ownerId,
      position,
      direction,
    });
  }
  return projectiles;
};

const parseSnakes = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const snakes = [];
  for (const entry of value) {
    if (!isObject(entry)) continue;
    const id = isNumber(entry.i) ? entry.i : null;
    const body = toPointList(entry.b);
    if (id === null) continue;
    snakes.push({
      id,
      body,
    });
  }
  return snakes;
};

const parseFood = (value: unknown) => toPointList(value);

const parseGameOverFromState = (value: unknown) => {
  const payload = parseGameOverPayload(value);
  return payload ?? undefined;
};

const deserializeHotState = (payload: Record<string, unknown>): HotGameState => {
  const tick = isNumber(payload.t) ? payload.t : 0;
  const gridSize = isNumber(payload.g) ? payload.g : 0;
  const mode =
    (isGameModeKey(payload.m) && payload.m) ||
    (isGameModeKey(payload.mode) && payload.mode) ||
    'free_for_all';
  const snakes = parseSnakes(payload.s);
  const food = parseFood(payload.f);
  const powerUps = parsePowerUps(payload.p);
  const projectiles = parseProjectiles(payload.j);
  const blocks = parseBlocks(payload.b);
  const pendingResize = parsePendingResize(payload.r);
  const teams = parseTeams(payload.tm);
  const gameOver = parseGameOverFromState(payload.o ?? payload.gameOver);

  return {
    tick,
    gridSize,
    mode,
    snakes,
    food,
    powerUps,
    projectiles,
    blocks,
    pendingResize,
    teams,
    gameOver,
  };
};

export const isServerMessage = (data: unknown): data is RawServerMessage => {
  if (!isObject(data)) return false;
  const { type, payload } = data as { type?: unknown; payload?: unknown };
  if (!isString(type)) return false;

  switch (type) {
    case 'state':
      return isObject(payload);
    case 'player_list':
      return parsePlayerListPayload(payload) !== null;
    case 'score_update':
      return parseScoreUpdatePayload(payload) !== null;
    case 'powerup_update':
      return parsePowerUpUpdatePayload(payload) !== null;
    case 'player_joined':
      return parsePlayerJoinedPayload(payload) !== null;
    case 'player_left':
      return parsePlayerLeftPayload(payload) !== null;
    case 'player_died':
      return parsePlayerDiedPayload(payload) !== null;
    case 'game_over':
      return parseGameOverPayload(payload) !== null;
    case 'team_switched':
      return parseTeamSwitchedPayload(payload) !== null;
    case 'team_switch_denied':
      return parseTeamSwitchDeniedPayload(payload) !== null;
    default:
      return false;
  }
};

export const parseServerMessage = (data: unknown): ServerMessage | null => {
  if (typeof data !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  if (!isServerMessage(parsed)) {
    return null;
  }

  const raw = parsed as RawServerMessage;
  switch (raw.type) {
    case 'state':
      return { type: 'state', payload: deserializeHotState(raw.payload) };
    case 'player_list': {
      const payload = parsePlayerListPayload(raw.payload);
      if (!payload) return null;
      return { type: 'player_list', payload };
    }
    case 'score_update': {
      const payload = parseScoreUpdatePayload(raw.payload);
      return payload ? { type: 'score_update', payload } : null;
    }
    case 'powerup_update': {
      const payload = parsePowerUpUpdatePayload(raw.payload);
      return payload ? { type: 'powerup_update', payload } : null;
    }
    case 'player_joined': {
      const payload = parsePlayerJoinedPayload(raw.payload);
      return payload ? { type: 'player_joined', payload } : null;
    }
    case 'player_left': {
      const payload = parsePlayerLeftPayload(raw.payload);
      return payload ? { type: 'player_left', payload } : null;
    }
    case 'player_died': {
      const payload = parsePlayerDiedPayload(raw.payload);
      return payload ? { type: 'player_died', payload } : null;
    }
    case 'game_over': {
      const payload = parseGameOverPayload(raw.payload);
      return payload ? { type: 'game_over', payload } : null;
    }
    case 'team_switched': {
      const payload = parseTeamSwitchedPayload(raw.payload);
      return payload ? { type: 'team_switched', payload } : null;
    }
    case 'team_switch_denied': {
      const payload = parseTeamSwitchDeniedPayload(raw.payload);
      return payload ? { type: 'team_switch_denied', payload } : null;
    }
    default:
      return null;
  }
};
