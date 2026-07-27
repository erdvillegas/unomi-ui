# Plan: cliente UI para Apache Unomi con OpenUI5

## Contexto

`docs/openapi.json` es la API REST de **Apache Unomi** (CDP), OpenAPI 3.0.1:
- Servidor: `http://localhost:8181/cxs`
- 121 endpoints, 73 esquemas
- Sin `securitySchemes` en el spec → en la práctica usa **HTTP Basic Auth**

## Decisiones (confirmadas)

| Tema | Decisión |
|------|----------|
| Framework | **OpenUI5 + TypeScript** con `ui5-tooling` |
| Auth | **Basic Auth** (`karaf`/`karaf` por defecto). Login guarda el header `Authorization: Basic …` en un JSONModel de sesión (memoria, no localStorage) |
| Modelo de datos | **JSONModel + `UnomiClient.ts`**, no `ODataModel` (Unomi no es OData; las búsquedas son `POST .../search` o `.../query` con un `Query`/`Condition` en el body) |
| Paginación | Server-side vía los envelopes `PartialList*` (`list`, `totalSize`, `offset`, `pageSize`); `sap.m.Table` con growing |
| Editor de condiciones | Fase 1: **JSON crudo en `CodeEditor`**. Editor visual de árbol → fase 3 |

## Alcance por prioridad

121 endpoints es demasiado para un primer entregable. Se cubren los recursos que un
operador de CDP realmente usa, en este orden:

1. **Profiles / Sessions** (27 endpoints) — buscar, detalle, propiedades, sesiones, aliases, segmentos. El corazón.
2. **Segments** (8) — listar, ver, contar, "impacted".
3. **Rules** (7) — listar, ver, estadísticas.
4. **Definitions** (14) — actions / conditions / values, en modo lectura (alimentan los editores de otros recursos).
5. **Scoring, Goals, Campaigns, Lists, Scopes** — CRUD estándar, mismo patrón que Segments.

Fase 2 (diferido): Privacy, import/export, cluster, patches, geonames, jsonSchema.

## Arquitectura objetivo

```
webapp/
  manifest.json           # app descriptor: dataSource -> /cxs (proxy), rutas, modelos
  Component.ts
  service/UnomiClient.ts  # única capa que habla con /cxs (auth, errores, POST query -> PartialList)
  controller/             # un controller por vista
  view/                   # XML views (App, ProfileList, ProfileDetail, SegmentList, ...)
  i18n/
```

## Fases entregables

| Fase | Contenido | Valor | Estado |
|------|-----------|-------|--------|
| 0 | Scaffold `ui5 init` + `UnomiClient` + login + `GET /test/ping` verde | la app arranca contra Unomi | ✅ hecho |
| 1 | Profiles: búsqueda, detalle, sesiones/eventos | uso real inmediato | ✅ hecho |
| 2 | Segments + Rules (lectura + delete), definitions como catálogo | operación diaria | ✅ hecho |
| 3 | CRUD Scoring/Goals/Campaigns + editor visual de condiciones | paridad de gestión | ✅ hecho |

Fase 3 extendió los genéricos `MetadataList`/`ItemDetail` a Scoring/Goals/Campaigns y
convirtió el detalle en editor: JSON editable + `Save` (POST) + `New` (create) + `Delete`,
sobre las 5 entidades (Segments, Rules, Scoring, Goals, Campaigns).
`ponytail:` create/edit reusa el mismo POST (upsert); validación = `JSON.parse` antes de enviar.

**Editor visual de condiciones** (`ConditionBuilder`): árbol recursivo generado desde
`/definitions/conditions` (33 tipos). Cada nodo = `Select` de tipo + inputs por parámetro
según su `type` (string/integer/date → Input, comparisonOperator → Select, boolean →
CheckBox, `Condition` → nodo anidado; multivalued `Condition` → lista con add/remove).
Render programático (XML no hace recursión). Lanzado con el botón *Condition* desde el
detalle de Segments/Rules (las 2 entidades con `condition` de nivel superior).
`ponytail:` re-render completo del árbol en cada cambio estructural (árboles pequeños);
operadores hardcodeados (no hay endpoint, da 500); multivalued escalar = input coma-separado.

Fase 2 añadió shell `sap.tnt.ToolPage` con side-nav, guard de auth centralizado en
`BaseController.requireAuth()`, y dos vistas genéricas reutilizadas por ruta:
`MetadataList` (Segments/Rules) e `ItemDetail` (JSON crudo + delete + stats de rules).
El detalle muestra el objeto completo como JSON — puente hacia el editor visual de fase 3.

### Fase 0 concreta

1. `ui5 init` + estructura `webapp/`, tipos `@openui5/types`
2. `service/UnomiClient.ts` — baseURL, Basic Auth, helper `queryList()` para `POST → PartialList`
3. `manifest.json` con dataSource + `ui5-middleware-simpleproxy` para `/cxs`
4. Vista de login + verificación con `GET /test/ping`

## Riesgos

- **CORS (#1):** UI dev server y Unomi (`:8181`) en puertos distintos → el navegador bloquea.
  Se resuelve con proxy del `ui5-middleware` (dev) y reverse-proxy (prod). Sin esto, la fase 0 no arranca.
- **Editor de condiciones:** Segments/Rules/Scoring usan árboles de `Condition` tipados por
  `/definitions/conditions`. Es el componente difícil; se pospone a fase 3 con JSON crudo como puente.
