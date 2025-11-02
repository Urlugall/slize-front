// src/features/game/components/LobbyListButton.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { List, RefreshCw } from "lucide-react";

import type { GameModeKey, LobbySummary } from "@/features/game/types";

interface LobbyListButtonProps {
  mode: GameModeKey;
}

type FetchState = "idle" | "loading";

export function LobbyListButton({ mode }: LobbyListButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [lobbies, setLobbies] = useState<LobbySummary[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [joiningLobbyId, setJoiningLobbyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadLobbies = useCallback(async () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!baseUrl) {
      setError("API url is not configured.");
      setLobbies([]);
      return;
    }
    const token = localStorage.getItem("slize_token");
    if (!token) {
      setError("Play once to unlock lobby browser.");
      setLobbies([]);
      return;
    }

    setFetchState("loading");
    setError(null);
    try {
      const response = await fetch(`${baseUrl}/lobbies?mode=${mode}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        let message = "Failed to load lobbies.";
        try {
          const data = await response.json();
          if (typeof data?.error === "string") message = data.error;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      const data = (await response.json()) as { lobbies?: LobbySummary[] };
      setLobbies(data.lobbies ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lobbies.");
      setLobbies([]);
    } finally {
      setFetchState("idle");
    }
  }, [mode]);

  const handleJoin = useCallback(
    async (lobbyId: string) => {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL;
      const token = localStorage.getItem("slize_token");
      if (!baseUrl) {
        setError("API url is not configured.");
        return;
      }
      if (!token) {
        setError("Sign in before joining a lobby.");
        return;
      }

      setJoiningLobbyId(lobbyId);
      setError(null);
      try {
        const response = await fetch(`${baseUrl}/lobbies/join`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ lobbyId }),
        });
        if (!response.ok) {
          let message = "Failed to join lobby.";
          try {
            const data = await response.json();
            if (typeof data?.error === "string") message = data.error;
          } catch {
            /* ignore */
          }
          throw new Error(message);
        }

        const { lobbyId: resolvedLobbyId } = (await response.json()) as {
          lobbyId: string;
        };

        setIsOpen(false);
        router.push(`/main/play?mode=${mode}&lobby=${resolvedLobbyId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to join lobby.");
      } finally {
        setJoiningLobbyId(null);
      }
    },
    [mode, router],
  );

  useEffect(() => {
    if (!isOpen) return;
    loadLobbies();
  }, [isOpen, loadLobbies]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickAway = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute bottom-3 right-3 z-20">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="pointer-events-auto inline-flex h-9 items-center gap-2 rounded-full border border-[var(--accent)]/60 bg-white/90 px-3 text-xs font-semibold text-[var(--accent)] shadow-md backdrop-blur transition hover:border-[var(--accent)] hover:bg-white"
        title="Browse lobbies"
      >
        <List className="h-4 w-4" strokeWidth={2.4} />
        Lobbies
      </button>

      {isOpen ? (
        <div className="pointer-events-auto absolute bottom-12 right-0 w-72 rounded-2xl border border-[rgba(15,23,42,0.12)] bg-white/95 p-4 shadow-2xl backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                {mode.replace(/_/g, " ")}
              </p>
              <p className="text-sm font-semibold text-[var(--foreground)]">
                Active lobbies
              </p>
            </div>
            <button
              type="button"
              onClick={loadLobbies}
              disabled={fetchState === "loading"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
              title="Refresh list"
            >
              <RefreshCw className={`h-4 w-4 ${fetchState === "loading" ? "animate-spin" : ""}`} strokeWidth={2.2} />
            </button>
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
              {error}
            </p>
          ) : null}

          {!error ? (
            <div className="mt-2 max-h-60 space-y-2 overflow-y-auto pr-1">
              {fetchState === "loading" ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  <span className="h-3 w-3 animate-ping rounded-full bg-[var(--accent)]/70" />
                  Loading lobbies…
                </div>
              ) : lobbies.length === 0 ? (
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                  No active lobbies yet.
                </div>
              ) : (
                lobbies.map((lobby) => {
                  const isFull = lobby.playerCount >= lobby.maxPlayers;
                  const isJoining = joiningLobbyId === lobby.id;
                  return (
                    <div
                      key={lobby.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--foreground)]" title={lobby.name}>
                          {lobby.name}
                        </p>
                        <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">
                          {lobby.playerCount}/{lobby.maxPlayers} players
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleJoin(lobby.id)}
                        disabled={isFull || isJoining}
                        className="ml-auto inline-flex items-center rounded-lg bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white shadow transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {isFull ? "Full" : isJoining ? "Joining…" : "Join"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
