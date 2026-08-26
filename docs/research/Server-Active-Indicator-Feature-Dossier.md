# Server Active Indicator — Feature Dossier

**Source repo:** `Kashif-Rezwi/code-review-agent` (branch: `main`)
**In-code name:** the feature has no literal name matching "Server Active Indicator" — the codebase calls it **"Server Wakeup"** everywhere (files, hook, provider, context, docs heading). This dossier treats "Server Wakeup" as the implementation of what you're calling the Server Active Indicator.
**Inspection method:** read-only. The repo was cloned into a scratch directory and only `view`/`grep` were used. Nothing in the source tree was modified, renamed, or reformatted.

---

## 1. Feature Overview

The feature is a small, self-contained subsystem that tells the user, inside the app header, whether the NestJS API (deployed on Render's free tier, which sleeps after inactivity) is reachable. On app load it silently pings `GET /health`. If the ping doesn't come back inside 3 seconds it assumes the server is asleep, shows an amber "Server is waking up" strip with a live elapsed-time counter, and keeps retrying every 5 seconds until the server responds — at which point it flips to a green "Server is ready" confirmation for 2.5 seconds and then disappears for the rest of the session. If the server answers within the first 3 seconds, nothing is ever shown.

It is four files, no tests, no dedicated types file, no dedicated styles file, and no environment-variable configuration of its own (it reuses the app-wide `NEXT_PUBLIC_API_URL`).

---

## 2. Complete File Inventory

| File | Purpose | Part of indicator it implements | Connects to |
|---|---|---|---|
| `apps/client/lib/use-server-wakeup.ts` | Core hook: pings `/health`, owns the `idle → waking → awake` state machine, timers, elapsed-seconds counter | State/logic, health check, polling, timing | Imports `API_URL` from `lib/api.ts`; consumed by `server-wakeup-context.tsx` |
| `apps/client/lib/server-wakeup-context.tsx` | React Context provider that wraps `useServerWakeup()`, adds the "auto-dismiss after 2.5s once awake" behavior, exposes `useWakeupContext()` | State distribution, dismiss logic | Calls `use-server-wakeup.ts`; mounted in `app/layout.tsx`; read by `server-wakeup-banner.tsx` |
| `apps/client/components/ui/server-wakeup-banner.tsx` | The visible UI strip (amber "waking" / green "ready") | UI | Reads `useWakeupContext()`; uses `cn` from `lib/utils.ts`; icons from `lucide-react`; rendered by `app-header.tsx` |
| `apps/client/components/layout/app-header.tsx` | Shared page header; renders `<ServerWakeupBanner />` as a sibling right after `<header>` | Integration/mount point (UI side) | Imports `server-wakeup-banner.tsx`; itself imported by 5 route files (see §13) |
| `apps/client/app/layout.tsx` | Root layout; wraps the whole app in `<ServerWakeupProvider>` | Integration/mount point (state side) | Imports `server-wakeup-context.tsx` |
| `apps/client/lib/api.ts` | Defines `API_URL` from `process.env.NEXT_PUBLIC_API_URL` | Configuration (shared, not feature-specific) | Imported by `use-server-wakeup.ts` for the ping URL |
| `apps/client/lib/utils.ts` | `cn()` — `clsx` + `tailwind-merge` helper | Styling utility (shared, not feature-specific) | Imported by `server-wakeup-banner.tsx` |
| `apps/client/.env.example` | Documents `NEXT_PUBLIC_API_URL` default (`http://localhost:4000`) | Environment | Read at build time via `process.env` |
| `apps/server/src/health.controller.ts` | Implements `GET /health` | Backend health check | Registered in `app.module.ts`; injects `GithubService`, `PrismaService`, `RedisService` |
| `apps/server/src/app.module.ts` | Registers `HealthController` at the module level | Backend integration point | — |
| `apps/server/src/main.ts` | Global CORS config (`app.enableCors(...)`) that governs whether the browser is allowed to read the `/health` response at all | Backend/network configuration | Reads `FRONTEND_URL`, `NODE_ENV` |
| `docs/frontend.md` (lines 196–198) | Pre-existing prose documentation of this feature | Documentation | — (see §19 for a discrepancy between this doc and the actual code) |

**Not included**, and why: `apps/server/src/github/github.service.ts`, `apps/server/src/prisma/prisma.service.ts`, and `apps/server/src/queue/redis.service.ts` are referenced *by* `health.controller.ts` for its dependency-health payload (`database`, `redis`, `githubToken`, etc.), but the frontend indicator never reads that payload — it only checks `res.ok`. These are backend-internal collaborators of the `/health` endpoint, not part of the indicator itself. They're covered briefly in §8 for completeness but excluded from the file inventory proper.

There are **no test files** for this feature (`find` for `*wakeup*`/`*health*` under `__tests__`/`.spec.`/`.test.` returned nothing beyond unrelated Prisma/GitHub specs).

---

## 3. Actual Feature Structure

Using the real files and terminology from the codebase:

```text
Server Wakeup ("Server Active Indicator")
├── UI
│   └── components/ui/server-wakeup-banner.tsx   (ServerWakeupBanner)
├── State / Logic
│   ├── lib/use-server-wakeup.ts                 (useServerWakeup — the state machine)
│   └── lib/server-wakeup-context.tsx            (ServerWakeupProvider / useWakeupContext — dismiss logic)
├── Health Check
│   └── pingHealth() inside lib/use-server-wakeup.ts (fetch + AbortController)
├── API Layer
│   └── lib/api.ts → API_URL constant only (no shared apiFetch() used here — see §5 note)
├── Types
│   └── WakeupStatus (inline export in lib/use-server-wakeup.ts — no separate types file)
├── Styling
│   └── Inline Tailwind utility classes in server-wakeup-banner.tsx, composed via lib/utils.ts::cn()
├── Configuration
│   └── PING_TIMEOUT_MS, POLL_INTERVAL_MS, DEV_SIMULATE_SLEEP — module-level constants in use-server-wakeup.ts (not env-driven)
└── Integration
    ├── app/layout.tsx                            (mounts ServerWakeupProvider around the whole app)
    └── components/layout/app-header.tsx           (mounts ServerWakeupBanner, per-page)
```

Backend counterpart (separate concern, consumed over HTTP):

```text
Backend Health Endpoint
└── apps/server/src/health.controller.ts  →  GET /health
      ├── GithubService.getTokenHealth()
      ├── PrismaService (SELECT 1 + schema check)
      └── RedisService.checkConnection() / checkStreams()
```

---

## 4. Architecture Explanation

- **Where it starts:** `ServerWakeupProvider`, mounted once in `app/layout.tsx`, which wraps every page. It calls `useServerWakeup()` on mount.
- **How it initializes:** `useServerWakeup()`'s `useEffect` runs once (`[]` deps) on first mount of the provider. It immediately calls an inner `run()` function.
- **How it checks the server:** `run()` calls `pingHealth(PING_TIMEOUT_MS)`, which does a `fetch(`${API_URL}/health`)` guarded by an `AbortController` timer.
- **How requests are made:** Plain `fetch`, not the app's shared `apiFetch()` wrapper (from `lib/api.ts`) — no `Authorization` header, `cache: 'no-store'`, aborted via `AbortController` after `PING_TIMEOUT_MS`.
- **How responses are interpreted:** Only `res.ok` (HTTP 2xx) is checked. The JSON body (`status: 'ok' | 'degraded'`, dependency details) returned by the backend is never parsed or read by the frontend.
- **How server state is determined:** Boolean up/down from `pingHealth()`'s return value drives the `WakeupStatus` state machine (`idle` / `waking` / `awake`).
- **How state changes:** See §9 (State Model) for the full transition table.
- **How the UI reacts:** `ServerWakeupBanner` reads `{ status, elapsedSec, dismissed }` from `useWakeupContext()` and renders `null`, an amber strip, or a green strip.
- **How retries work:** No backoff, no maximum-retry cap. While not up, `poll()` reschedules itself with `setTimeout(poll, POLL_INTERVAL_MS)` (flat 5s cadence) indefinitely.
- **How timeouts work:** Every individual ping (initial and each poll) is capped at `PING_TIMEOUT_MS` (3s) via `AbortController`. A timeout and a network/HTTP failure are handled identically — both resolve `pingHealth()` to `false`.
- **How failures are handled:** Any thrown error inside `pingHealth`'s `fetch` (network failure, CORS block, abort) is swallowed by a `catch { return false }` — there's no distinct error state or error message shown to the user beyond "still waking up."
- **How the feature stops or resumes checking:** Once `isUp` is `true`, `stopTimers()` is called and no further pings are ever issued for the rest of that mount's lifetime. There's no mechanism to detect the server going back to sleep later in the same session (see §19).
- **How it integrates with the rest of the app:** State (`ServerWakeupProvider`) lives at the root layout so it survives client-side navigation; the visible UI (`ServerWakeupBanner`) is mounted separately, inside `AppHeader`, which is only rendered on some pages (see §13).

Actual flow, derived from the code:

```text
app/layout.tsx (ServerWakeupProvider mounts, once, for the whole app)
   ↓
useServerWakeup() effect fires on mount
   ↓
pingHealth(3000ms) → fetch(`${API_URL}/health`)
   ↓
Response within 3s & res.ok=true          Response missing/late/errored
   ↓                                              ↓
status stays 'idle' forever                status → 'waking'; elapsed-sec
(banner never renders)                     counter starts; setTimeout(poll, 5000)
                                                   ↓
                                            poll() → pingHealth(3000ms) again
                                                   ↓
                                     still down ───┴─── now up
                                          ↓                ↓
                                  reschedule +5s     stopTimers(); status → 'awake'
                                                            ↓
                                                  ServerWakeupProvider's own
                                                  useEffect starts a 2.5s timer
                                                            ↓
                                                     dismissed = true
                                                            ↓
                                              ServerWakeupBanner returns null
```

---

## 5. Trace the Code Path

```text
Where it is mounted
  app/layout.tsx → <ServerWakeupProvider> wraps <SessionProvider><WalletProvider>{children}</WalletProvider></SessionProvider>
  components/layout/app-header.tsx → <ServerWakeupBanner /> rendered as a sibling immediately after </header>
        ↓
What executes first
  ServerWakeupProvider's body calls useServerWakeup() → its useEffect (mount-only, [] deps) runs
        ↓
What function/hook is called
  Inner run() function inside the useEffect of useServerWakeup()
        ↓
What request is made
  pingHealth(PING_TIMEOUT_MS) → fetch(`${API_URL}/health`, { signal, cache: 'no-store' })
  (no auth header, no request body — GET only)
        ↓
What happens when it succeeds (within 3s, res.ok)
  If this is the very first ping: run() simply returns — status stays 'idle', nothing renders.
  If this is a later poll() succeeding after 'waking': stopTimers(); setStatus('awake')
        ↓
What happens when it fails (network error, non-2xx, CORS, offline)
  pingHealth's try/catch returns false → run() treats it the same as a timeout (see below)
        ↓
What happens during a timeout
  AbortController fires ac.abort() after PING_TIMEOUT_MS → fetch rejects → caught → pingHealth returns false
  → on the first call this sets status='waking', starts the elapsed-seconds interval, and schedules poll() in 5s
  → on later polls it just reschedules poll() again in 5s
        ↓
How the status changes
  idle → waking (first failed/timed-out ping)
  waking → awake (a later poll succeeds)
  (idle never transitions to awake directly — see §9)
        ↓
How the user sees the result
  ServerWakeupBanner (mounted inside AppHeader, which itself is only mounted on /review*, /history*, /account, /standards)
  renders nothing while 'idle', an amber "Server is waking up  ⟳ 0s…Ns" strip while 'waking',
  a green "Server is ready" strip for 2.5s once 'awake', then nothing (dismissed=true) for the rest of the session.
```

---

## 6. Actual Code (Verbatim)

### 6.1 `apps/client/lib/use-server-wakeup.ts` (full file — this is the entire feature's logic core)

```typescript
'use client'

import { useState, useEffect } from 'react'
import { API_URL } from './api'

export type WakeupStatus =
    | 'idle'    // initial ping in flight — banner not shown yet
    | 'waking'  // server didn't respond in time — banner visible
    | 'awake'   // server is up — show brief confirmation then dismiss

/** Per-request timeout for each health ping (initial and polling). */
const PING_TIMEOUT_MS = 3_000

/** How often to retry while the server is waking up. */
const POLL_INTERVAL_MS = 5_000

/** DEV ONLY — force the waking state to preview the banner → recovery flow without waiting for Render to sleep. Flip back before committing. */
const DEV_SIMULATE_SLEEP = false

async function pingHealth(timeoutMs: number): Promise<boolean> {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    try {
        const res = await fetch(`${API_URL}/health`, {
            signal: ac.signal,
            cache: 'no-store',
        })
        return res.ok
    } catch {
        return false
    } finally {
        clearTimeout(timer)
    }
}

/**
 * Ping /health on mount; if the server doesn't respond within PING_TIMEOUT_MS, transition to
 * 'waking' and poll every POLL_INTERVAL_MS until it's up. Returns the wakeup status + elapsed seconds.
 */
export function useServerWakeup() {
    const [status, setStatus] = useState<WakeupStatus>('idle')
    const [elapsedSec, setElapsedSec] = useState(0)

    useEffect(() => {
        let cancelled = false
        let pollTimer: ReturnType<typeof setTimeout> | null = null
        let elapsedTimer: ReturnType<typeof setInterval> | null = null

        const stopTimers = () => {
            if (pollTimer) clearTimeout(pollTimer)
            if (elapsedTimer) clearInterval(elapsedTimer)
        }

        const startElapsedCounter = () => {
            const startTime = Date.now()
            elapsedTimer = setInterval(() => {
                if (!cancelled) setElapsedSec(Math.floor((Date.now() - startTime) / 1000))
            }, 1_000)
        }

        const poll = async () => {
            // When simulating, never resolve to awake — keeps the banner visible for inspection.
            const isUp = DEV_SIMULATE_SLEEP ? false : await pingHealth(PING_TIMEOUT_MS)
            if (cancelled) return
            if (isUp) {
                stopTimers()
                setStatus('awake')
            } else {
                pollTimer = setTimeout(poll, POLL_INTERVAL_MS)
            }
        }

        const run = async () => {
            const isUp = DEV_SIMULATE_SLEEP ? false : await pingHealth(PING_TIMEOUT_MS)
            if (cancelled) return

            if (isUp) {
                // Server was already awake — stay 'idle' so the banner never renders; the green
                // confirmation only shows on recovery from a sleeping state (idle → waking → awake).
                return
            }

            // Server is sleeping — show the banner and start counting
            setStatus('waking')
            startElapsedCounter()
            pollTimer = setTimeout(poll, POLL_INTERVAL_MS)
        }

        run()

        return () => {
            cancelled = true
            stopTimers()
        }
    }, [])

    return { status, elapsedSec }
}
```

### 6.2 `apps/client/lib/server-wakeup-context.tsx` (full file)

```typescript
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useServerWakeup, type WakeupStatus } from './use-server-wakeup'

interface WakeupContextValue {
    status: WakeupStatus
    elapsedSec: number
    dismissed: boolean
}

const WakeupContext = createContext<WakeupContextValue>({
    status: 'idle',
    elapsedSec: 0,
    dismissed: false,
})

export function useWakeupContext() {
    return useContext(WakeupContext)
}

export function ServerWakeupProvider({ children }: { children: React.ReactNode }) {
    const { status, elapsedSec } = useServerWakeup()
    const [dismissed, setDismissed] = useState(false)

    useEffect(() => {
        if (status !== 'awake' || dismissed) return
        const t = setTimeout(() => setDismissed(true), 2_500)
        return () => clearTimeout(t)
    }, [status, dismissed])

    return (
        <WakeupContext.Provider value={{ status, elapsedSec, dismissed }}>
            {children}
        </WakeupContext.Provider>
    )
}
```

### 6.3 `apps/client/components/ui/server-wakeup-banner.tsx` (full file)

```typescript
'use client'

import { CloudOff, CheckCircle, Loader2 } from 'lucide-react'
import { useWakeupContext } from '@/lib/server-wakeup-context'
import { cn } from '@/lib/utils'

function formatElapsed(sec: number): string {
    if (sec < 60) return `${sec}s`
    return `${Math.floor(sec / 60)}m ${sec % 60}s`
}

/**
 * Inline strip inside AppHeader shown only when the Render free-tier server is sleeping — the first
 * health ping has a 3s timeout before revealing, so awake servers produce zero visual noise. State lives
 * in ServerWakeupProvider (root layout) so the timer/dismissed flag survive page navigations.
 */
export function ServerWakeupBanner() {
    const { status, elapsedSec, dismissed } = useWakeupContext()

    // Never show if the server was already awake on first ping, or after dismissal
    if (dismissed || status === 'idle') return null

    const isWaking = status === 'waking'

    return (
        <div
            role="status"
            aria-live="polite"
            className={cn(
                'w-full flex items-center justify-center gap-2.5',
                'px-4 py-2 text-xs font-medium',
                'border-b transition-colors duration-500',
                isWaking
                    ? 'bg-amber-950/60 border-amber-500/20 text-amber-300'
                    : 'bg-green-950/60 border-green-500/20 text-green-300',
            )}
        >
            {isWaking ? (
                <>
                    <CloudOff className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    <span>Server is waking up</span>
                    <span className="flex items-center gap-1.5 pl-2.5 border-l border-amber-500/25 text-amber-400/70 tabular-nums">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {formatElapsed(elapsedSec)}
                    </span>
                </>
            ) : (
                <>
                    <CheckCircle className="w-3.5 h-3.5 shrink-0 text-green-400" />
                    <span>Server is ready</span>
                </>
            )}
        </div>
    )
}
```

### 6.4 `apps/client/app/layout.tsx` (full file — shown because the whole file is the mount point)

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "./session-provider";
import { ServerWakeupProvider } from "@/lib/server-wakeup-context";
import { WalletProvider } from "@/context/wallet-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Code Review Agent",
  description: "AI-powered code review with clustering, standards enforcement, and follow-up chat.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-app-bg text-gray-100`}
      >
        <ServerWakeupProvider>
          <SessionProvider>
            <WalletProvider>{children}</WalletProvider>
          </SessionProvider>
        </ServerWakeupProvider>
      </body>
    </html>
  );
}
```

### 6.5 `apps/client/components/layout/app-header.tsx` (relevant excerpts only — the rest of this 204-line file is unrelated header/nav/session/wallet/menu code)

Import (line 10):
```typescript
import { ServerWakeupBanner } from '@/components/ui/server-wakeup-banner'
```

Return statement structure (lines 49–51, showing the fragment wrapping `<header>`):
```typescript
    return (
        <>
            <header className="sticky top-0 z-50 border-b border-gray-800 bg-app-bg/95 backdrop-blur-md font-sans">
```

Mount point (lines 197–201, end of the component — note `ServerWakeupBanner` is a **sibling after `</header>`**, not nested inside it):
```typescript
                </div>
            </header>
            <ServerWakeupBanner />
        </>
    )
