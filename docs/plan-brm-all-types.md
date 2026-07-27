# Plan: control visual para TODOS los tipos de condición (33)

Objetivo: que cada `type` de condición se edite con controles nativos, no solo los 9 que
hoy tienen fila BRM. Hoy lo no mapeado cae en el árbol técnico (`builders.conditionPanel`);
la meta es que ese fallback casi nunca se use.

## Estado actual (9 con fila BRM)

`booleanCondition`, `notCondition`, `matchAllCondition` (grupos) · `profilePropertyCondition`,
`sessionPropertyCondition`, `eventPropertyCondition` (filas propiedad) · `profileSegmentCondition`,
`profileUserListCondition`, `scoringCondition` (pickers de segmentación).

## Principio rector: un renderer dirigido por la definición, no 24 editores

Los 24 tipos restantes son, en su mayoría, **listas de parámetros escalares tipados**
(`string`/`integer`/`date`/`boolean`/`comparisonOperator`) más algún `Condition` anidado.
Ya tenemos el mapeo tipo→control (en las filas BRM y en `builders.ts`). Entonces:

- **`typedFieldsRow(node, ctx)`** — renderer genérico que arma una fila a partir de
  `ctx.defs.cond[node.type].parameters`, con label + control por tipo:
  `string`→Input, `integer`→Number, `date`→DatePicker, `boolean`→Switch,
  `comparisonOperator`→Select de operadores, multivaluado→MultiInput,
  **`Condition`→`conditionEditor` recursivo** (sub-condición anidada).
- **Registro por tipo** (`TYPE_META`) — opcional, sólo para *mejorar* lo que el genérico ya
  hace: título e icono amigables, labels de campos, y **bindings de picker** (qué campo se
  llena desde qué catálogo). Sin entrada en el registro, el genérico usa los ids de parámetro.

Resultado: los 24 quedan editables con F1; F2–F4 elevan la UX de los que lo ameritan. Las
filas bespoke actuales (property/segment/score/list) se conservan; el resto usa el genérico.

## Los 24 pendientes, por forma de UI

| Forma | Tipos | Control visual |
|---|---|---|
| **Evento sin parámetros** (7) | `cdpSessionEventCondition`, `modifyAnyConsentEventCondition`, `profileUpdatedEventCondition`, `sessionCreatedEventCondition`, `updateConsentEventCondition`, `updateListsEventCondition`, `updatePropertiesEventCondition` | Chip de solo lectura: "Evento: *session created*" (sin inputs) |
| **Propiedad + operador** (3) | `topicPropertyCondition`, `profileAliasesPropertyCondition`, `userListPropertyCondition` | Reusar la fila `row()` con nuevos targets (topic/aliases/userList) + prefijo de path propio |
| **Campos escalares de evento** (4) | `eventTypeCondition` (eventTypeId), `formEventCondition` (formId, pagePath), `videoViewEventCondition` (videoId, pagePath), `modifyConsentEventCondition` (consentTypeId, consentStatus) | `typedFieldsRow` con labels; `eventTypeId` con **picker** de tipos de evento |
| **Rango de sesión** (3) | `sessionDurationCondition` (min/max), `newVisitorCondition` (since), `returningVisitorCondition` (since) | `typedFieldsRow`; presentar min/max como par de Number |
| **Geo** (2) | `geoLocationSessionCondition` (country/admin1/admin2/city), `geoLocationByPointSessionCondition` (rect/circle/distance) | `GeonamesInput` (autocompletar país/ciudad); punto = mini-form (o mapa a futuro) |
| **Comportamiento / agregado** (2) | `pastEventCondition` (window + count + `eventCondition` anidado), `goalMatchCondition` (goalId + operador) | pastEvent: sub-`conditionEditor` (target event) + Number de días/veces + operador; goal: **picker** de `/goals` |
| **Lógica** (1) | `nestedCondition` (path + `subCondition`) | Input de path + sub-`conditionEditor` anidado |
| **Misc** (2) | `idsCondition` (ids[] + match), `sourceEventPropertyCondition` (id/path/scope/type) | ids: MultiInput + Switch "match"; source: `typedFieldsRow` |

