// src/app/main/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { LobbyListButton } from "@/features/game/components/LobbyListButton";

const MODES = [
  {
    key: "free_for_all",
    title: "Free For All",
    description:
      "Classic every-snake-for-itself chaos. First to the target score wins.",
  },
  {
    key: "team_battle",
    title: "Team Battle",
    description:
      "Split into Alpha and Bravo squads and coordinate to outscore the enemy.",
  },
] as const;

export default function MainLandingPage() {
  const [nickname, setNickname] = useState("");
  const [mode, setMode] = useState<(typeof MODES)[number]["key"]>("free_for_all");

  // Инициализируем ник из localStorage
  useEffect(() => {
    const saved = localStorage.getItem("slize_nickname");
    if (saved) setNickname(saved);
  }, []);

  // Дебаунс/сейв ника
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = nickname.trim();
      if (trimmed) localStorage.setItem("slize_nickname", trimmed);
    }, 150);
    return () => clearTimeout(t);
  }, [nickname]);

  const canPlay = useMemo(() => nickname.trim().length >= 3, [nickname]);

  return (
    <main className="min-h-screen px-4 py-16 md:px-12 flex flex-col items-center text-center">
      <section className="max-w-3xl w-full flex flex-col items-center gap-8">
        <div className="space-y-3">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-[var(--foreground)]">
            Welcome to Slize
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground">
            Fast-paced multiplayer snake with power-ups, shrinking arenas, and two competitive modes.
          </p>
        </div>

        {/* Никнейм — теперь ТОЛЬКО на /main */}
        <div className="w-full max-w-md bg-white/70 backdrop-blur-sm rounded-2xl border border-gray-200 p-6 shadow-lg">
          <label className="block text-left text-sm font-semibold mb-2">
            Nickname
          </label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Enter your nickname"
            className="w-full p-3 rounded bg-gray-50 border border-gray-300 text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--accent-hover)] transition shadow-inner"
          />
          <p className="mt-2 text-xs text-gray-500">
            Min 3 characters
          </p>
        </div>

        {/* Выбор режима */}
        <div className="grid gap-6 md:grid-cols-2 w-full">
          {MODES.map((m) => {
            const isSelected = mode === m.key;
            return (
              <div key={m.key} className="relative">
                <button
                  onClick={() => setMode(m.key)}
                  className={`flex w-full flex-col gap-4 rounded-2xl border p-6 text-left transition hover:shadow-xl ${isSelected
                    ? "border-[var(--accent)] bg-white"
                    : "border-gray-200 bg-white/70 hover:border-[var(--accent)]"
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-semibold text-[var(--foreground)]">
                      {m.title}
                    </h2>
                    <span className="text-sm font-mono uppercase tracking-widest text-[var(--accent)]">
                      {isSelected ? "Selected" : "Select"}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {m.description}
                  </p>
                </button>
                <LobbyListButton mode={m.key} />
              </div>
            );
          })}
        </div>

        {/* Старт — ведём в /main/play?mode=... */}
        {canPlay ? (
          <Link
            href={`/main/play?mode=${mode}`}
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] shadow-md hover:shadow-lg transition"
          >
            Play
          </Link>
        ) : (
          <button
            disabled
            className="px-6 py-3 rounded-xl font-bold text-white bg-gray-400 cursor-not-allowed opacity-80"
            title="Enter a valid nickname above"
          >
            Play
          </button>
        )}
      </section>
    </main>
  );
}
