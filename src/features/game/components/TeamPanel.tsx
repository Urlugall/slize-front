"use client";
import type { GameState, TeamId } from '@/features/game/types';
import { COLORS } from '@/features/game/config';

interface TeamPanelProps {
    currentState: GameState;
    playerId: string | null;
    onSwitchTeam: (teamId: TeamId) => void;
}

export function TeamPanel({ currentState, playerId, onSwitchTeam }: TeamPanelProps) {
    if (!currentState.teams || currentState.mode !== 'team_battle') {
        return null;
    }

    const myPlayer = playerId ? currentState.players[playerId] : null;
    const myTeamId = myPlayer?.teamId;

    return (
        <div
            className="
        bg-card-bg 
        p-6 
        rounded-xl 
        shadow-lg 
        border border-gray-200 
        mt-4
        flex-shrink-0
        w-full
        xl:w-[260px]  /* фиксированная ширина на широких экранах */
        min-w-[240px] /* не сжимать при сужении */
      "
        >
            <h2 className="text-xl font-bold mb-4 border-b border-[var(--accent)]/50 text-[var(--accent)] pb-2 tracking-wide">
                Teams
            </h2>
            <div className="flex flex-col gap-4">
                {currentState.teams.map((team) => {
                    const isMyTeam = team.id === myTeamId;
                    const teamColor = team.id === 'alpha'
                        ? COLORS.snakes.teamAlpha
                        : COLORS.snakes.teamBravo;

                    return (
                        <div
                            key={team.id}
                            className={`p-3 rounded-lg border-2 ${isMyTeam ? 'bg-gray-50' : ''
                                }`}
                            style={{ borderColor: teamColor }}
                        >
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-lg font-bold" style={{ color: teamColor }}>
                                    {team.displayName}
                                </h3>
                                <span
                                    className="font-mono text-xl font-bold"
                                    style={{ color: teamColor }}
                                >
                                    {team.score}
                                </span>
                            </div>

                            <ul className="flex flex-col gap-1 mb-3">
                                {team.playerIds.map((pid) => {
                                    const player = currentState.players[pid];
                                    if (!player) return null;
                                    const isMe = pid === playerId;
                                    return (
                                        <li
                                            key={pid}
                                            className={`text-sm ${isMe
                                                    ? 'font-bold text-black'
                                                    : 'text-gray-600'
                                                }`}
                                        >
                                            {player.nickname} ({player.score})
                                        </li>
                                    );
                                })}
                            </ul>

                            {!isMyTeam && (
                                <button
                                    onClick={() => onSwitchTeam(team.id)}
                                    className="w-full text-sm px-3 py-1 rounded font-semibold text-white transition hover:opacity-90 active:scale-[.98]"
                                    style={{ backgroundColor: teamColor }}
                                >
                                    Join {team.displayName}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