## Catálogo de tipos ("+ condition")

Con 33 tipos, el menú plano no escala. Se reemplaza por un **`SelectDialog` buscable,
agrupado por categoría** (Profile / Session / Event / Behavioral / Geo / Logical / Advanced),
**filtrado por el `target` del editor** vía systemTags: un segmento (profile) ofrece
`profileCondition`+`sessionCondition`+logical+agregados; una regla/goal (event) ofrece los
`eventCondition`. Las filas bespoke (property/segment/score/list) aparecen arriba como
"atajos"; el resto sale del catálogo completo.

## Componentes a construir (`webapp/control/brm/`)

1. **`typedFieldsRow.ts`** — renderer genérico def-driven (el backbone).
2. **`catalog.ts`** — `SelectDialog` agrupado/buscable + `TYPE_META` (título, icono, categoría, labels, pickers) + filtrado por systemTags.
3. **`pickers.ts`** — catálogos reutilizables: goals (`/goals`), event types (si hay endpoint; si no, texto libre), geonames (`/geonames/*`). Extiende el `loadCatalogs()` actual.
4. Ampliar `conditionEditor.childEditor` para despachar: bespoke rows → como hoy; no-param → chip; resto → `typedFieldsRow`.

## Fases entregables

| Fase | Contenido | Valor | Estado |
|---|---|---|---|
| **F1** | `typedFieldsRow` genérico (label + control por tipo desde `defs.cond[type].parameters`; `Condition`→editor recursivo) + `+ condition` con **submenús por categoría** (Event/Session/Profile/Aggregated/Logical/Other) desde `defs.condTags`. Los 24 pasan de fallback técnico a **fila de campos nativa**. | todo editable visualmente | ✅ hecho |
| **F2** | **Chip** para condiciones sin parámetros (7); `comparisonOperator`→Select y multivaluado→MultiInput/boolean→Switch en el genérico (cubre topic/aliases/userListProperty y `idsCondition`) | UX correcta para casos simples | ✅ hecho |
| **F3** | Pickers en campos conocidos: `goalId`→/goals, `eventTypeId`→tipos de evento, y demás vía `TYPE_META` | menos texto libre, menos errores | pendiente |
| **F4** | Composites: `pastEventCondition` (sub-condición + ventana temporal + `operator` válido), `nestedCondition` (path + sub-condición), geo con `GeonamesInput` | los tipos "difíciles" con UX real | pendiente |
| **F5** | Registro `TYPE_META` (títulos/iconos/labels) + **`SelectDialog` buscable con filtro por target** (systemTags) + validación de campos requeridos + resumen legible | pulido BRM | pendiente |

## Riesgos / decisiones

- **No reinventar**: `typedFieldsRow` reusa el mapeo tipo→control ya existente y el
  `conditionEditor` recursivo para params `Condition`. El árbol técnico (`builders.ts`) queda
  como **fallback final** por si aparece un tipo nuevo no contemplado — nunca se elimina.
- **`type` runtime**: emitir siempre `type`+`parameterValues` (no `conditionTypeId`). Regla de
  oro: cargar cualquier condición existente sin pérdida (verificado en E1–E5).
- **Pickers condicionados a catálogo**: `goalId` tiene endpoint (`/goals`); `eventTypeId`/
  `consentTypeId`/`formId` puede que no → degradar a texto libre. El `TYPE_META` declara el
  picker sólo cuando hay fuente.
- **Recursión**: `pastEventCondition.eventCondition` y `nestedCondition.subCondition` anidan
  un `conditionEditor` completo (con su propio target). Cuidar profundidad y el re-render
  (mismo patrón `refresh()` de siempre).
- **Geo**: `GeonamesInput` cubre el caso "país/ciudad"; el de punto (lat/long/distancia) es un
  mini-form en F4; un selector en mapa queda fuera de alcance (nota para futuro).
- **Filtrado por target**: usar systemTags para no ofrecer condiciones inaplicables (ej. una
  `sessionCondition` en un contexto de sólo-perfil), pero permitir "mostrar todas" como escape.
