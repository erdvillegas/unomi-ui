# Versionamiento semántico (SemVer) + Conventional Commits

## Formato de versión

```
MAJOR.MINOR.PATCH   (ej. 2.4.1)
```

- **MAJOR**: cambios incompatibles con versiones anteriores (breaking changes).
- **MINOR**: nueva funcionalidad compatible hacia atrás.
- **PATCH**: corrección de bugs compatible hacia atrás.

Prerelease/build opcional: `1.4.0-beta.1`, `1.4.0+build.20`.

## Conventional Commits (fuente de verdad para el bump)

Formato de mensaje de commit:

```
<tipo>(<scope opcional>): <descripción corta>

<cuerpo opcional>

<footer opcional>
```

| Tipo         | Bump de versión | Ejemplo                                      |
|--------------|------------------|-----------------------------------------------|
| `feat`       | MINOR            | `feat(auth): agregar login con Google`        |
| `fix`        | PATCH            | `fix(cart): corregir cálculo de impuestos`    |
| `feat!` / `fix!` o footer `BREAKING CHANGE:` | MAJOR | `feat(api)!: eliminar endpoint v1/users` |
| `chore`, `docs`, `test`, `refactor`, `style`, `ci` | Ninguno (no dispara release) | `chore: actualizar dependencias` |

Regla de decisión rápida:
1. ¿Hay un `BREAKING CHANGE:` en el footer o `!` después del tipo? → **MAJOR**
2. Si no, ¿hay al menos un `feat`? → **MINOR**
3. Si no, ¿hay al menos un `fix`? → **PATCH**
4. Si solo hay `chore`/`docs`/`test`/etc → no se genera release.

## Cuándo se taggea la versión en Git Flow

- El tag SemVer se crea en `main`, al cerrar una rama `release/*` o `hotfix/*`.
- `release/*` normalmente corresponde a un bump MINOR o MAJOR (agrupa varios `feature/*`).
- `hotfix/*` corresponde siempre a un bump PATCH.
- `develop` no se taggea — es la rama de integración, no de releases públicos. Si se desea trazabilidad ahí, se pueden usar versiones prerelease (`X.Y.0-beta.N`) sin publicarlas como release oficial.

## Automatización recomendada

Usar **semantic-release** (o `release-please` como alternativa) integrado al workflow de GitHub Actions, disparado al mergear `release/*` o `hotfix/*` a `main`:

- Analiza los commits desde el último tag.
- Calcula automáticamente el próximo número de versión.
- Genera el `CHANGELOG.md`.
- Crea el tag y el GitHub Release.
- Opcionalmente publica el paquete (npm, PyPI, etc.).

Esto elimina la necesidad de que una persona decida manualmente "¿esto es MINOR o PATCH?" — el commit ya lo declara.

## Tags de versión

- Formato de tag: `v<MAJOR>.<MINOR>.<PATCH>` (ej. `v2.4.1`).
- Los tags se crean automáticamente en `main` cuando hay commits que ameritan release (nunca manualmente si hay automatización activa).

## Checklist antes de recomendar un bump manual

- [ ] ¿El cambio rompe algún contrato público (API, CLI, formato de datos)? → MAJOR
- [ ] ¿Agrega capacidad nueva sin romper nada existente? → MINOR
- [ ] ¿Solo corrige un comportamiento incorrecto? → PATCH
- [ ] ¿Es solo mantenimiento interno (deps, refactor, docs)? → no amerita release público
