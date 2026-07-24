# Local Development Guide (جاكوم / Jackom)

This guide is written for founders who are still learning — it assumes no prior Docker, Redis, or
networking experience. If something here doesn't work, see "Common errors" near the bottom before
asking for help.

The project lives at **`D:\projects\jackom`**. Everything in this guide assumes you're working from
there — do not move or copy the project to `C:`.

## 1. Required software

- **Node.js 20 or newer** (Node 22/24 both work). Check with `node --version` in a terminal.
- **Git** (you already have this if you can see this file).
- **Redis**, one of:
  - **Docker Desktop** (easiest — this repo includes a ready-to-use Redis setup for it), **or**
  - A Redis server installed some other way, reachable at `redis://127.0.0.1:6379` (or wherever you
    point `REDIS_URL`, see below).
- **Visual Studio Code** (recommended, not required).

You do **not** need PostgreSQL, AWS, or any payment/authentication provider — none of that exists
in the project yet.

## 2. Open the project in VS Code

1. Open VS Code.
2. `File → Open Folder…` → select `D:\projects\jackom`.
3. Open the integrated terminal: `` Ctrl+` `` (or `Terminal → New Terminal`).

Every command below is run from that terminal, from the project root (`D:\projects\jackom`) unless
a step says otherwise.

## 3. Install dependencies

This project has **two separate `node_modules` folders** (this is intentional — see
`IMPLEMENTATION_PROGRESS.md`'s Step 6 notes if you're curious why): one at the project root, one
inside `apps/web`. Install both:

```
npm install
npm install --prefix apps/web
```

This can take a minute or two the first time.

## 4. Start Redis

Jackom stores room/session data in Redis. Pick ONE of these:

### Option A — Docker (recommended if you have Docker Desktop installed)

```
npm run dev:redis
```

This starts a small, local-only Redis container (see `docker-compose.dev.yml`) — it only listens on
your own machine (`127.0.0.1`), is never reachable from the internet, and stores no password or
secret. To stop it later:

```
npm run dev:redis:stop
```

Your data stays in a Docker-managed volume between restarts (until you explicitly remove it).

### Option B — A Redis you already have running

If you already have Redis running some other way (a native Windows build, WSL, a remote dev Redis,
etc.), just make sure it's reachable and skip `npm run dev:redis` entirely. If it's not at the
default `redis://127.0.0.1:6379`, set `REDIS_URL` in `apps/server/.env` (see next step) to wherever
it actually is.

**Jackom does not run without Redis.** If Redis isn't reachable, `npm run dev` will fail with a
clear message telling you so — it will never silently pretend everything's fine by using a fake,
in-memory substitute (that fallback exists only inside the automated test suite, never here).

## 5. Create your local `.env` files

Two example files are included — copy them:

```
copy apps\server\.env.example apps\server\.env
copy apps\web\.env.example apps\web\.env.local
```

(On macOS/Linux/WSL, use `cp` instead of `copy`.)

Open both copies and check the values make sense for your machine. The defaults already match each
other (frontend on port 3000, HTTP API on 4000, WebSocket gateway on 4001) — you usually don't need
to change anything to get started.

**Never commit `apps/server/.env` or `apps/web/.env.local`** — `.gitignore` already protects them,
but don't work around that.

## 6. Start everything — the one command

```
npm run dev
```

This starts, together, in one terminal:

- The Next.js frontend (hot-reloading)
- The HTTP room API
- The WebSocket gateway
- The server-owned phase timer service
- A connection to Redis

If Redis isn't reachable, or a port is already in use, you'll see a clear, specific error instead of
a silent half-broken startup. Press `Ctrl+C` once to stop everything together, cleanly.

### The VS Code task (equivalent to the command above)

`Ctrl+Shift+P` → `Tasks: Run Task` → **Start Jackom Development**. This runs the exact same
`npm run dev` command, in a dedicated terminal panel inside VS Code. Other available tasks (same
menu):

- **Start Frontend Only** / **Start Server Only** — for when you only need one half running.
- **Run All Checks** — typecheck, environment/Redis diagnostics, the full test suite, and lint. No
  servers are started.
- **Start Development Redis** / **Stop Development Redis** — the Docker Redis from step 4.

## 7. Open the frontend

Once `npm run dev` prints "Jackom local development is ready", open:

**http://localhost:3000**

## 8. Test it with a host and a "phone" (two browser windows)

1. In the first browser window/tab, go to `http://localhost:3000` and create a room (this opens the
   TV/host lobby with a real room code and a real QR code).
2. Open a **second, separate browser context** — a private/incognito window, or a different
   browser — so it doesn't share the first window's session storage. Go to
   `http://localhost:3000/join`, enter the room code shown on the TV screen, and pick a display name.
3. Watch the TV screen: the new player should appear live, with a "متصل" (connected) status, within
   a second or two — no refresh needed.
4. Close the player's tab, wait a moment, and reopen `http://localhost:3000/join/<room code>` — you
   should rejoin as the SAME player (not a duplicate), and the TV should show them reconnected.
