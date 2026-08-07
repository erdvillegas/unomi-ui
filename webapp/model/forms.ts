import { Field } from "unomi/ui/control/FormEngine";

// Native-form field configs per resource. `metadata.id`/`scope` are identity —
// editable only on create. Condition fields use the visual builder; nested arrays
// (rule actions, scoring elements) stay in the "Advanced JSON" panel for now.
export function formFields(res: string, isNew: boolean): Field[] {
	if (res === "importConfig" || res === "exportConfig") {
		return configFields(res, isNew);
	}
	const meta: Field[] = [
		{ path: "metadata.id", label: "ID", type: "text", readonly: !isNew },
		{ path: "metadata.name", label: "Name", type: "text" },
		{ path: "metadata.description", label: "Description", type: "textarea" },
		{ path: "metadata.scope", label: "Scope", type: "text", readonly: !isNew },
		{ path: "metadata.tags", label: "Tags", type: "tokens" },
		{ path: "metadata.enabled", label: "Enabled", type: "switch" }
	];
	const extra: Record<string, Field[]> = {
		rules: [
			{ path: "priority", label: "Priority", type: "int" },
			{ path: "raiseEventOnlyOnce", label: "Raise event only once", type: "switch" },
			{ path: "raiseEventOnlyOnceForProfile", label: "Only once per profile", type: "switch" },
			{ path: "raiseEventOnlyOnceForSession", label: "Only once per session", type: "switch" }
		],
		goals: [
			{ path: "campaignId", label: "Campaign ID", type: "text" }
		],
		campaigns: [
			{ path: "startDate", label: "Start date", type: "datetime" },
			{ path: "endDate", label: "End date", type: "datetime" },
			{ path: "cost", label: "Cost", type: "float" },
			{ path: "currency", label: "Currency", type: "text" },
			{ path: "primaryGoal", label: "Primary goal", type: "text" },
			{ path: "timezone", label: "Timezone", type: "text" }
		],
		properties: [
			{ path: "target", label: "Target", type: "text", readonly: !isNew },
			{ path: "valueTypeId", label: "Value type", type: "text" },
			{ path: "defaultValue", label: "Default value", type: "text" },
			{ path: "rank", label: "Rank", type: "float" },
			{ path: "multivalued", label: "Multivalued", type: "switch" }
		]
	};
	return [...meta, ...(extra[res] || [])];
}

// Import/Export configurations carry name/description at the root (no `metadata`).
function configFields(res: string, isNew: boolean): Field[] {
	const base: Field[] = [
		{ path: "itemId", label: "ID", type: "text", readonly: !isNew },
		{ path: "name", label: "Name", type: "text" },
		{ path: "description", label: "Description", type: "textarea" },
		{ path: "configType", label: "Config type", type: "select", options: [{ key: "oneshot", text: "oneshot" }, { key: "recurrent", text: "recurrent" }] },
		{ path: "columnSeparator", label: "Column separator", type: "text" },
		{ path: "lineSeparator", label: "Line separator", type: "text" },
		{ path: "multiValueSeparator", label: "Multi-value separator", type: "text" },
		{ path: "multiValueDelimiter", label: "Multi-value delimiter", type: "text" },
		{ path: "active", label: "Active", type: "switch" }
	];
	if (res === "exportConfig") {
		base.unshift({ path: "", label: "", type: "help", html: EXPORT_HELP });
	}
	if (res === "importConfig") {
		base.unshift({ path: "", label: "", type: "help", html: IMPORT_HELP });
		base.push(
			{ path: "hasHeader", label: "Has header row", type: "switch" },
			{ path: "hasDeleteColumn", label: "Has delete column", type: "switch" },
			{ path: "overwriteExistingProfiles", label: "Overwrite existing profiles", type: "switch" },
			{ path: "mergingProperty", label: "Merging property", type: "text" }
		);
	}
	return base;
}

// Form help. Recurrent needs `properties.source` (edited in the Advanced JSON panel).
const IMPORT_HELP =
	"<p><strong>Config type</strong>: <code>oneshot</code> importa una vez el CSV que subes; " +
	"<code>recurrent</code> sondea periódicamente un origen y lo importa solo.</p>" +
	"<p>Para <strong>recurrent</strong> define <code>properties.source</code> (panel <em>Advanced JSON</em>). " +
	"Soporta <code>ftp</code>, <code>sftp</code>, <code>ftps</code> y <code>file</code>. " +
	"Ej.: <code>file:///tmp/?fileName=profiles.csv&amp;move=.done&amp;consumer.delay=20000</code>.</p>" +
	"<ul><li><code>fileName=...</code> o <code>include=.*.csv</code> para consumir todos los CSV.</li>" +
	"<li><code>consumer.delay</code>: frecuencia de sondeo (<code>20000</code> ms, <code>20s</code> o <code>2h30m10s</code>).</li>" +
	"<li><code>move</code>: carpeta donde se mueven los archivos procesados (por defecto <code>.camel</code>).</li></ul>" +
	"<p>El sondeo inicia solo si <strong>Active</strong> está encendido. El <code>mapping</code> (propiedad → índice de columna) también se edita en el panel JSON.</p>";

const EXPORT_HELP =
	"<p><strong>Config type</strong>: <code>oneshot</code> exporta una vez; " +
	"<code>recurrent</code> exporta periódicamente según <code>period</code>.</p>" +
	"<ul><li><strong>segment</strong>: el segmento cuyos perfiles se exportan.</li>" +
	"<li><strong>period</strong>: cada cuánto se ejecuta si es recurrent (ej. <code>2m30s</code>, <code>30s</code>, <code>1h</code>).</li></ul>" +
	"<p>El <code>mapping</code> va <em>al revés</em> que en importación: <code>índice de columna → propiedad</code>, " +
	"ej. <code>\"0\": \"firstName\"</code> (panel <em>Advanced JSON</em>).</p>";
