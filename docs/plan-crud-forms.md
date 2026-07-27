# Plan: CRUD con controles nativos (reemplazar JSON crudo)

Objetivo: editar todas las entidades con **controles UI5 nativos** (Input, Select, Switch,
DatePicker, MultiInput, sub-editores) en lugar del `TextArea` de JSON. El JSON crudo queda
como **escape hatch** (toggle "Avanzado"), nunca como única vía.

Base: `docs/openapi.json` — 121 endpoints, 73 esquemas. Recordar que **el spec miente en
runtime** (`Condition`/`Action` usan `type`, no `conditionTypeId`); las formas se validan
contra el contenedor vivo antes de confiar en el schema.

## Idea rectora (una sola pieza, no N formularios)

Casi toda entidad Unomi comparte la misma anatomía:

```
{ itemId, itemType, scope, version,   ← sistema (derivados; solo-lectura en el form)
  metadata: { id, name, description, scope, tags, enabled, ... },  ← común
  ...campos propios de la entidad }    ← varios son Condition / [Action] / sub-objetos
```

Por eso el núcleo es **un generador de formularios declarativo**: cada recurso aporta una
lista corta de campos (`{prop, control, opts}`); un motor genérico los renderiza y hace
bind bidireccional a un `JSONModel`. Nada de un form escrito a mano por entidad.

### Mapa tipo-de-campo → control nativo

| Tipo (schema) | Control UI5 | Notas |
|---|---|---|
| `string` | `Input` | |
| `string` largo/description | `TextArea` | autogrow |
| `string` / `date-time` | `DateTimePicker` | ISO 8601 |
| `integer` / `number` | `Input type=Number` / `StepInput` | coerción numérica |
| `boolean` | `Switch` | |
| `[string]` (tags, segments, lists) | `MultiInput` (tokens) | |
| `enum` / valor de catálogo | `Select` / `ComboBox` | opciones desde `/definitions/*` |
| `Condition` | **`ConditionBuilder`** (ya existe) | árbol recursivo |
| `[Action]` | **`ActionBuilder`** (nuevo, espeja ConditionBuilder) | usa `/definitions/actions` |
| `[ScoringElement]` | grupo repetible (Condition + valor) | add/remove |
| `object` libre (`properties`, `scores`) | editor clave-valor | filas add/remove |
| `object` = JSON Schema (jsonSchema) | `CodeEditor` JSON | el contenido *es* un schema |
| `[SubObjeto]` (dateRanges, numericRanges, childPropertyTypes) | sub-form repetible | recursivo |

### Piezas reutilizables a construir

1. **`FormEngine`** (controller mixin o helper) — recibe la config de campos + el modelo y
   arma el `sap.ui.layout.form.SimpleForm` con el control correcto por tipo. Render
   programático (como ConditionBuilder) para soportar arrays/sub-objetos repetibles.
2. **`MetadataForm`** — el bloque `metadata` común (id, name, description, scope, tags,
   enabled). Incrustado en cada entidad. `id`/`scope` solo-lectura al editar (clave); `hidden`,
   `readOnly`, `missingPlugins` no se editan (derivados del sistema).
3. **`ActionBuilder`** — gemelo de `ConditionBuilder` para `[Action]` (Rules). Cada acción =
   `Select` de `actionTypeId` + inputs por parámetro desde `/definitions/actions`.
4. **`KeyValueEditor`** — para `object` libres (props de perfil/persona, parameterValues sueltos).
5. **`GeonamesInput`** — autocompletar ciudad/país vía `/geonames/*` (para campos geo).

## Cobertura por recurso (los 121 endpoints)

