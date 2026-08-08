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
