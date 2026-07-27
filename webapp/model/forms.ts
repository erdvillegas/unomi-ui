import { Field } from "unomi/ui/control/FormEngine";

// Native-form field configs per resource. `metadata.id`/`scope` are identity —
// editable only on create. Condition fields use the visual builder; nested arrays
// (rule actions, scoring elements) stay in the "Advanced JSON" panel for now.
export function formFields(res: string, isNew: boolean): Field[] {
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