5. Back on the TV, once there are enough players, click "ابدأ اللعبة" (start the game). The TV and
   player screens should both move to a simple "بدأت اللعبة" placeholder screen — role reveal and
   real gameplay screens don't exist yet (a later development step).

## 9. Stop everything

In the terminal running `npm run dev`, press `Ctrl+C` once. Give it a couple of seconds to shut down
cleanly (it closes the HTTP API, the WebSocket gateway — including every open player connection —
and the Redis connection, in that order). If you started Redis via Docker, it keeps running in the
background until you explicitly stop it with `npm run dev:redis:stop` (this is intentional — you
don't need to restart Redis every time you restart the app).

## 10. Local URLs (defaults)

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| HTTP room API | http://localhost:4000 |
| WebSocket gateway | ws://localhost:4001 |
| Health check | http://localhost:4000/health |
| Redis | redis://127.0.0.1:6379 |

Change any of these by editing `apps/server/.env` (and the matching `NEXT_PUBLIC_*` value in
`apps/web/.env.local`, so the frontend still points at the right place).

## 11. Hot reload — what to expect

- **Frontend** (`apps/web`): editing any file under `apps/web` updates the browser automatically —
  standard Next.js behavior, nothing Jackom-specific here.
- **Server** (`apps/server`): editing any `.ts` file restarts the ENTIRE server process
  automatically (HTTP API + WebSocket gateway + timer service all together). This is a full, clean
  restart — not a partial hot-swap — which is intentional: it's what guarantees you never end up
  with two overlapping WebSocket listeners or two timer services after an edit. Anyone connected via
  WebSocket at that moment will see a brief disconnect and should reconnect automatically (the
  frontend's realtime client already handles this — see `IMPLEMENTATION_PROGRESS.md`'s Step 7B
  section).

## 12. Debugging the server in VS Code (optional)

Run `npm run dev:server:debug` instead of the normal server script (this adds Node's `--inspect`
flag), then in VS Code go to the "Run and Debug" panel and start **Attach to Jackom Server**. Set
breakpoints in any `apps/server/src/**/*.ts` file as usual.

## 13. Common errors

### "Could not connect to Redis at redis://…"

Redis isn't reachable. Either start it (`npm run dev:redis` if you're using Docker), or check that
`REDIS_URL` in `apps/server/.env` actually points at wherever your Redis really is. The server side
stays open (waiting for a file change) rather than repeatedly retrying on its own — once Redis is
up, stop `npm run dev` with `Ctrl+C` and run it again, rather than waiting for it to reconnect by
itself.

### "…could not bind to port XXXX — it's already in use"

Something else on your machine is already using that port — often a Jackom server from a previous
run that didn't fully shut down, or another app entirely. Either close whatever's using it, or change
`HTTP_API_PORT`/`WS_GATEWAY_PORT` in `apps/server/.env` (and the matching `NEXT_PUBLIC_*` URL in
`apps/web/.env.local`) to a free port.

### The frontend loads, but the TV screen says "تعذر الاتصال بالخادم" (connection failed)

Almost always one of: the server half of `npm run dev` isn't actually running (check the terminal
for a server error above the frontend's own output), or `apps/web/.env.local`'s
`NEXT_PUBLIC_WS_URL`/`NEXT_PUBLIC_API_URL` don't match the ports the server actually started on.

### `npm install` fails with `ENOSPC` or other out-of-space errors

See the C: drive note directly below — this is almost always a full `C:` drive, not a real problem
with the project.

## 14. A note about the C: drive

This machine's `C:` drive has previously run nearly full. Jackom itself does not need `C:` for
anything — `npm run dev`, `npm install`, and the test suite are all configured to keep their
temporary files and caches on `D:`, inside the project, in three small generated folders:

- `D:\projects\jackom\.tmp` (redirected `TEMP`/`TMP`)
- `D:\projects\jackom\.npm-cache` (redirected `npm_config_cache`)
- `D:\projects\jackom\.logs` (reserved for future dev-script logging)

These are created automatically the first time you run `npm run dev` or `npm run dev:check`, and are
already excluded from git (`.gitignore`). Being honest about the limits of this: Windows itself, VS
Code, and some other unrelated tools may still use a small amount of `C:` space for their own
normal operation — that's outside this project's control. What Jackom's own tooling redirects is its
own temporary/cache files specifically.

If you ever run a plain `npm install`/`npm test` command yourself (outside the scripts above) and
hit an out-of-space error, redirect it the same way:

```
set TEMP=D:\projects\jackom\.tmp
set TMP=D:\projects\jackom\.tmp
set npm_config_cache=D:\projects\jackom\.npm-cache
npm install
```

(That's Windows `cmd.exe` syntax — in PowerShell use `$env:TEMP = "D:\projects\jackom\.tmp"` etc.
instead.)

## 15. What this step does NOT include

No role reveal, gameplay screens, real mini-games, voting UI, results UI, multi-game registry,
PostgreSQL, authentication accounts, payments, or production deployment exist yet — this guide only
covers running what already exists (the lobby, through Development Step 7B) locally. See
`IMPLEMENTATION_PROGRESS.md` for what's actually implemented and what's next.