```

### 6.6 `apps/client/lib/api.ts` (relevant excerpt — `API_URL` definition only; the rest of the file is the unrelated `apiFetch`/`apiErrorMessage` helpers, which this feature does *not* use)

```typescript
/** Base URL for all server API calls — set NEXT_PUBLIC_API_URL in your .env */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''
```

### 6.7 `apps/client/lib/utils.ts` (full file — shared styling helper)

```typescript
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}
```

### 6.8 `apps/server/src/health.controller.ts` (full file — backend endpoint)

```typescript
import { Controller, Get } from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { GithubService } from './github/github.service'
import { PrismaService } from './prisma/prisma.service'
import { RedisService } from './queue/redis.service'

type HealthState = 'valid' | 'invalid' | 'unchecked'
type CachedHealth = {
    expiresAt: number
    database: HealthState
    databaseSchema: HealthState
    redis: HealthState
    redisStreams: HealthState
}

@Controller('health')
export class HealthController {
    private cache?: CachedHealth

    constructor(
        private readonly githubService: GithubService,
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    @Get()
    async check() {
        const dependencies = await this.cachedDependencies()
        const githubToken = this.githubService.getTokenHealth()
        const degraded = githubToken === 'invalid' ||
            dependencies.database !== 'valid' ||
            dependencies.databaseSchema !== 'valid' ||
            dependencies.redis !== 'valid' ||
            dependencies.redisStreams !== 'valid'

        return {
            status: degraded ? 'degraded' : 'ok',
            ...dependencies,
            githubToken,
        }
    }

    private async cachedDependencies(): Promise<Omit<CachedHealth, 'expiresAt'>> {
        if (this.cache && this.cache.expiresAt > Date.now()) {
            return {
                database: this.cache.database,
                databaseSchema: this.cache.databaseSchema,
                redis: this.cache.redis,
                redisStreams: this.cache.redisStreams,
            }
        }

        let database: HealthState = 'invalid'
        let databaseSchema: HealthState = 'invalid'
        try {
            await this.prisma.$queryRaw(Prisma.sql`SELECT 1`)
            database = 'valid'
            const rows = await this.prisma.$queryRaw<Array<{ dispatch_table: boolean; coverage_column: boolean }>>(Prisma.sql`
                SELECT
                    to_regclass('public."ReviewDispatch"') IS NOT NULL AS dispatch_table,
                    EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'Review' AND column_name = 'coverage'
                    ) AS coverage_column
            `)
            databaseSchema = rows[0]?.dispatch_table && rows[0]?.coverage_column ? 'valid' : 'invalid'
        } catch {
            database = 'invalid'
            databaseSchema = 'unchecked'
        }

        const [redisConnected, streamsSupported] = await Promise.all([
            this.redisService.checkConnection(),
            this.redisService.checkStreams(),
        ])
        this.cache = {
            expiresAt: Date.now() + 30_000,
            database,
            databaseSchema,
            redis: redisConnected ? 'valid' : 'invalid',
            redisStreams: streamsSupported ? 'valid' : 'invalid',
        }
        return { database, databaseSchema, redis: this.cache.redis, redisStreams: this.cache.redisStreams }
    }
}
```

### 6.9 `apps/server/src/app.module.ts` (full file — module registration)

```typescript
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { PrismaModule } from './prisma/prisma.module'
import { RagModule } from './rag/rag.module'
import { ReviewModule } from './review/review.module'
import { HistoryModule } from './history/history.module'
import { AuthModule } from './auth/auth.module'
import { HealthController } from './health.controller'
import { QueueModule } from './queue/queue.module'
import { AiModule } from './ai/ai.module'
import { GithubModule } from './github/github.module'
import { PaymentsModule } from './payments/payments.module'

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        // Cost guardrail for paid AI endpoints. Limits apply only where
        // UserThrottlerGuard is used; keyed by authenticated userId.
        ThrottlerModule.forRoot({
            errorMessage: 'Rate limit exceeded — too many requests. Please wait before trying again.',
            throttlers: [{ name: 'default', ttl: 3_600_000, limit: 60 }],
        }),
        PrismaModule,
        AiModule,
        GithubModule,
        AuthModule,
        RagModule,
        ReviewModule,
        HistoryModule,
        QueueModule,
        PaymentsModule,
    ],
    controllers: [HealthController],
})
export class AppModule {}
```

### 6.10 `apps/server/src/main.ts` (full file — bootstrap, CORS is what matters for this feature)

```typescript
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import type { IncomingMessage } from 'http'
import { json, urlencoded } from 'express'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bodyParser: false })

  app.use(
    json({
      limit: '1mb',
      verify: (req: IncomingMessage & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf
      },
    }),
  )
  app.use(urlencoded({ extended: true, limit: '1mb' }))

  // RZC-008: Trust upstream reverse proxy (Cloudflare/Vercel/Render) for accurate req.ip in Throttler
  app.set('trust proxy', 1)

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }))


  const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '') || 'http://localhost:3000'

  // localhost is a dev convenience — never trust it in production
  const allowedOrigins =
    process.env.NODE_ENV === 'production'
      ? [frontendUrl]
      : [frontendUrl, 'http://localhost:3000']

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    // x-dev-pack: operator-only header that unlocks the hidden ₹1 dev pack per-request.
    allowedHeaders: ['Content-Type', 'Authorization', 'x-dev-pack'],
  })

  // Drain Prisma/Redis/BullMQ cleanly on SIGTERM (every Render deploy sends one)
  app.enableShutdownHooks()

  const port = process.env.PORT ?? 4000
  await app.listen(port)
  console.log(`Server running on port ${port}`)
}
void bootstrap()
```

### 6.11 `apps/client/.env.example` (relevant line)

```
# NestJS backend URL — change to your Render API URL in production
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## 7. Dependency Analysis

