# Estrategia de branching: Git Flow

## Ramas principales

- **`main`**: siempre refleja el código en producción. Solo recibe merges desde `release/*` o `hotfix/*`. Cada merge a `main` se taggea con una versión SemVer.
- **`develop`**: rama de integración continua del trabajo en curso. Todo `feature/*` nace y vuelve aquí.

## Ramas auxiliares

| Prefijo     | Nace de     | Se mergea a          | Uso                                           |
|-------------|-------------|------------------------|------------------------------------------------|
| `feature/`  | `develop`   | `develop`              | Nueva funcionalidad                            |
| `release/`  | `develop`   | `main` **y** `develop` | Congelar y estabilizar una versión candidata   |
| `hotfix/`   | `main`      | `main` **y** `develop` | Corrección urgente directa a producción        |
| `bugfix/`   | `develop`   | `develop`              | Corrección de bug no urgente (opcional)        |

## Convención de nombres de rama

```
<tipo>/<ticket-o-tema-corto>
```

Ejemplos:
- `feature/checkout-express`
- `release/2.4.0`
- `hotfix/payment-gateway-500`
- `bugfix/login-timeout`

## Flujo: feature

1. Crear desde `develop` actualizado: `git checkout -b feature/nombre-corto develop`
2. Commits siguiendo Conventional Commits (ver `semantic-versioning.md`).
3. PR hacia `develop` en cuanto haya algo revisable.
4. CI en verde (lint, tests, build) — ver `github-actions-patterns.md`.
5. Al menos 1 revisión aprobada.
6. Merge a `develop` (squash o merge commit, según prefiera el equipo — en Git Flow es común preservar merge commits para trazabilidad de releases).
7. Borrar la rama tras el merge.

## Flujo: release

1. Cuando `develop` tiene el contenido deseado para la próxima versión, crear: `git checkout -b release/X.Y.0 develop`
2. En esta rama solo se permiten: fixes menores, ajustes de changelog, bump de versión. **No** se agregan features nuevas.
3. Validación/QA sobre `release/*`.
4. Al cerrar:
   - Merge a `main` → tag `vX.Y.0` (ver `semantic-versioning.md`).
   - Merge de vuelta a `develop` para que los fixes hechos en la release no se pierdan.
5. Borrar la rama `release/*` tras ambos merges.

## Flujo: hotfix (urgente en producción)

1. Crear desde `main`: `git checkout -b hotfix/descripcion-corta main`
2. Fix mínimo y quirúrgico, sin aprovechar para meter otros cambios.
3. PR con revisión exprés — nunca se saltan los tests automáticos.
4. Al cerrar:
   - Merge a `main` → tag de nueva versión PATCH.
   - Merge a `develop` (o a la `release/*` activa si existe una en curso, y de ahí eventualmente a `develop`).
5. Borrar la rama tras ambos merges.

## Reglas de protección recomendadas

**`main`**
- Sin pushes directos, solo merge desde `release/*` o `hotfix/*` vía PR.
- Requerir CI en verde antes de mergear.
- Requerir al menos 1 aprobación.

**`develop`**
- Sin pushes directos, solo vía PR desde `feature/*`, `bugfix/*`, o merge de vuelta desde `release/*`/`hotfix/*`.
- Requerir CI en verde.

## Señales de alerta a corregir proactivamente

- Un `feature/*` que intenta mergearse directo a `main` → romper el flujo, corregir el PR hacia `develop`.
- `release/*` que acumula features nuevas en vez de solo estabilización → señalar que desvirtúa el propósito de la rama.
- `hotfix/*` que no se re-mergea a `develop` → riesgo de que el fix se pierda en el próximo release, marcarlo como pendiente crítico.
- Ramas `feature/*` de vida muy larga sin sincronizar con `develop` → sugerir rebase/merge frecuente para evitar conflictos grandes.
