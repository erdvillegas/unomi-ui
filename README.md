# Unomi UI

An **open source** user interface for [Apache Unomi](https://unomi.apache.org/), the
customer data platform (CDP). It talks to the Unomi REST API to manage profiles,
segments, rules, scoring, events and more — built with **OpenUI5 + TypeScript**.

The goal is a community-driven admin UI for Unomi: no official one exists, so this
project aims to give the community a solid, modern starting point.

## Quick start

```bash
npm install
npm start          # dev server on :8080, proxies /cxs to Unomi at :8181
```

Requires a running Apache Unomi (default `http://localhost:8181/cxs`, Basic auth
`karaf`/`karaf`). See [`docs/plan.md`](docs/plan.md) for scope and design decisions.

- `npm run build` — production bundle to `dist/`
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — headless test suite (karma + QUnit/OPA5)

## Authentication & session

This is a **client-only** app: it talks HTTP Basic straight to Unomi (`karaf`/`karaf`
by default). There is no backend of ours to mint tokens or set cookies, so the browser
must build the `Authorization: Basic …` header itself.

- **Where the credential lives:** the Basic header is kept in **`sessionStorage`**, not
  `localStorage`. It survives a page reload (so an F5 doesn't force a re-login) but is
  **scoped to the tab and cleared when the tab closes** — it never persists to disk
  across browser sessions. Logout removes it immediately.
- **Threat model:** the real risk in a client-only SPA is XSS. `sessionStorage` is no
  weaker here than holding the credential in a JS variable — if an attacker runs script
  in the page, the game is already lost either way. `sessionStorage` is chosen purely
  so a reload keeps you logged in without widening exposure to disk.
- **Why not `httpOnly` cookies:** an `httpOnly` cookie can only be set by a server and,
  by design, is unreadable by JS — but a client-only SPA *must* read the secret to send
  the Basic header, so `httpOnly` cannot apply without a server component.

### Production hardening (reverse proxy)

For a real deployment, keep the credential out of the browser entirely by putting a
**reverse proxy** (Caddy / nginx + [oauth2-proxy](https://oauth2-proxy.github.io/))
in front, on the **same origin** as the SPA:

1. The proxy serves `dist/` and forwards `/cxs/*` to Unomi.
2. It authenticates the **user** (its own gate or SSO/OIDC) and issues an
   `HttpOnly; Secure; SameSite=Strict` session cookie.
3. On each `/cxs/*` request it **injects the Unomi Basic header upstream**, so the
   browser never sees it.

On the client side this only means: send requests with `credentials: "include"`, drop
the Basic/`sessionStorage` handling, and treat a `401` as "session expired → re-auth".
Gate this behind an `authMode` flag so dev keeps using Basic + the dev proxy. This also
removes CORS, since the SPA and `/cxs` share one origin. See
[`docs/plan.md`](docs/plan.md) for the fuller topology.

## Contributing

Ideas, bug reports and pull requests are very welcome — this is a community effort.

- **Have an idea or suggestion?** Open a [GitHub Issue](../../issues) or start a
  [Discussion](../../discussions).
- **Want to contribute code?** Fork the repo, create a branch, and open a pull request.
  Keep changes focused and run `npm run typecheck` + `npm test` before submitting.

Please be respectful and follow the
[Contributor Covenant](https://www.contributor-covenant.org/) code of conduct in all
interactions.

## License

Licensed under the [Apache License 2.0](LICENSE), matching Apache Unomi.