| Grupo | #ep | Tratamiento | Fase |
|---|---|---|---|
| **segments** | 10 | Form: metadata + `condition` (ConditionBuilder) | 4 |
| **rules** | 10 | Form: metadata + `condition` + `actions` (ActionBuilder) + flags/priority | 4 |
| **scoring** | 8 | Form: metadata + `elements[]` (Condition+valor repetible) | 4 |
| **goals** | 7 | Form: metadata + `startEvent`/`targetEvent` (Condition) + campaignId | 4 |
| **campaigns** | 10 | Form: metadata + fechas + `entryCondition` + cost/currency/primaryGoal/timezone; `CampaignEvent` sub-CRUD | 4 |
| **definitions** | 16 | Catálogo solo-lectura (ya hecho). **Alimenta** los editores (ConditionType/ActionType/ValueType) | dep. 4 |
| **lists** (userList) | 5+1 | Form: metadata (UserList es metadata pura) | 5 |
| **scopes** | 4 | Form: metadata (Scope es metadata pura) | 5 |
| **profiles/properties** (PropertyType) | — | Form rico: valueType (Select), rangos date/numeric/ip (sub-forms), multivalued, mergeStrategy, childPropertyTypes | 5 |
| **profiles/personas** | — | Form: properties (KeyValueEditor) + segments + scores; CRUD persona | 6 |
| **profiles** (perfil) | 35 | Editar `properties` (KeyValueEditor), aliases (add/remove), consents, segmentos; batch update; export | 6 |
| **importConfiguration** | 5 | Form CSV: separadores, header, merging, overwrite, active + subida archivo (oneshot) | 7 |
| **exportConfiguration** | 5 | Form: separadores, active, `condition` de la Query de export | 7 |
| **groovyActions** | 2 | Editor de script (`CodeEditor` Groovy) + upload `Attachment` | 7 |
| **jsonSchema** | 6 | Registro: lista + `CodeEditor` JSON (el contenido es un JSON Schema → JSON legítimo) | 7 |
| **patches** | 1 | Form "aplicar patch" (target + operación) | 7 |
| **privacy** | 10 | Botones de acción por perfil: anonimizar, anonymous-browsing on/off, event filters, borrar datos/propiedad | 7 |
| **geonames** | 5 | Widget de autocompletado geo (se usa *dentro* de forms) | 6 |
| **cluster** | 3 | Dashboard solo-lectura (nodos/estado) | opc. |
| query, events, eventcollector, context.js/json, client, test, api-docs | ~17 | Endpoints de runtime/ingesta/infra — **sin UI de admin** (no son CRUD) | — |

> Los ~17 endpoints de la última fila son de ingesta/contexto/health (los consume otro
> sistema, no el operador). Se documentan como fuera de alcance de "CRUD con formularios".

## Fases entregables

| Fase | Contenido | Valor | Estado |
|---|---|---|---|
| 4 | `FormEngine` (config-driven) + configs de las 5 entidades; `ItemDetail` migrado a form nativo (metadata + campos escalares) con panel "Advanced (JSON)" + Aplicar como red de seguridad; reuso de `ConditionBuilder` | fin del JSON crudo para el 80% de campos | ✅ hecho |
| 4b | Módulo compartido `control/builders.ts` (Condition + Action recursivos, `properties` map, scoring `elements`); editores **inline** en `ItemDetail` para condition/actions/elements/start-target/entry; se eliminó la ruta separada `ConditionBuilder` (todo en una pantalla, un solo Save) | fin del JSON crudo también en arrays anidados | ✅ hecho |
| 5 | Nuevos recursos como form CRUD: **Lists, Scopes, PropertyTypes** (reuso de `MetadataList`/`ItemDetail` con `extract` por recurso para normalizar array/envelope/dict-agrupado a `Metadata[]`) + 3 entradas de nav | gestión de catálogo | ✅ hecho |
| 6 | **Profiles/Personas** a fondo: editar propiedades, aliases, consents, segmentos, batch, export; `GeonamesInput` | operación real del CDP | pendiente |
| 7 | Ops/config: **Import/Export config, groovyActions, jsonSchema, patches, privacy** | paridad total con la API | pendiente |

### Fase 4 concreta (arranque)

1. `service/definitions.ts` — cache de `/definitions/conditions`, `/definitions/actions`,
   value types (ya se fetchean sueltos; centralizar para alimentar los `Select`).
2. `control/FormEngine.ts` — `render(fieldsConfig, model, container)`.
3. `control/MetadataForm.ts` + `control/ActionBuilder.ts` + `control/KeyValueEditor.ts`.
4. Config por entidad: `model/forms.ts` con las 5 listas de campos.
5. `ItemDetail.view.xml` — reemplazar el `TextArea` por el form; dejar Panel "JSON (avanzado)"
   colapsado y solo-lectura, sincronizado desde el modelo (puente + auditoría).
6. Verificar cada save contra el contenedor vivo (create→get→delete por el proxy).

## Riesgos / decisiones

- **`object` libres** (`parameterValues`, `properties`, `scores`): no tienen schema de campos.
  Se editan con `KeyValueEditor` (o los builders cuando son Condition/Action). No se intenta
  inferir tipos por valor — el usuario elige tipo por fila.
- **Campos derivados** (`itemId`, `version`, `itemType`, flags `hidden/readOnly/missingPlugins`):
  solo-lectura; no se envían editados (se preservan del GET al hacer POST/upsert).
- **`scope`/`id`**: inmutables al editar (parte de la identidad). Editables solo al crear.
- **jsonSchema y groovyActions**: su *contenido* es código/schema → editor de texto es lo
  correcto, no un form de campos. No se fuerza formulario donde no aplica.
- **Validación**: required/formato desde el schema (email, date-time, número); bloquear save
  con `ValueState.Error`. La verdad final la da Unomi (500) → mostrar el error del backend.
- `ponytail:` un solo `FormEngine` dirigido por config + reuso de los builders; se evita
  escribir/mantener un form por entidad. El toggle JSON garantiza que ningún campo raro quede
  ineditable mientras el form madura.
```
