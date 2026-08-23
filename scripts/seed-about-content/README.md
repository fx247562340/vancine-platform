# Vancine v1.2.0 — Local About Content Seeder

This directory holds the v1.2.0 About content deliverable for local
development verification of the public `/about` page. It is a
**version-controlled local config**: the JSON is the exact content the
About page will render on a real local backend, and the shell script is
the only sanctioned way to write it to the local database.

The page itself remains driven by `GET /api/about` (existing
`controller.GetAbout`), which already supports the localized JSON shape,
legacy plain Markdown / HTML / URL strings, and the deterministic
fallback chain `zh-TW → zh-CN → en` / `zh-CN → en` / `other → en → zh-CN`.
The seeder just makes the v1.2.0 copy land in the right key.

## Why this exists

The About page is content-driven: it must stay decoupled from the
upstream `new-api` renderer so we can keep editing the Vancine copy
without forking the renderer. For local verification we need a
reproducible way to make the page show the v1.2.0 copy across both
languages without:

- hardcoding the content into the About component (would defeat the
  decoupling), and
- paying for or depending on a hosted /api/about mock service.

A real local backend running on the same machine (SQLite, no external
services) is the smallest configuration that exercises the actual code
path the production site will run.

## Files

| File | Purpose |
| --- | --- |
| `seeds.json` | The localized About copy. Two top-level keys: `zh-CN` and `en`. Loaded by the script, sent verbatim to `PUT /api/option` as the `value` field, and used as the expected value for the readback comparison. |
| `seed.sh` | The only sanctioned writer. Logs in as the root user, PUTs the JSON to `/api/option`, then GETs `/api/about` once with `Accept-Language: en` and once with `Accept-Language: zh-CN`, and verifies the readback matches `seeds.json` character-for-character. The script does not call `mktemp(1)`, does not register an `EXIT` trap, and does not run `rm` for any reason. The login JSON and the option JSON are streamed from Python's stdout into `curl --data-binary @-`; the access token is sent via a `<(printf ...)` process substitution so it never appears on a command line. |

## Local procedure (one-time per fresh DB)

This procedure works from a clean workspace. It does not assume a
running dev server, an existing dist, an old SQLite file, or a leftover
Docker container. It depends on the build artifacts being produced
in-step:

1. `web/node_modules/` must be installed once before the first dev or
   build, so `bun install` runs against the committed `package.json` and
   `bun.lock` (or `package-lock.json`).
2. `web/dist/` (the rsbuild production output) must be produced before
   the Go backend binary, because the Go server's embedded assets
   pipeline references the build output. Run `bun run build` inside
   `web/` first; then return to the repo root for the Go build.

Ports 3000 and 3001 are kept free so the dev server and the local
backend do not collide with the production-like services that may
also be running locally.

> **Important — the password lives inside one shell.** `export
> SETUP_PASSWORD` does **not** propagate into a separate terminal
> window. Each terminal is a separate process tree with its own
> environment; an `export` in one terminal only marks the variable
> for child processes of that terminal, not for any other terminal
> that is already running. The flow below therefore runs setup and
> seed inside the **same** terminal as the password generator, so
> `SETUP_PASSWORD` is in scope the whole time.

### Terminal 1 — build the artifacts and start the backend in the foreground

```bash
# 1. Install frontend dependencies once. Uses the committed lock file
#    so the install is reproducible.
cd <repo>/web
bun install

# 2. Build the frontend so the Go backend can pick up the assets.
bun run build

# 3. Return to the repo root and build the Go backend.
cd ..
go build -o /tmp/vancine-backend ./

# 4. Start the local backend on port 3000 in the foreground.
#    SQLite + no Redis is enough for a one-off local About verification.
#    Press Ctrl-C in this terminal to stop the backend when you are
#    done with the verification — every command in this README that
#    touches the backend is run from a different terminal, and the
#    backend must stay up until the seeder finishes.
SQLITE_PATH=/tmp/vancine-local.db REDIS_CONN_STRING= \
PORT=3000 /tmp/vancine-backend
```

### Terminal 2 — generate the password, init the root user, and run the seeder

