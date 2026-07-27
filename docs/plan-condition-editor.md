# Plan: editor visual de condiciones estilo BRM

Objetivo: un editor **guiado y visual** para construir `Condition` — filas *propiedad →
operador → valor* con **pickers** (no texto libre), agrupadas por **AND/OR/NOT** con
anidamiento visual. Pensado como componente **reutilizable donde se define una consulta**:
Segments, Rules, Scoring, Goals, Campaigns, y también búsqueda de perfiles / export.

Reemplaza (para el caso común) al árbol técnico actual de `control/builders.ts`, donde cada
nodo es un `Select` de los 33 tipos + inputs genéricos y el usuario debe saber ids de
condición y nombres de propiedad de memoria.

## Principio rector: BRM para el 90%, fallback técnico para el resto

No se hace visual cada uno de los 33 tipos. Se cubre lo que un operador usa el 99% del
tiempo y se **degrada con elegancia**:

| Categoría (systemTags) | Editor visual | Ejemplos |
|---|---|---|
| **Lógicas** | Grupo AND/OR/NOT anidable | `booleanCondition`, `notCondition`, `matchAllCondition` |
| **Propiedad+operador** (6 tipos) | Fila *propiedad → operador → valor* | `profilePropertyCondition`, `sessionPropertyCondition`, `eventPropertyCondition`, `topicPropertyCondition`, `profileAliasesPropertyCondition`, `userListPropertyCondition` |
| **Todo lo demás** (~24 tipos) | **Fallback** al nodo técnico actual (`builders.ts`) con un botón "Avanzado" | `pastEventCondition`, `geoLocation…`, `scoringCondition`, … |

Así el editor BRM se construye **encima** de la máquina existente, no la reemplaza: los tipos
exóticos siguen editables sin escribir 24 editores a medida. `ponytail:` reuso agresivo.

## Modelo de UX