**Direct dependencies (truly required for the indicator itself):**

| Dependency | Used for | Required? |
|---|---|---|
| React `useState`/`useEffect`/`createContext`/`useContext` | State machine, context distribution | Yes — core to the logic |
| Browser `fetch` API | Making the health-check request | Yes |
| Browser `AbortController` | Per-request timeout | Yes |
| Browser `setTimeout`/`setInterval` | Polling cadence, elapsed-seconds counter | Yes |
| `lucide-react` (`CloudOff`, `CheckCircle`, `Loader2`) | Banner icons | Cosmetic — swappable for any icon set |

**Application dependencies (incidental — present only because of how this app is built):**

| Dependency | Why it's here | Truly needed for a reusable version? |
|---|---|---|
| Next.js (`'use client'` directive) | This app is a Next.js App Router project | No — the hook/context logic is plain React; only the directive is Next-specific |
| `clsx` + `tailwind-merge` (via `lib/utils.ts::cn`) | This app's className-merging convention | No — any className approach (or CSS Modules/styled-components) would work |
| Tailwind CSS utility classes | This app's styling system | No — purely presentational, tightly coupled to this app's design tokens (`amber-950/60`, `green-950/60`, `app-bg`, etc.) |
| NestJS (`@Controller`, `@Get`) | This backend is NestJS | No — the reusable *contract* is just "a GET endpoint that returns 2xx when healthy"; any backend framework satisfies it |
| Prisma / ioredis / GitHub token check inside `/health` | This app's specific dependency graph | No — and notably the frontend indicator doesn't even care about this detail, since it only checks `res.ok`, not the JSON body |

