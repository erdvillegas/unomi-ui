# Plan: selectores dinámicos para objetos existentes

Objetivo: que en cualquier punto donde hoy se escribe a mano el **id de otro objeto de
Unomi** (un scope, un segmento, un goal, una lista, un tipo de evento, una propiedad, un
tag…) el usuario pueda **buscar y seleccionar** en vez de teclear. Ejemplo guía: en una
regla, elegir el **Scope** de un desplegable con búsqueda en lugar del texto libre
`systemscope`.

El plan cubre **todos los objetos seleccionables interconectados**, no solo scope.

---

## 1. Estado actual (qué existe ya)

Tres lugares editan referencias a objetos, cada uno con su propio mecanismo:

| Punto de inyección | Archivo | Cómo referencia objetos hoy |
|---|---|---|
| **Formulario escalar** (metadata + campos planos) | `control/FormEngine.ts` + `model/forms.ts` | `Input` de texto libre. `metadata.scope` sale como texto con default `systemscope`; `campaignId`, `primaryGoal`, `valueTypeId` idem; `tags` como tokens libres. |
| **Editor visual de condiciones (BRM)** | `control/brm/conditionEditor.ts` | Ya tiene pickers parciales: `PICKERS` (goal, eventType), `membershipRow` (segmentos, listas), `scoreRow` (scoring). |
| **Editor técnico de condiciones/acciones** | `control/builders.ts` (`renderParams`) | Todo parámetro `string` → `Input` de texto libre. Ninguna acción usa picker. |

**Carga de catálogos: dispersa y parcial.**
- `conditionEditor.loadCatalogs()` → segments, scoring, lists, goals, eventTypes.
- `conditionEditor.loadProps()` → propiedades profile/session.
- Fetches sueltos de `/segments` en `ConfigIO.controller.ts` y `ItemDetail.controller.ts`.
- **Faltan por completo:** scopes, campaigns, tags, valueTypes.

---

## 2. Inventario de referencias interconectadas

Todo lo que debería volverse selector, con su fuente de datos (endpoint) y dónde aparece.

### 2.1 Nivel metadata / campos escalares (`model/forms.ts`)

| Campo | Recursos que lo tienen | Catálogo (endpoint) | Multi |
|---|---|---|---|
| `metadata.scope` | rules, segments, scoring, goals, campaigns, lists, properties | `GET /scopes` → `[{metadata:{id,name}}]` | no |
| `metadata.tags` | todos | ~~`/definitions/tags`~~ **no existe endpoint en Unomi 3.x** → siguen como tokens libres | sí |
| `campaignId` (goals) | goals | `GET /campaigns` | no |
| `primaryGoal` (campaigns) | campaigns | `GET /goals` | no |
| `valueTypeId` (properties) | properties | `GET /definitions/values` (schema `ValueType {id, nameKey}`) | no |
| `target` (properties) | properties | estático `profiles`/`sessions` | no |

### 2.2 Nivel condición (`conditionEditor` PICKERS / builders)

| type condición | parámetro | catálogo | estado |
|---|---|---|---|
| `profileSegmentCondition` | `segments` | segments | ✅ ya (membershipRow) |
| `profileUserListCondition` | `lists` | lists | ✅ ya |
| `scoringCondition` | `scoringPlanId` | scoring | ✅ ya |
| `goalMatchCondition` | `goalId` | goals | ✅ ya (PICKERS) |
| `eventTypeCondition` | `eventTypeId` | eventTypes | ✅ ya |
| `profilePropertyCondition` / `sessionPropertyCondition` | `propertyName` | props profile/session | ⚠️ parcial (row usa props) |
| cualquiera con param `scope` / `sourceId` | `scope` | scopes | ❌ falta |
| `pastEventCondition`, `sourceEventCondition` | `eventCondition` (anidada) | — (recursivo) | ✅ recursivo |

### 2.3 Nivel acción (`builders.renderParams`) — hoy 0 pickers

Acciones con referencias (parámetros según `GET /definitions/actions`):

| action type | parámetro | catálogo |
|---|---|---|
| `addToListsAction` / `removeFromListsAction` | `listIdentifiers` | lists |
| `setPropertyAction` | `setPropertyName` (path de propiedad) | props |
| `sendEventAction` | `eventType` | eventTypes |
| `setEventOccurenceCountAction` | `event` (condición) | recursivo |
| varias | `scope` | scopes |

---

## 3. Diseño propuesto

Tres piezas, todas reutilizando lo que ya existe. **Sin dependencias nuevas.**

### 3.1 Un único servicio de catálogos — `service/Catalog.ts`

Consolida `loadCatalogs` + `loadProps` + los fetch sueltos y **añade los que faltan**
(scopes, campaigns, tags, valueTypes). API mínima:

```ts
// devuelve Opt[] = {id,name}[], cacheado por clave; una sola request por clave
export async function get(key: CatalogKey): Promise<Opt[]>;
export function invalidate(key?: CatalogKey): void;   // key vacía = todo
```