```bash
# 5. Enable pipefail so that any stage in the upcoming pipelines
#    that fails (Python, curl, JSON parse) propagates the failure
#    instead of silently appearing to succeed. This shell-local
#    setting does not affect Terminal 1.
set -o pipefail

# 6. Generate a strong random root password for this one-time local
#    SQLite verification. The backend binds 0.0.0.0 / :: by default,
#    so even a throwaway local database must not be initialised with
#    a fixed or weak password — a future dev session on the same
#    host could race the throwaway database and pick up the
#    credentials. Use Python `secrets` so the password is
#    unguessable and never appears in the shell history. The
#    variable is a regular shell variable in this terminal; it is
#    NOT exported to the parent shell and is NOT visible to
#    Terminal 1.
SETUP_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
# Do not echo $SETUP_PASSWORD after this point.

# 7. Initialise the root user once (the /api/setup endpoint is only
#    enabled when the system is uninitialized). The password is piped
#    into Python's stdin, Python assembles the setup JSON, and curl
#    reads the body from stdin via `--data-binary @-`. The password
#    and the JSON body never appear on any command line, in any
#    argv, in any temp file, or in the shell history. The curl call
#    also passes `--noproxy '*'`, so even if the caller has set
#    http_proxy / https_proxy / HTTP_PROXY / HTTPS_PROXY /
#    all_proxy / ALL_PROXY, the request goes directly to the
#    loopback target and never traverses an external proxy.
printf '%s' "$SETUP_PASSWORD" \
  | python3 -c '
import json
import sys
pwd = sys.stdin.read()
print(json.dumps({"username": "root", "password": pwd, "confirmPassword": pwd}, ensure_ascii=False))
' \
  | curl --noproxy '*' -fsS -X POST http://localhost:3000/api/setup \
      -H 'Content-Type: application/json' \
      --data-binary @-

# 8. Seed the v1.2.0 About content. The script logs in, PUTs the
#    JSON to /api/option, and then GETs /api/about twice — once
#    with Accept-Language: en and once with Accept-Language:
#    zh-CN — verifying each readback character-for-character
#    against seeds.json. VANCINE_ROOT_PASSWORD is required and
#    the script unconditionally rejects non-loopback targets.
#    The script's own login/PUT/GET calls also pass `--noproxy '*'`,
#    and the bodies are streamed from Python's stdout through
#    `curl --data-binary @-` so the password, the access token,
#    and the About body never land in a temp file or a
#    process-list argv.
VANCINE_BACKEND_BASE=http://localhost:3000 \
  VANCINE_ROOT_PASSWORD="$SETUP_PASSWORD" \
  scripts/seed-about-content/seed.sh

# 9. Clear the in-process variables so the password does not leak
#    into subsequent commands in this terminal. This is local
#    hygiene only — the password is not exported to the parent
#    shell, so Terminal 1 has no copy to clear.
unset SETUP_PASSWORD VANCINE_ROOT_PASSWORD
```

### Terminal 3 — start the frontend dev server

```bash
# 10. In a third terminal, start the frontend dev server on port
#     3001, pointing it at the backend on 3000. This is the only
#     place the dev server URL is configured for the local About
#     verification. Press Ctrl-C in this terminal to stop the
#     dev server.
cd <repo>/web
VITE_REACT_APP_SERVER_URL=http://localhost:3000 \
  bun run dev -- --port 3001
# Visit http://localhost:3001/about and switch languages in the
# public header. Both zh-CN and en must show the v1.2.0 copy.
```

When the verification is done, stop each foreground process with
Ctrl-C in its own terminal. The throwaway SQLite file under `/tmp`
and the temporary backend binary are not removed automatically — the
README does not prescribe `rm` or `pkill` lines, because deleting
files requires explicit approval from the project lead, and the
`/tmp` paths are outside the repository so they do not pollute the
worktree.

## Environment variables the script honours

| Var | Default | Notes |
| --- | --- | --- |
| `VANCINE_BACKEND_BASE` | `http://localhost:3000` | Backend base URL. The script unconditionally rejects any host that is not the literal `localhost` (case-insensitive) or an IP literal for which Python `ipaddress.IPv4Address.is_loopback` / `IPv6Address.is_loopback` returns true. There is no DNS resolution, no override environment variable, and no fallback path. URLs that carry any `@` in the netloc (including an empty userinfo segment like `http://@localhost:3000`), any `?` or `#` in the raw URL (including a bare `?` or `#` with no body), or a non-root path are also rejected. |
| `VANCINE_ROOT_USER` | `root` | Root user name. |
| `VANCINE_ROOT_PASSWORD` | **(required)** | The root user password. There is no default. The script aborts with exit code 64 if the variable is unset or empty. The recommended source is `python3 -c 'import secrets; print(secrets.token_urlsafe(32))'`. The variable is read from the same shell that runs the seeder; `export` does not propagate it to other terminals. |