**Notably not used by this feature**, despite being available in the app: the shared `apiFetch()` wrapper in `lib/api.ts` (which adds Bearer-token auth and JSON parsing). The wakeup hook only imports the `API_URL` string constant from that file and does its own raw `fetch` — an architectural choice that keeps the health ping decoupled from auth state.

---

## 8. Configuration and Environment

| Value | Where defined | How it's used | Configurable? |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | `.env` (client), documented in `apps/client/.env.example` and `docs/deployment.md` (Vercel dashboard var) | Read via `process.env.NEXT_PUBLIC_API_URL` in `lib/api.ts` → exported as `API_URL` → interpolated into `${API_URL}/health` | Yes — the only externally configurable value this feature uses |
| `PING_TIMEOUT_MS = 3_000` | Hardcoded module-level constant in `use-server-wakeup.ts` | Passed to `pingHealth()` as the `AbortController` timeout, for both the initial ping and every poll | No — not env-driven, would require a code change |
| `POLL_INTERVAL_MS = 5_000` | Hardcoded module-level constant in `use-server-wakeup.ts` | Delay before each retry while status is `'waking'` | No |
| `DEV_SIMULATE_SLEEP = false` | Hardcoded module-level constant in `use-server-wakeup.ts` | When flipped to `true`, forces every ping to be treated as failed, so the banner stays visible for manual testing. Comment explicitly says "Flip back before committing." | No — manual code edit, not a build-time env flag |
| Dismiss delay `2_500` ms | Inlined literal inside `server-wakeup-context.tsx`'s `useEffect` | How long the green "Server is ready" banner stays up before `dismissed` is set | No — not a named constant, not configurable |
| Backend dependency-cache TTL `30_000` ms | Inlined literal inside `health.controller.ts` | Caches the DB/Redis/GitHub-token sub-checks for 30s so `/health` doesn't hit Postgres/Redis on every single call | No — and irrelevant to the frontend, which never reads this |
| `FRONTEND_URL`, `NODE_ENV` | Server env vars, read in `main.ts` | Determine CORS `allowedOrigins` for **all** routes including `/health` — if misconfigured, the browser's health ping would be blocked by CORS and `pingHealth()` would report "down" even if the server is up | Yes, but it's an app-wide setting, not indicator-specific |
| `PORT` | Server env var, read in `main.ts` | Which port `/health` (and everything else) listens on | Yes, app-wide |

