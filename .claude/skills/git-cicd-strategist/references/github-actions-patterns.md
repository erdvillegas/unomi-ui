# Patrones de GitHub Actions para repo único con Git Flow

## Estructura de workflows recomendada

```
.github/workflows/
├── ci.yml          # lint + test + build en cada push/PR a develop y main
└── release.yml     # versionamiento + changelog + release solo al mergear a main
```

## `ci.yml` — Integración continua

Corre en PRs y pushes hacia `develop` y `main` (cubre merges de `feature/*`, `release/*`, `hotfix/*`, `bugfix/*`):

```yaml
name: CI

on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop, main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
```

Ajustar `setup-node`/`npm` por el stack real del proyecto (Python → `setup-python` + `pip`, etc.) — pedir al usuario el stack si no se conoce.

## `release.yml` — Versionamiento automático (solo en `main`)

Solo se dispara cuando `release/*` o `hotfix/*` se mergean a `main` (push a `main`):

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      - name: Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npx semantic-release
```

Requiere `.releaserc.json` o config equivalente de `semantic-release` en la raíz del repo (ver `semantic-versioning.md` para las reglas de bump que aplica automáticamente).

## Reglas de branch protection ligadas al CI

- El job `build` de `ci.yml` debe marcarse como **required status check** tanto en `main` como en `develop`.
- `release.yml` solo corre en push a `main` (post-merge de `release/*` o `hotfix/*`), nunca en PRs abiertos — evita generar releases de código no aprobado.

## Recomendaciones adicionales

- Usar `concurrency` para cancelar runs viejos cuando hay push nuevo al mismo PR:
  ```yaml
  concurrency:
    group: ${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: true
  ```
- Cachear dependencias (`actions/setup-node` con `cache: 'npm'`) para acelerar CI.
- Separar secretos de release (tokens de publicación) en un Environment protegido de GitHub, no como secret plano del repo.
- Opcional: agregar un workflow adicional que valide que las ramas `release/*` solo contengan fixes menores (ej. comparando diff contra `develop` y alertando si detecta archivos nuevos no relacionados a bugfixes).