```
┌─ Grupo [ TODAS ▾ ]  (AND)                         [+ condición] [+ grupo] [x] ┐
│   • [ Perfil ▾ ] propiedad:[ Email        🔍] [ existe        ▾ ]              │
│   • [ Perfil ▾ ] propiedad:[ Nº de visitas 🔍] [ mayor que     ▾ ] [ 5      ] │
│   ┌─ Grupo [ ALGUNA ▾ ] (OR)                                   [+] [+] [x]  ┐  │
│   │   • [ Sesión ▾ ] propiedad:[ Duración   🔍] [ entre ▾ ] [100] … [500]   │  │
│   │   • NO ( • [ Perfil ▾ ] [ Nacionalidad 🔍 ] [ es ▾ ] [ AR ] )           │  │
│   └────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Grupo** = `booleanCondition` (operator `and`/`or`) o `notCondition`. Selector TODAS/ALGUNA/NO.
- **Fila** = una condición propiedad+operador. Tres pickers: **target**, **propiedad**, **operador**; y el/los **valor(es)** con control según el tipo.
- **matchAllCondition** = grupo vacío (sin filas) → "coincide con todo".

## Componentes a construir (`webapp/control/brm/`)

1. **`ConditionEditor`** — raíz. Props: `condition` (objeto in/out), `target` (`profile`/`session`/`event`, filtra propiedades y catálogo), `defs` (de `builders.loadDefs`). Renderiza el grupo raíz. Emite el `Condition` runtime exacto (`type`+`parameterValues`, **nunca** `conditionTypeId`).
2. **`Group`** — AND/OR/NOT; lista de hijos (filas o grupos), botones +condición / +grupo / eliminar. Mapea a `booleanCondition`/`notCondition`.
3. **`Row`** — fila propiedad+operador. Orquesta `PropertyPicker` + `OperatorSelect` + `ValueField`. Sabe a qué de los 6 tipos mapear según el target elegido.
4. **`PropertyPicker`** — `sap.m.Input` con `suggestions` o `SelectDialog` buscable, alimentado por `/profiles/properties` (agrupado por target). Muestra `metadata.name`, guarda `metadata.id` como `propertyName`. Incluye "propiedad personalizada" (texto libre) para nombres no catalogados.
5. **`OperatorSelect`** — `Select` de operadores **filtrado por el tipo de valor** de la propiedad (ver tabla). 
6. **`ValueField`** — control según tipo: `Input`(texto), `Input type=Number`/`StepInput`(entero), `DateTimePicker`(fecha), `Switch`(booleano), `MultiInput`(operadores multivaluados `in`/`all`/…), doble control para `between`. 
7. **`AdvancedNode`** — envuelve `builders.conditionPanel` para cualquier tipo no mapeado; permite pasar de/hacia el modo visual.

## Lógica de dominio (el corazón)

### Tipo de valor
`valueTypeId` de las propiedades viene **null** en las built-in → no es fiable. Estrategia:
- Intentar `property.valueTypeId`; si falta, **default `string`** con un pequeño selector de tipo (`string`/`integer`/`date`/`boolean`) en la fila para override manual.
- El tipo elegido decide **qué slot** de `parameterValues` se llena (los `…Condition` de propiedad tienen varios):

| Tipo | Operador simple → slot | Operador múltiple → slot |
|---|---|---|
| string | `propertyValue` | `propertyValues` |
| integer | `propertyValueInteger` | `propertyValuesInteger` |
| date | `propertyValueDate` (o `propertyValueDateExpr`) | `propertyValuesDate` |
| boolean | `propertyValue` (`"true"`/`"false"`) | — |

### Operadores por tipo (hardcode — no hay endpoint, da 500)

| Tipo | Operadores ofrecidos |
|---|---|
| string | equals, notEquals, contains, startsWith, endsWith, matchesRegex, in, notIn, exists, missing |
| integer/double | equals, notEquals, greaterThan, greaterThanOrEqualTo, lessThan, lessThanOrEqualTo, between, in, notIn, exists, missing |
| date | equals, greaterThan, lessThan, between, isDay, isNotDay, exists, missing |
| boolean | equals, exists, missing |

- `exists`/`missing` → sin valor (ocultar `ValueField`).
- `between` → dos valores. `in`/`notIn`/`all`/`hasSomeOf`/`hasNoneOf` → `MultiInput` (slot `…Values…`).

### Target → tipo de condición de fila
| target | tipo emitido | propiedades del picker |
|---|---|---|
| profile | `profilePropertyCondition` | `/profiles/properties` (grupo `profiles`) |
| session | `sessionPropertyCondition` | grupo `sessions` |
| event | `eventPropertyCondition` | propiedades de evento (texto libre / `eventProperty`) |

El `target` raíz se toma del contexto (segment/rule sobre perfiles; goal sobre eventos…) pero
es cambiable por fila para casos mixtos.

## Integración

- **Reemplaza** los `conditionPanel` inline de `ItemDetail` (Segments/Rules/Scoring `elements`/Goals/Campaigns) por `ConditionEditor`, pasando el `target` correcto. El panel "Advanced (JSON)" sigue como red de seguridad.
- **Nuevo uso**: búsqueda de perfiles (`ProfileList`) con un `ConditionEditor` para filtros ricos en vez del `SearchField` de texto — cumple el "definir una consulta".
- El editor produce el mismo `Condition` que ya viaja en el body de los `POST …/query` y de los items → cero cambios en `UnomiClient`.

## Fases entregables

| Fase | Contenido | Valor | Estado |
|---|---|---|---|
| E1 | `control/brm/conditionEditor.ts`: grupos AND/OR (`booleanCondition`) + filas `profilePropertyCondition` con picker de propiedad (ComboBox desde `/profiles/properties`), tipo string/integer (derivado del slot), operador con labels amigables, y valor tipado (Input/MultiInput/between); fallback a `builders.conditionPanel` para tipos no mapeados. Integrado en la condición de **Segments** (target profile) | editor BRM usable para segmentos de perfil | ✅ hecho |
| E2 | Grupos **NONE of** (`notCondition` → `booleanCondition/or`); tipos date (`DateTimePicker`) / boolean (`Switch`) con override por fila; **target por fila** profile/session (`sessionPropertyCondition`); slot-mapping completo (`propertyValueDate`/`…Integer`/…) | cobertura de las propiedades reales | ✅ hecho |
| E3 | Target **event** (`eventPropertyCondition`, picker de texto libre); botón **{ }** por fila para conmutar visual↔avanzado (`WeakSet`, sin ensuciar el JSON) y **◀ visual** para volver; BRM habilitado en todas las secciones de condición (segments/rules/goals/campaigns) | paridad con los tipos de propiedad + escape a avanzado | ✅ hecho |
| E4 | **Query builder** en `ProfileList`: panel con `ConditionEditor` (target profile) que maneja `POST /profiles/search`; guardar/cargar consultas en `localStorage`; fix del path `properties.<id>` en propiedades de catálogo | "definir una consulta" reutilizable | ✅ hecho |
| E5 | **Condiciones especiales con picker**: el `+ condition` es un menú (Property / In segment / Score / In list). Filas dedicadas para `profileSegmentCondition` y `profileUserListCondition` (matchType + `MultiComboBox` desde `/segments` y `/lists`) y `scoringCondition` (plan desde `/scoring` + operador + valor). Catálogos cacheados vía `loadCatalogs()` | building-blocks de segmentación tipo BRM | ✅ hecho |

## Riesgos / decisiones

- **`valueTypeId` null** en la práctica → no confiar; default string + override de tipo por fila. Documentado arriba.
- **Sin endpoints de operadores/value-types** (500) → hardcode versionado; refrescar si Unomi los expone.
- **Fidelidad de round-trip**: emitir siempre `type`+`parameterValues` runtime (nunca `conditionTypeId` del spec). Un `Condition` cargado que no mapea a fila (tipo exótico o forma inesperada) cae en `AdvancedNode` sin corromperse — **regla de oro: cargar cualquier condición existente sin pérdida**.
- **No reinventar el árbol**: `builders.ts` sigue siendo el motor de fallback; el BRM es una capa de presentación sobre el mismo modelo `{type, parameterValues}`. `ponytail:` una capa, no un segundo engine.
- **Propiedades no catalogadas**: el `PropertyPicker` permite texto libre (no toda propiedad de evento está en `/profiles/properties`).
- **Path de propiedad** (verificado en vivo): una condición sobre una propiedad de perfil/sesión usa `propertyName = "properties.<id>"`, no el id crudo (`nbOfVisits` → 0 resultados; `properties.nbOfVisits` → correcto). El picker prefija automáticamente al elegir del catálogo y quita el prefijo al mostrar; eventos van sin prefijo (texto libre).
- **Consultas guardadas**: no hay endpoint en Unomi → se persisten en `localStorage` (por navegador). Migrar a un store server-side si se necesita compartirlas.
