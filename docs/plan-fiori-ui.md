# Plan — Adoptar patrones (floorplans) de SAP Fiori

## Punto de partida (qué YA es Fiori)

- **Tema**: `sap_horizon` — es la generación **actual** de Fiori. No hay que cambiar de tema.
- **Shell**: `sap.tnt.ToolPage` + `SideNavigation` — patrón Fiori válido ("Tool layout").
- **Home**: tiles `GenericTile` estilo Launchpad — correcto.

O sea: el *look* ya es Fiori/Horizon. Lo que falta son los **floorplans**
canónicos en listas y detalles, hoy resueltos con `sap.m.Page` + `Panel`
apilados y navegación a página completa.

> Nota: `webapp/view/App.view.xml` tiene un `<f:DynamicPage>` roto con "Hola
> Mundo" encima del `ToolPage`. Es el tanteo que dio nombre a esta rama. La
> Fase 0 lo limpia.

## Alcance y no-alcance

- **Sin dependencias nuevas de runtime.** Todo sale de librerías UI5 stock
  (`sap.f`, `sap.uxap`), declaradas en `manifest.json`. Se mantiene deps: {}.
- **No** tocamos `UnomiClient`, modelos ni lógica de datos. Es re-layout de
  vistas + (fase opcional) routing.
- **No** adoptamos `sap.ui.comp` (SmartTable/SmartFilterBar): arrastra OData y
  peso; no encaja con el patrón JSONModel + POST/query de este proyecto.

## Fases (de más barato a más caro; parar donde aporte)

### Fase 0 — Limpieza (imprescindible, ~10 min)
- Quitar el `<f:DynamicPage>` roto de `App.view.xml`. Deja solo el `ToolPage`.
- `npm run typecheck` + arranque local para confirmar que nada dependía de él.

### Fase 1 — List Report floorplan en las listas (alto valor / bajo costo)
Migrar las vistas de lista a `sap.f.DynamicPage`:
- `DynamicPageTitle`: título + `ObjectNumber`/KPIs (p. ej. total de perfiles) +
  `actions` (botones globales) a la derecha.
- `DynamicPageHeader` (colapsable con el snap): el área de filtro. Para este
  proyecto basta el `SearchField` + el constructor de condiciones ya existente
  (mover el `Panel` "query.builder" aquí), **no** hace falta `SmartFilterBar`.
- Contenido: la `Table` responsiva actual con `growing="true"`
  `growingScrollToLoad="true"` en vez del footer "loadMore" manual.

Vistas afectadas: `ProfileList`, `EventList`, `MetadataList` (segments, rules,
scoring, goals, campaigns, lists, scopes, properties — todas comparten esta
vista), `ConfigIO`, `DefinitionCatalog`, `Queries`.
Empezar por `ProfileList` como referencia y replicar.

### Fase 2 — Object Page floorplan en los detalles (alto valor / costo medio)
Migrar las vistas de detalle a `sap.uxap.ObjectPageLayout`:
- Añadir `sap.uxap` a `manifest.json > sap.ui5.dependencies.libs`.
- `ObjectPageHeader`/`ObjectPageDynamicHeaderTitle`: título (email/itemId),
  `ObjectStatus` de estado, acciones globales (Guardar, Anonimizar…).
- Cada `Panel` de hoy pasa a ser un `ObjectPageSection`/`SubSection` con
  **anchor bar** para saltar entre secciones.

Vistas afectadas: `ProfileDetail` (propiedades, consentimientos, alias,
privacidad, segmentos, sesiones, eventos → secciones), `ItemDetail`,
`EventDetail`, `Info`.

### Fase 3 — Flexible Column Layout (OPCIONAL — la más "Fiori", la más cara)
> **Recomendación: no hacerla salvo que se pida explícitamente.**
Reemplaza la navegación lista→detalle a página completa por
`sap.f.FlexibleColumnLayout` (dos/tres columnas master-detail).

Costo real: reescribir el `routerClass` a `sap.f.routing.Router`, cambiar
`manifest.json` (targets con `controlAggregation` por columna), y adaptar
`App.controller`/rutas de todos los pares list/detail. Es un cambio
estructural de routing, no de vista.

Aporta: contexto master+detail lado a lado. Para un CDP de administración el
valor es real pero acotado; el patrón actual (lista → detalle) ya es válido en
Fiori. **Fase 3 solo si el usuario quiere el layout de dos columnas.**

### Fase 4 — ShellBar (opcional, cosmético)
Cambiar `ToolHeader` por `sap.f.ShellBar` (búsqueda global, menú de usuario,
avatar) para el look Launchpad completo. Bajo valor funcional; hacerlo solo si
se busca la estética exacta del FLP.

## Orden de ejecución sugerido
Fase 0 → 1 (ProfileList primero, luego el resto) → 2. Parar ahí y evaluar.
3 y 4 quedan como opt-in explícito.

## Verificación por fase
- `npm run typecheck` (las vistas XML no compilan, pero los controllers sí).
- `npm test` (83 tests; el layout no debería romper unit tests de servicio/lógica).
- Arranque local (`npm start`, :8090) y revisión visual de una vista por fase.

## Estimación
- Fase 0: ~10 min · Fase 1: ~medio día (una vista de referencia + réplicas) ·
  Fase 2: ~medio día · Fase 3: ~1–1.5 días (routing) · Fase 4: ~1–2 h.

## Decisión pendiente
¿Incluimos la **Fase 3 (Flexible Column Layout)**? Es lo que más cambia la
sensación a "Fiori de dos columnas", pero es la única fase que toca routing y
arquitectura. Sin ella, Fases 0–2 ya dejan la UI en floorplans Fiori
canónicos.