- **Caché en memoria** (igual que hoy `catCache`/`propsCache`), un `Map<key, Promise<Opt[]>>`.
- **Invalidación**: en logout / cambio de `baseUrl` (limpiar todo) y tras crear/borrar un
  objeto de ese tipo en `ItemDetail.onSave/onDelete` (`invalidate("scopes")` etc.), para
  que un scope recién creado aparezca sin recargar la app.
- `conditionEditor.loadCatalogs/loadProps` pasan a delegar aquí (o se eliminan y sus
  consumidores llaman a `Catalog.get`). `ConfigIO` e `ItemDetail` dejan de duplicar `/segments`.

> ponytail: un `Map` con memoización, no una capa de repos. Los catálogos aquí (scopes,
> segmentos, goals…) son decenas de filas → carga completa + filtro cliente. El único
> catálogo potencialmente grande (perfiles) **no** entra aquí; ese ya usa búsqueda
> server-side por query y se queda como está.

### 3.2 Un selector reutilizable — nativo, sin control custom

No hace falta un control nuevo: UI5 ya trae búsqueda type-ahead.

- **1 valor** → `sap.m.ComboBox` (filtra al teclear, permite valor libre = escape hatch).
- **N valores** → `sap.m.MultiComboBox` (ya usado en `membershipRow`).

Se encapsula en **un helper** `refSelect(catalogKey, value, multi, commit)` que:
crea el (Multi)ComboBox, lo llena async desde `Catalog.get`, precarga la selección y
hace `commit` al cambiar. Vive en `control/refSelect.ts` (~30 líneas) y lo usan los tres
puntos de inyección.

> Escape hatch para catálogos grandes (futuro): si algún catálogo supera N ítems, cambiar
> ese caso a `SelectDialog`/`ValueHelpDialog` con búsqueda server-side. No se construye
> ahora (YAGNI) — marcar con `ponytail:` el punto de extensión.

### 3.3 El mapa de interconexión — cómo se sabe qué parámetro es una referencia

El problema de fondo: las definiciones de Unomi tipan estos parámetros como `string`
plano, **sin pista** de que son un id de otro objeto. Se resuelve con una tabla explícita
+ heurística por nombre, en **un solo lugar** `control/refMap.ts`:

```ts
// clave explícita: "<type>.<paramId>" -> catalogKey
const EXPLICIT = { "goalMatchCondition.goalId": "goals", "*.scope": "scopes", ... };
// heurística de respaldo por sufijo del paramId
const BY_SUFFIX = [[/scope$/i,"scopes"], [/segmentId$/i,"segments"],
  [/listIdentifiers?$/i,"lists"], [/campaignId$/i,"campaigns"],
  [/goalId$/i,"goals"], [/eventType$/i,"eventTypes"], [/propertyName$/i,"props"]];
export function refFor(type: string, paramId: string): CatalogKey | null;
```

Los tres puntos de inyección consultan `refFor(...)`; si devuelve una clave, renderizan
`refSelect`; si no, el control genérico de siempre. Esto **unifica** los pickers hoy
hardcodeados (`PICKERS`, `membershipRow`) en la misma tabla.

---

## 4. Fases (un commit por fase, conventional commits, sin push)

> **Estado: todas completadas.** Rama `feature-dropdown`, suite final 70/70, typecheck
> limpio. Commits al final del documento (§7).

**Fase 1 — Servicio de catálogos. ✅** Crear `service/Catalog.ts` con caché + invalidación;
añadir scopes/campaigns/valueTypes; migrar `conditionEditor.loadCatalogs/loadProps`
y los fetch de `/segments` de `ConfigIO`/`ItemDetail` a delegar en él. Sin cambio visible.
*Ajuste:* `tags` **no** se añadió — Unomi 3.x no expone endpoint de tags; siguen como
tokens de texto libre. `valueTypes` sale de `/definitions/values`.

**Fase 2 — Helper `refSelect` + `refMap`. ✅** Helper nativo (`ComboBox`/`MultiComboBox`) y
la tabla de interconexión. Tests unitarios de `refFor` (heurística + overrides) y de
`refSelect` (fill/commit en single, multi y texto libre).

**Fase 3 — Metadata (el caso guía: Scope). ✅** Añadido `type: "ref"` a `FormEngine.Field`
(con `catalog` y `multi`), renderizado con `refSelect`. En `model/forms.ts`:
`scope`→ref(scopes), `campaignId`→ref(campaigns), `primaryGoal`→ref(goals),
`valueTypeId`→ref(valueTypes), `target`→select estático. `tags` queda como tokens.
**Aquí queda cumplido el ejemplo pedido (elegir Scope en una regla).**

**Fase 4 — Condiciones. ✅** `PICKERS` reemplazado por `refFor` en `renderParam`; cubre el
`scope` y demás refs que faltaban. Las filas especializadas (segmento/lista/scoring con su
`matchType`) se mantienen. Sin regresiones.