## Safety

- **Local-only, one-time**: this script is for a throwaway local
  SQLite database under `/tmp`. It is not a production write shortcut
  and is not wired into any deployment automation. The README never
  recommends running it against a public host.
- **No default password**: `VANCINE_ROOT_PASSWORD` is required. The
  script aborts with exit code 64 if the variable is unset or empty.
  The README explicitly generates a strong random password with
  Python `secrets` instead of using a fixed string. The backend
  binds all local interfaces (`0.0.0.0` / `::` by default), so a
  fixed or weak password would be exposed to anything else on the
  same host — a future dev session, a CI runner, or a misconfigured
  port-forwarding rule. Random passwords close that hole.
- **Unconditional loopback**: the script parses the host with Python
  `urllib.parse` and then validates it with Python `ipaddress`. The
  literal `localhost` is accepted; any other host is accepted only
  if it parses as an IP literal for which `is_loopback` returns
  true. There is no `socket.getaddrinfo` fallback: any name that is
  not an IP literal is rejected. This rules out public DNS names,
  internal RFC1918 ranges, IPv6 ULA, link-local addresses, and
  crafted names like `127.attacker.example`, `lvh.me`, or
  `localtest.me` (each of which DNS-resolves to a non-loopback
  address and would otherwise be silently accepted). The loopback
  check is also strict on URL structure: any `@` in the netloc
  (including the empty-userinfo form `http://@host`), any `?` in
  the raw URL (including a bare `?` with no query body), any `#`
  in the raw URL (including a bare `#` with no fragment body), and
  any non-root path are all rejected. There is no override
  environment variable. The only exit codes for the loopback gate
  are 67 (rejected) or 0 (accepted); the rejection always happens
  before the login.
- **All curl calls bypass proxies**: every `curl` invocation in
  this script and in the README's setup command passes
  `--noproxy '*'`. Even if the caller has set `http_proxy` /
  `https_proxy` / `HTTP_PROXY` / `HTTPS_PROXY` / `all_proxy` /
  `ALL_PROXY` in the environment, the script bypasses every proxy
  and connects directly to the loopback target. The root password,
  the access token, and the About body therefore never traverse an
  external proxy.
- **No sensitive temp files, no rm**: the script does not call
  `mktemp(1)` and does not register an `EXIT` trap. The login JSON
  and the option JSON are streamed from Python's stdout into
  `curl --data-binary @-`, so the password and the About body
  never land on disk in a temp file. The Authorization header
  (which carries the access token) is built by a short-lived
  `<(printf ...)` process substitution, so the token never appears
  on the curl command line. The script does not call `rm` for any
  reason — there is no temp file to clean up and no other reason
  to invoke it. The README's procedure likewise does not call
  `rm` or `pkill`; cleanup of `/tmp` artefacts is the project
  lead's decision and must be done out-of-band.
- **No printf-credential concatenation in argv**: the password,
  the access token, and the About body are never passed to a
  child process as a command-line argument. They travel as stdin
  payloads (for bodies) or as content of an ephemeral
  process-substitution file descriptor (for the Authorization
  header). The shell history of these commands therefore contains
  no sensitive content.
- **Single-key write**: the script only PUTs to the `/api/option`
  key `About`. It does not touch the local SQLite file, the root
  user record, the session token, or any frontend state.
- **PUT success verified**: the script captures the PUT response,
  parses it as JSON, and requires `success === true`. A 200 with
  `success !== true` is treated as a failed seed.
- **Readback comparison is character-for-character**: the script
  GETs `/api/about` once with `Accept-Language: en` and once with
  `Accept-Language: zh-CN` — no more, no fewer requests — and
  compares the resulting `data` fields against the corresponding
  keys in `seeds.json` byte-by-byte. The script does not just check
  that the body is non-empty; it requires the readback to match the
  seed exactly. The final sample printed to stdout reuses the
  already-verified zh-CN readback body; no second GET is issued.

## When to refresh this file

Refresh the JSON any time the About page copy changes. The script can
be re-run at any time — `PUT /api/option` upserts the value, so a
re-seed overwrites the prior value cleanly. The throwaway SQLite
file under `/tmp` is the recommended reset path between unrelated
experiments; deleting the file is a manual action that requires
explicit approval from the project lead.
