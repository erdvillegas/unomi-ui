# Plan — Import / Export Config page

Reemplaza las dos entradas genéricas `importConfig` / `exportConfig` (hoy listas
crudas → JSON en `ItemDetail`) por **una página con controles reales**, en tabs.

## Alcance

Una vista `ConfigIO` con un `IconTabBar` de dos filtros: **Import** y **Export**.
Cada tab: un panel de *acción directa* (oneshot) arriba + una tabla de
*configuraciones guardadas* (recurrentes) abajo con edit/delete.

Fuera de alcance (por ahora): historial de `executions`, polling de `status`,
scheduling del router de Unomi (los imports recurrentes leen de un directorio del
contenedor, no vía REST — la UI solo administra la config).

## Contrato API (de openapi.json — el spec es poco fiable, ver Fase 0)

| Acción | Método | Entrada | Salida |
|---|---|---|---|
| Export perfiles ya | `POST /profiles/export` | `Query` (segmento/condición) | `text/csv` |
| Export oneshot | `POST /exportConfiguration/oneshot` | `ExportConfiguration` | `text/csv` |
| Import oneshot | `POST /importConfiguration/oneshot` | multipart (CSV + config) | JSON resultado |
| List/CRUD import | `GET/POST /importConfiguration`, `GET/DELETE /importConfiguration/{id}` | `ImportConfiguration` | ídem |
| List/CRUD export | `GET/POST /exportConfiguration`, `GET/DELETE /exportConfiguration/{id}` | `ExportConfiguration` | ídem |

Campos clave de ambas configs: `name`, `configType`, `columnSeparator`,
`lineSeparator`, `multiValueSeparator`, `multiValueDelimiter`, `hasHeader`,
`active`. Import añade: `mergingProperty`, `overwriteExistingProfiles`,
`propertiesToOverwrite`, `hasDeleteColumn`, y `properties` (mapeo columna→propiedad).

## Fase 0 — verificar contra el contenedor vivo (antes de codear)

El spec lista los campos multipart del import oneshot **vacíos**. Verificar:
- Nombres reales de las partes multipart (`file`? `config`?) — `curl -F` contra
  `/cxs/importConfiguration/oneshot` y leer el error/resultado.
- Si `properties` (mapeo de columnas) es obligatorio para que importe algo.
- Que `/profiles/export` con un `Query{condition}` devuelve CSV con `karaf:karaf`.

Salida: una nota de "shapes verificadas" al pie de este plan.

### Fase 0 — verificado (2026-07-28, contenedor unomi 3.0.0)

- `POST /profiles/export` `{condition}` → **200 `text/csv`**, sep `;`, header
  `Content-Disposition: attachment; filename=Profiles_export_<ts>.csv`. ✅
- Import oneshot es multipart **`importConfigId` + `file`**; requiere una
  `ImportConfiguration` **ya guardada** (sin `importConfigId` → 400 "No multipart
  with content id importConfigId found"). Devuelve 200 body vacío. ✅
- `ImportConfiguration.properties.mapping` = `{ "<colIndex>": "<propertyName>" }`
  (aceptado al guardar). `columnSeparator/lineSeparator/mergingProperty/hasHeader`
  se guardan tal cual. Listas de configs vacías por defecto.
- **Pendiente F3**: con el mapping probado el oneshot no reflejó el perfil (import
  async vía camel router); afinar dirección de `mapping`/`mergingProperty` y si
  requiere `active:true` cuando se construya la UI de import.

## Fase 1 — extender UnomiClient (base para todo lo demás)

`ponytail:` solo lo mínimo que JSON no cubre:
- `getBlob(path)` / `postForCsv(path, body)` → `Response` cuyo `.blob()` se
  descarga. Reusa `request()` (ya mete el header Basic — un `<a download>` no).
- `postForm(path, form: FormData)` → NO setear `Content-Type` (el browser pone el
  boundary). Hoy `request()` fuerza `application/json` si hay body → añadir escape
  para `FormData`.
- Helper `downloadBlob(blob, filename)` (crea `<a>`, `URL.createObjectURL`, click,
  revoke). 6 líneas, sin dependencia.

Check: un `demo()`/assert de que `downloadBlob` arma el nombre y revoca el URL.

## Fase 2 — Export (el más barato: JSON entra, CSV sale)

Tab Export:
- **Exportar ahora**: selector de fuente = segmento (reusa catálogo `/segments`) o
  condición cruda (reusa `conditionPanel`/CodeEditor). Botón → `POST /profiles/export`
  con `{condition}` → `downloadBlob(csv, "profiles.csv")`.
- Tabla de export configs guardadas (`GET /exportConfiguration`) con delete.

Entregable visible: descargar un CSV de perfiles filtrados por segmento.

## Fase 3 — Import (necesita Fase 0 resuelta)

Tab Import:
- `sap.ui.unified.FileUploader` para el CSV (acepta `.csv`).
- Campos de config: separadores, `hasHeader`, `mergingProperty`,
  `overwriteExistingProfiles`. Mapeo `properties` → primero **JSON crudo** en
  CodeEditor (`ponytail:` marca dónde vive el builder visual futuro).
- Botón Import → arma `FormData` con las partes verificadas en Fase 0 →
  `postForm(/importConfiguration/oneshot)` → muestra el JSON resultado (nº perfiles).
- Tabla de import configs guardadas con delete.

## Fase 4 — CRUD de configs guardadas (recurrentes)

Formulario de edición (reemplaza el `ItemDetail` JSON crudo para estos dos tipos):
los mismos campos que Fase 3 + `active`, `name`, `scope`. Save → `POST` al endpoint.
Editar = cargar `GET /{id}` en el mismo form.

## Cableado

- `manifest.json`: rutas `importConfig`/`exportConfig` ya existen → apuntarlas al
  nuevo target `configIO` (una sola vista con tab preseleccionado por `key`), o
  colapsar a una ruta `config`. Quitar los `*Detail` genéricos de estos dos.
- `App.view.xml`: los dos items del menú ya existen — dejarlos, ambos abren la
  página con el tab correspondiente.
- i18n: labels de campos.

## Orden de trabajo

Fase 0 → 1 → 2 (entregable exportar) → 3 (entregable importar) → 4 (recurrentes).
Cada fase deja algo usable; parar en la 2 ya da valor si el import se posterga.