**Fase 5 — Acciones (editor técnico). ✅** En `builders.renderParams`, antes del `Input`
genérico, se consulta `refFor(node.type, p.id)` y se usa `refSelect` (respetando
`p.multivalued`). Cubre listas/eventType/scope en acciones de reglas.

**Fase 6 — Invalidación + pruebas. ✅** `Catalog.invalidate()` enganchado en save/delete
(`ItemDetail`), logout (`App`) y cambio de baseUrl (`Settings`). Tests de `Catalog`
(memoización, `invalidate()`, "los fallos no se cachean").
*Ajustes:* **i18n** no hizo falta — las labels de formulario son strings del patrón
existente, no claves i18n. En vez del journey **OPA5** autenticado (frágil: requiere
login + navegación + stubs de `/definitions` y `/scopes`) se optó por el test determinista
de invalidación, que es la garantía funcional real; el render de los pickers ya está
cubierto por unit tests.

**Fase 7 — Selector de tipo con búsqueda (extra). ✅** `builders.typedPanel`: el `Select`
plano del *tipo* de condición/acción (100+ ids) pasa a `ComboBox` con type-ahead; solo
acepta un id real de la lista y resetea `parameterValues` al cambiar. El menú "+ condition"
del BRM ya buscaba (`SelectDialog`), sin cambios. Es el catálogo de mayor retorno tras los
de referencia (ver §8); no toca `Catalog`/`refMap` porque es el *tipo*, no un parámetro.

---

## 5. Riesgos y decisiones

- **Definiciones no son verdad absoluta** (ver CLAUDE.md): la forma real de `Condition`
  usa `type`, y los params-referencia no vienen marcados → por eso el mapa explícito
  manda sobre la heurística. Verificar cada mapeo contra el contenedor vivo antes de fiarse.
- **Scopes envueltos**: `GET /scopes` devuelve `[{metadata:{id,name}}]` (no `[{id,name}]`);
  el adaptador en `Catalog.ts` normaliza a `Opt`.
- **Valor libre permitido**: `ComboBox` deja escribir un id que no está en el catálogo
  (útil para objetos aún no creados o externos). No forzar selección estricta.
- **Catálogos grandes**: sólo perfiles; se deja fuera. El resto entra completo. Punto de
  extensión a server-search marcado con `ponytail:`.
- **Sin dependencias nuevas**; todo con controles `sap.m` ya cargados.

---

## 6. Resumen ejecutable

1 servicio (`Catalog.ts`) + 1 helper (`refSelect.ts`) + 1 tabla (`refMap.ts`), enchufados
en los 3 puntos que ya editan referencias. El caso "elegir Scope en una regla" se entrega
en la Fase 3; las fases 4–5 propagan el mismo selector a condiciones y acciones.

---

## 7. Commits (rama `feature-dropdown`, local, sin push)

| Fase | Commit | Título |
|---|---|---|
| Plan | `d70bc13` | docs(selectors): add plan for dynamic reference selectors |
| 1 | `97a5b74` | refactor(catalog): centralize reference catalogs in one cached service |
| 2 | `6a06db3` | feat(selectors): add refSelect picker and refMap interconnection table |
| 3 | `175cee7` | feat(selectors): searchable object pickers in metadata forms |
| 4 | `2ae36c9` | feat(selectors): refMap-driven pickers in the BRM condition editor |
| 5 | `1ac8dc2` | feat(selectors): refMap-driven pickers in the technical action editor |
| 6 | `064a44f` | feat(selectors): invalidate catalog cache on save/delete/logout/base-url |
| 7 | `bac7988` | feat(selectors): searchable type picker in the technical editor |

Suite final: **71/71 SUCCESS**, `tsc --noEmit` limpio.

---

## 8. Otros catálogos enlazables (pendientes / opcionales)

Basado en los endpoints de colección reales del OpenAPI. Los de alta frecuencia ya están
cubiertos (§2). Lo que queda:

| Candidato | Endpoint | Dónde | Valor |
|---|---|---|---|
| **Nombres de propiedad** | `/profiles/properties` (+ `/profiles/existingProperties`) | params `propertyName`, `setPropertyName`, `sourcePropertyName` | Medio-alto. Es el caso excluido de `refMap`: necesita target (profile vs session) y forma distinta a `Opt[]`. |
| **Rules** | `/rules` | solo si algún param referencia un id de regla (poco común) | Bajo — verificar contra el contenedor vivo antes. |
| **JSON Schemas** | `/jsonSchema` | referencias a esquemas de validación de eventos | Nicho. |

**No enlazables:** `tags` (sin endpoint en 3.x), `importConfiguration`/`exportConfiguration`
(no los referencia otro objeto), `cluster`/`privacy`/`profiles/count|export` (no son catálogos).