No feature flags gate this feature on or off — it always runs once `ServerWakeupProvider` is mounted.

---

## 9. Backend Interaction

- **Endpoint:** `GET /health` (no path prefix is set globally in `main.ts`, so this is the literal path)
- **HTTP method:** `GET`
- **Request headers sent by the frontend:** none beyond browser defaults — no `Authorization`, no custom headers. `cache: 'no-store'` is a `fetch` option, not a header override in the traditional sense (it sets `Cache-Control`/prevents the browser HTTP cache from serving a stale response).
- **Request body:** none
- **Response format:** JSON —
  ```json
  {
    "status": "ok" | "degraded",
    "database": "valid" | "invalid" | "unchecked",
    "databaseSchema": "valid" | "invalid" | "unchecked",
    "redis": "valid" | "invalid" | "unchecked",
    "redisStreams": "valid" | "invalid" | "unchecked",
    "githubToken": /* whatever GithubTokenHealth is (not shown to frontend) */
  }
  ```
  The frontend indicator **never parses this body** — it only checks the HTTP status via `res.ok`. Even a `200 OK` with `"status": "degraded"` inside the body is treated as "server is up" by this feature.
- **Expected status codes:** The controller has no explicit error responses coded — `check()` always returns a 200 with a body (NestJS default for a handler that doesn't throw), regardless of whether dependencies are healthy. The `degraded` distinction only lives inside the JSON payload, which this feature ignores.
- **Timeout behavior (client-side):** 3 seconds per attempt, enforced entirely on the frontend via `AbortController`; the backend itself has no request-level timeout logic for this route.
- **CORS requirements:** Governed by the app-wide `app.enableCors({ origin: allowedOrigins, credentials: true, allowedHeaders: [...] })` in `main.ts`. `allowedOrigins` is `[FRONTEND_URL]` in production or `[FRONTEND_URL, 'http://localhost:3000']` otherwise. There's no route-level override for `/health` — it inherits the global policy.
- **Authentication requirements:** None. `HealthController` has no guards applied, so `/health` is publicly reachable without a session or token.
- **Backend implementation:** Shown in full in §6.8. Internally it composes three sub-checks (Postgres via Prisma, Redis via `ioredis` ping + stream-command probe, and a cached GitHub-token validity flag from `GithubService`), cached for 30 seconds, and folds them into a single `degraded`/`ok` status — but again, this richer signal is invisible to the Server Wakeup feature, which only needs *any* 2xx response.

---

## 10. State Model

The only state type is `WakeupStatus = 'idle' | 'waking' | 'awake'`, defined in `use-server-wakeup.ts`. A fourth boolean, `dismissed`, lives alongside it in the context (not part of `WakeupStatus` itself, but functionally a fourth UI state).

| State | How entered | What it means | What the UI displays | What happens while in it |
|---|---|---|---|---|
| `idle` | Default initial value; also the **permanent** state if the very first ping succeeds within 3s | Either "haven't checked yet" or "server was already awake" — the code deliberately does not distinguish these for UI purposes | Nothing (`ServerWakeupBanner` returns `null`) | One ping in flight (initial mount only); no polling scheduled |
| `waking` | The initial ping fails or times out (>3s / network error / non-2xx) | Server is presumed asleep (Render cold start) | Amber strip: "Server is waking up" + spinning loader + live elapsed-time counter (`Ns` or `Mm Ss`) | Polls `/health` every 5s; `elapsedSec` ticks up every 1s via `setInterval` |
| `awake` | A poll issued while in `waking` succeeds | Server has come back up after being asleep | Green strip: "Server is ready" (no counter) | Polling stops permanently (`stopTimers()`); after 2.5s, `dismissed` flips to `true` (handled in the context provider, not the hook) |
| `dismissed = true` (context-level, not a `WakeupStatus` value) | 2.5s after entering `awake` | Confirmation has been shown long enough | Nothing (banner returns `null`) | No further pings of any kind — this is terminal for the mount's lifetime |

**Transition flow:**

```text
              ping succeeds (≤3s)
      ┌───────────────────────────────► [idle] (terminal — banner never shows)
      │
[mount] ── first ping
      │
      └── ping fails / times out ──► [waking] ──► poll every 5s
                                         │              │
                                         │  fails       │ succeeds
                                         └──────◄────────
                                                │
                                          stopTimers()
                                                ▼
                                            [awake] ── 2.5s later ──► dismissed=true ──► (banner hidden, terminal)
```

Important nuance preserved from the code: `idle → awake` is **not** a reachable transition. The green confirmation is only ever shown on *recovery* from `waking`, never on a same-session server that was healthy from the start — this is explicit in the source comment (`use-server-wakeup.ts`, inside `run()`).

---

## 11. UI Behavior

- **Appearance:** A full-width horizontal strip, not a toast/popup/modal — `w-full flex items-center justify-center gap-2.5`, `px-4 py-2`, `text-xs font-medium`, with a bottom border (`border-b`) and a 500ms color transition (`transition-colors duration-500`).
- **Text/messages:** Exactly two literal strings in the code: `"Server is waking up"` and `"Server is ready"`. No dynamic error messages are ever shown.
- **Status colors:** Amber (`bg-amber-950/60 border-amber-500/20 text-amber-300`, icon `text-amber-400`) while `waking`; green (`bg-green-950/60 border-green-500/20 text-green-300`, icon `text-green-400`) while `awake`.
- **Animations:** `Loader2` icon spins (`animate-spin`) only in the `waking` state; the color transition between states is a CSS transition, not a JS animation.
- **Loading states:** The `waking` amber strip *is* the loading state — accompanied by a monospaced (`tabular-nums`), live-updating elapsed-time readout (`formatElapsed`: `"Ns"` under 60s, `"Mm Ss"` at/above 60s).
- **Error states:** There is no distinct visual error state. A hard failure (e.g., server permanently down, CORS misconfigured, offline) looks identical to "still waking up" — the banner just stays amber and keeps counting up indefinitely, since there's no retry cap.
- **Visibility rules:** Hidden (`null`) when `dismissed` is `true` or `status === 'idle'`. Only visible during `waking` and for 2.5s during `awake`. Additionally, since the component is only rendered inside `AppHeader`, it never appears on pages that don't render `AppHeader` — that's the home page (`app/page.tsx`) and the login page (`app/login/page.tsx`); it does appear on `/review*`, `/history`, `/history/[reviewType]/[reviewId]`, `/account`, and `/standards`.
- **Placement:** Structurally a sibling immediately *after* the closing `</header>` tag (both inside the same `<>...</>` fragment returned by `AppHeader`), not nested inside the `<header>` element itself, despite the code comment describing it as "inside AppHeader."
- **Responsive behavior:** No responsive/breakpoint-specific classes at all — the same layout at every viewport width (it's a simple centered flex row that wraps naturally).
- **Interaction behavior:** None — no buttons, no manual dismiss/close control, no click handlers. Dismissal is purely time-based.
- **Accessibility behavior:** `role="status"` and `aria-live="polite"` on the outer `div`, so screen readers announce banner text changes without interrupting the user.

**Coupling assessment:** The color values, spacing scale, border/backdrop styling, and font sizing are all raw Tailwind utility classes tied to this app's design tokens (e.g., `app-bg` is a custom color name used elsewhere in the app). The *structure* (a live-region strip with an icon + message + optional counter, two named states, timed auto-dismiss) is conceptually reusable; the *exact visual styling* is not, without either keeping Tailwind + this token set or re-implementing the classNames in another styling system.

---

## 12. Timing and Request Behavior

| Behavior | Value | Source |
|---|---|---|
| Initial check | Fires immediately on `ServerWakeupProvider` mount (no delay) | `run()` called synchronously inside the `useEffect` body |
| Request timeout (per attempt) | 3,000 ms | `PING_TIMEOUT_MS`, applied to both the first ping and every subsequent poll |
| Retry delay / polling interval | 5,000 ms flat | `POLL_INTERVAL_MS` — no exponential backoff, no jitter |
| Backoff | None | Every `setTimeout(poll, POLL_INTERVAL_MS)` call uses the same fixed constant |
| Maximum retries | None — polls indefinitely until success or component unmount | No retry counter exists anywhere in the hook |
| Delay before showing the "waking" message | Equal to however long the *first* ping takes to fail/time out (up to 3s) — there's no separate reveal delay beyond that | Message shows the instant `status` becomes `'waking'`, which happens right after the first failed `pingHealth()` call resolves |
| Delay before hiding the indicator | 2,500 ms after entering `awake` | Hardcoded in `server-wakeup-context.tsx`'s `useEffect` |
| Elapsed-counter tick rate | 1,000 ms | `setInterval(..., 1_000)` inside `startElapsedCounter()` |
| Backend dependency-check cache | 30,000 ms | `health.controller.ts` — irrelevant to the frontend's own timing, since the frontend doesn't inspect the payload that this caches |

All of these are drawn directly from the source; none are assumed or inferred beyond what the constants and literals state.

---

## 13. Error Handling

Traced directly from `pingHealth()` and its callers — there is a single unified failure path; the following scenarios all converge on the same code behavior (`pingHealth()` resolving to `false`):

| Scenario | Actual behavior |
|---|---|
| Server unavailable (connection refused, DNS failure) | `fetch` rejects → caught by `catch { return false }` → treated as "not up" |
| Server takes too long (Render cold start, slow response) | `AbortController.abort()` fires after 3s → `fetch` rejects with an abort error → same `catch` → `false` |
| Request fails outright (network error mid-flight) | Same `catch` → `false` |
| Request returns a non-2xx status (e.g. 500, 503) | No exception — `res.ok` is `false` → `pingHealth` returns `false` directly (this is the one branch that doesn't go through `catch`) |
| Browser is offline | No explicit `navigator.onLine` check exists; an offline `fetch` simply rejects like any other network error → same `catch` → `false` |
| Backend returns an unexpected response shape | Irrelevant — the body is never parsed, so shape doesn't matter; only `res.ok` is read |
| Health endpoint cannot be reached due to CORS misconfiguration | The browser blocks the response from being read; `fetch` rejects → same `catch` → `false`. From the user's perspective this is indistinguishable from the server actually being down |

Because every failure mode collapses to the same boolean `false`, the only two visible outcomes to the user are "still waking up" (amber, indefinitely) or "ready" (green, briefly). There is no way, from the UI alone, to tell a genuinely dead backend apart from a slow-to-wake one, and no error message ever surfaces beyond the generic "waking up" text.

---

## 14. Integration Points

Real integration points, from the actual code:

```text
app/layout.tsx
 └── ServerWakeupProvider              (state: pings /health, owns idle/waking/awake + dismissed)
       └── SessionProvider
             └── WalletProvider
                   └── {children}      (every page in the app, incl. pages that never show the banner)

components/layout/app-header.tsx  (AppHeader — rendered on 5 of the app's routes, see below)
 └── <> fragment
       ├── <header>...</header>
       └── ServerWakeupBanner          (UI: reads context set up above, via useWakeupContext())
```

`AppHeader` (and therefore the visible banner) is imported and rendered by:
- `components/review/review-page-client.tsx` (used by `/review`, `/review/[reviewType]`, `/review/[reviewType]/[reviewId]`)
- `app/history/page.tsx`
- `app/history/[reviewType]/[reviewId]/page.tsx`
- `app/account/page.tsx`
- `app/standards/page.tsx`

Not rendered on `app/page.tsx` (home) or `app/login/page.tsx` — the state (`ServerWakeupProvider`) is still running there (it's global via the root layout), but there is nowhere for it to render, so the ping still happens silently on those pages with no visible effect.

**What would need to be removed from the host app to extract this feature:**
1. The `<ServerWakeupProvider>` wrapper in `app/layout.tsx` (2 lines: the opening/closing tags, plus its import).
2. The `<ServerWakeupBanner />` line and its import in `app-header.tsx` (2 lines).
3. The three feature files themselves (`use-server-wakeup.ts`, `server-wakeup-context.tsx`, `server-wakeup-banner.tsx`).
4. Nothing needs to change on the backend to remove the frontend feature — `health.controller.ts` is generic infrastructure likely used/wanted independent of this indicator.

---

## 15. Dependency Graph

```text
ServerWakeupBanner (components/ui/server-wakeup-banner.tsx)
        │
        ├── useWakeupContext ──► ServerWakeupProvider (lib/server-wakeup-context.tsx)
        │                              │
        │                              └── useServerWakeup (lib/use-server-wakeup.ts)
        │                                        │
        │                                        └── API_URL (lib/api.ts)
        │                                                  │
        │                                                  └── process.env.NEXT_PUBLIC_API_URL
        │
        ├── cn (lib/utils.ts)  [clsx + tailwind-merge]
        │
        └── lucide-react icons (CloudOff, CheckCircle, Loader2)

Mount points:
  app/layout.tsx ──renders──► ServerWakeupProvider
  components/layout/app-header.tsx ──renders──► ServerWakeupBanner

Network target (external to the frontend dependency tree):
  fetch(`${API_URL}/health`) ──► apps/server/src/health.controller.ts
                                        │
                                        ├── GithubService.getTokenHealth()
                                        ├── PrismaService.$queryRaw(...)
                                        └── RedisService.checkConnection() / checkStreams()
```

---

## 16. Feature Boundary

| Current code | Feature | Application-specific | Reason |
|---|---|---|---|
| `useServerWakeup` state machine (`use-server-wakeup.ts`) | ✓ | | Pure logic, no app-specific imports besides the `API_URL` string |
| `ServerWakeupProvider` / `useWakeupContext` (`server-wakeup-context.tsx`) | ✓ | | Generic React Context wiring + a timed dismiss; nothing app-specific |
| `ServerWakeupBanner` component structure (JSX shape, conditional rendering, `role`/`aria-live`) | ✓ | | The *behavior* (what renders when) is feature logic |
| `WakeupStatus` type | ✓ | | Small, self-contained, feature-owned |
| Banner's Tailwind classNames / color values | | ✓ | Tied to this app's Tailwind config and design tokens (`app-bg`, the specific amber/green shades) |
| `cn()` utility | ? | ? | Reusable in spirit (any `clsx`-style merge works), but as imported it's this app's shared helper, not feature-owned |
| `lucide-react` icon choice | ? | ? | The *concept* of an icon per state is feature-relevant; the specific icon library is an app-wide dependency choice |
| `API_URL` constant / `NEXT_PUBLIC_API_URL` env var | ✓ (the pattern) | ✓ (the specific var name/mechanism) | A reusable version needs *some* configurable base URL; this exact env-var name and Next.js `process.env` convention is app-specific |
| `AppHeader` component (everything besides the one `<ServerWakeupBanner />` line) | | ✓ | Nav links, session/wallet UI, mobile menu — unrelated to the indicator |
| `app/layout.tsx` (everything besides the `<ServerWakeupProvider>` wrapper) | | ✓ | Fonts, `SessionProvider`, `WalletProvider`, global CSS |
| `health.controller.ts`'s `/health` route existing at all, returning 2xx when reachable | ✓ (the contract) | | A reusable indicator needs *a* health endpoint; this exact one satisfies the contract |
| `health.controller.ts`'s internal dependency checks (DB/Redis/GitHub-token, `degraded` payload) | | ✓ | Entirely this app's infrastructure; the frontend indicator ignores it |
| NestJS `@Controller`/`@Get` decorators, module registration | | ✓ | Framework-specific; only the "GET endpoint returns 2xx" contract matters to the indicator |
| CORS configuration in `main.ts` | | ✓ | App-wide policy that happens to also gate `/health`; not feature-owned, but a real-world prerequisite for the ping to succeed cross-origin |

---

## 17. Extraction Map

*(Extraction map only, as requested — no implementation performed.)*

```text
Current App (code-review-agent)
    ↓
Feature-related files
    lib/use-server-wakeup.ts, lib/server-wakeup-context.tsx, components/ui/server-wakeup-banner.tsx
    ↓
Core logic  [reusable as-is]
    The idle/waking/awake state machine, the pingHealth() fetch+AbortController pattern,
    the flat-interval polling, and the timed auto-dismiss are all framework-agnostic React
    and would lift out with only the API_URL import swapped for a prop/parameter.
    ↓
Reusable UI  [reusable with small adaptation]
    The banner's JSX shape (icon + message + optional counter, role="status"/aria-live) and its
    two-state design are portable; the literal Tailwind classNames would need to become either
    (a) configurable/themeable classNames, or (b) ship with their own minimal CSS, or (c) require
    the consuming app to already use Tailwind with compatible tokens.
    ↓
Application adapter  [what a host app must supply]
    - A base URL / health-endpoint URL (today: NEXT_PUBLIC_API_URL + "/health")
    - A mount point for the provider (today: root layout)
    - A mount point for the visible banner (today: inside AppHeader)
    - A backend route that returns 2xx when up (today: NestJS HealthController) — framework-agnostic
      requirement, any backend works as long as it answers GET with 2xx and honors CORS from the caller's origin
```

**Marked by category:**
- **Reusable as-is:** `WakeupStatus` type; the `pingHealth()` timeout/abort pattern; the idle→waking→awake transition logic; the flat 5s poll / 3s timeout / 2.5s dismiss timing constants (as defaults).
- **Reusable with small adaptation:** the Context+Provider wiring (would need to accept a `healthUrl` prop instead of importing `API_URL` directly); the banner's structural JSX (would need theming or class-prop injection instead of hardcoded Tailwind classes).
- **Tightly coupled:** the exact Tailwind color/spacing classes; the `app-bg` design token; the `'use client'` Next.js directive (trivial to keep or drop, but it is Next-specific syntax).
- **Application-specific:** everything in `AppHeader` besides the one mount line; everything in `app/layout.tsx` besides the provider wrapper; the backend's internal DB/Redis/GitHub-token health composition (the indicator only needs the *outer* 2xx contract, not this internal richness).
- **Unclear / requires further investigation:** see §19 below.

---

## 18. Tightly Coupled to the Application

1. **Tailwind utility classes and design tokens** in `server-wakeup-banner.tsx` (`app-bg`, specific `amber-950`/`green-950` opacity values) — a drop-in reusable package would need to either ship Tailwind-agnostic styles or expose a theming/className API.
2. **`cn()` from `lib/utils.ts`** — a thin wrapper around `clsx`/`tailwind-merge` specific to this codebase's conventions.
3. **`lucide-react`** as the icon source — not required by the logic, but currently hardwired into the component rather than accepted as a prop.
4. **`API_URL` import from `lib/api.ts`** — the hook reaches directly into this app's shared config module rather than accepting a URL as a parameter; extracting the hook as-is would require either keeping this import path or refactoring to accept `healthUrl` as an argument (a refactor, which is explicitly out of scope for this dossier).
5. **Mount locations** (`app/layout.tsx`, `app-header.tsx`) are specific to this app's routing/layout structure and are not part of the feature's own files.
6. **CORS policy** in `main.ts` is a prerequisite for the ping to succeed at all in a browser context, but lives entirely outside the four feature files.

---

## 19. Unclear or Requiring Further Investigation

1. **Documentation/code discrepancy:** `docs/frontend.md` (lines 196–198) describes the recovered state as "a recovery toast confirms when it becomes healthy." The actual code has no toast component or toast library involved anywhere in this feature — the "confirmation" is the same inline banner strip switching to green, not a separate toast notification. Worth flagging before this doc is used as a spec for the reusable package.
2. **No re-sleep detection:** once `status` reaches `'awake'`, polling stops permanently for that mount's lifetime (root layout, so effectively the whole browser session). If Render puts the server back to sleep during a long session, the indicator will not detect or report it again. Whether this is intended behavior or a gap wasn't stated anywhere in code comments — it's presented here as observed fact, not a recommendation to change it.
3. **`res.ok`-only check ignores the richer `/health` payload:** the backend computes a detailed `degraded` vs `ok` status across DB/Redis/GitHub-token, but the frontend indicator treats any 2xx (including a `200` body with `"status": "degraded"`) as fully "up." Whether a future reusable version should surface `degraded` states is a design question, not something the current implementation answers.
4. **No dedicated types/constants/styles files:** unlike a "typical" larger feature, this one keeps its type (`WakeupStatus`), its timing constants, and its styling all inline in the same three files. For extraction purposes this means there's no existing seam to split at — that split would be new work, not something already present in the app.
5. **`DEV_SIMULATE_SLEEP`** is a hand-toggled boolean with a code-comment warning to flip it back before committing — i.e., a manual dev-only override, not a build-mode/env-based flag. Whether the reusable package should formalize this as a proper dev-mode prop is a design question outside this dossier's scope.

---

*End of dossier. This document describes the implementation exactly as found in `Kashif-Rezwi/code-review-agent` at the time of inspection — no source files were modified, refactored, or reorganized in the process of producing it.*
