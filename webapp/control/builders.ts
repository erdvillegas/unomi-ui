import Panel from "sap/m/Panel";
import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import Toolbar from "sap/m/Toolbar";
import ToolbarSpacer from "sap/m/ToolbarSpacer";
import Select from "sap/m/Select";
import ComboBox from "sap/m/ComboBox";
import Item from "sap/ui/core/Item";
import Input from "sap/m/Input";
import CheckBox from "sap/m/CheckBox";
import Label from "sap/m/Label";
import Button from "sap/m/Button";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import { refFor } from "unomi/ui/control/refMap";
import { refSelect } from "unomi/ui/control/refSelect";

// Shared recursive editor for Unomi's typed Condition/Action trees. Both use the
// same node shape ({ type, parameterValues }) and the same parameter model coming
// from /definitions/*; only the type catalog differs. ponytail: full re-render of
// the root on structural change (small hand-built trees), one refresh callback.

// Label + control on one line — shared by the guided source/export editors.
export const row = (label: string, ctrl: Control): HBox =>
	new HBox({ alignItems: "Center", items: [new Label({ text: label, width: "10rem" }), ctrl] }).addStyleClass("sapUiTinyMarginBottom");

export interface Param { id: string; type: string; multivalued: boolean; }
export interface Node { type: string; parameterValues: Record<string, any>; }
export interface Defs {
	cond: Record<string, Param[]>; condTypes: string[]; condTags: Record<string, string[]>;
	action: Record<string, Param[]>; actionTypes: string[];
}
export const emptyDefs = (): Defs => ({ cond: {}, condTypes: [], condTags: {}, action: {}, actionTypes: [] });

// Unomi's standard comparison operators — no live endpoint exposes them (500).
const OPERATORS = ["equals", "notEquals", "greaterThan", "greaterThanOrEqualTo", "lessThan",
	"lessThanOrEqualTo", "between", "exists", "missing", "contains", "startsWith", "endsWith",
	"matchesRegex", "in", "notIn", "all", "hasSomeOf", "hasNoneOf", "isDay", "isNotDay"];

let cache: Defs | null = null;
export async function loadDefs(): Promise<Defs> {
	if (cache) {
		return cache;
	}
	const [c, a] = await Promise.all([
		UnomiClient.getJson<Array<{ id: string; parameters: Param[] }>>("/definitions/conditions"),
		UnomiClient.getJson<Array<{ id: string; parameters: Param[] }>>("/definitions/actions")
	]);
	const cond: Record<string, Param[]> = {}, action: Record<string, Param[]> = {}, condTags: Record<string, string[]> = {};
	c.forEach((x) => { cond[x.id] = x.parameters || []; condTags[x.id] = (x as { systemTags?: string[] }).systemTags || []; });
	a.forEach((x) => (action[x.id] = x.parameters || []));
	cache = { cond, condTypes: Object.keys(cond).sort(), condTags, action, actionTypes: Object.keys(action).sort() };
	return cache;
}

export const emptyCondition = (): Node => ({ type: "matchAllCondition", parameterValues: {} });

export function conditionPanel(node: Node, defs: Defs, refresh: () => void, onRemove?: () => void): Panel {
	return typedPanel(node, defs.condTypes, defs.cond, defs, refresh, onRemove);
}
function actionPanel(node: Node, defs: Defs, refresh: () => void, onRemove?: () => void): Panel {
	return typedPanel(node, defs.actionTypes, defs.action, defs, refresh, onRemove);
}

function typedPanel(node: Node, typeIds: string[], defmap: Record<string, Param[]>, defs: Defs, refresh: () => void, onRemove?: () => void): Panel {
	// Searchable type picker: 100+ condition/action types, so type-ahead beats a plain
	// dropdown. Only a real type id (from the list) is accepted, then params reset.
	const sel = new ComboBox({ selectedKey: node.type, width: "22rem" });
	typeIds.forEach((t) => sel.addItem(new Item({ key: t, text: t })));
	const apply = (key: string): void => { if (key && key !== node.type && typeIds.indexOf(key) >= 0) { node.type = key; node.parameterValues = {}; refresh(); } };
	sel.attachSelectionChange((e: Event) => apply(((e.getParameter("selectedItem" as never) as Item)?.getKey()) || ""));
	sel.attachChange(() => apply(sel.getSelectedKey()));
	const header = new Toolbar({ content: [new Label({ text: "type" }), sel, new ToolbarSpacer()] });
	if (onRemove) {
		header.addContent(new Button({ icon: "sap-icon://decline", tooltip: "Remove", press: onRemove }));
	}
	const body = new VBox().addStyleClass("sapUiSmallMarginBegin");
	renderParams(node, defmap[node.type] || [], defs, refresh, body);
	return new Panel({ headerToolbar: header, content: [body] }).addStyleClass("sapUiSmallMarginTop");
}

function renderParams(node: Node, params: Param[], defs: Defs, refresh: () => void, body: VBox): void {
	params.forEach((p) => {
		const nested = p.type.toLowerCase() === "condition"; // "Condition" (cond) or "condition" (action)
		const refKey = refFor(node.type, p.id); // scope/listIdentifiers/eventType/… → picker
		if (nested && p.multivalued) {
			const arr = (node.parameterValues[p.id] ??= []) as Node[];
			body.addItem(new Label({ text: p.id, design: "Bold" }));
			const box = new VBox().addStyleClass("sapUiSmallMarginBegin");
			arr.forEach((child, i) => box.addItem(conditionPanel(child, defs, refresh, () => { arr.splice(i, 1); refresh(); })));
			body.addItem(box);
			body.addItem(new Button({ text: `+ ${p.id}`, icon: "sap-icon://add", press: () => { arr.push(emptyCondition()); refresh(); } }));
		} else if (nested) {
			const child = (node.parameterValues[p.id] ??= emptyCondition()) as Node;
			body.addItem(new Label({ text: p.id, design: "Bold" }));
			body.addItem(conditionPanel(child, defs, refresh));
		} else if (p.type === "comparisonOperator") {
			const sel = new Select({ selectedKey: (node.parameterValues[p.id] as string) || "" });
			OPERATORS.forEach((o) => sel.addItem(new Item({ key: o, text: o })));
			sel.attachChange(() => (node.parameterValues[p.id] = sel.getSelectedKey()));
			body.addItem(new Label({ text: p.id }));
			body.addItem(sel);
		} else if (p.type === "properties") {
			body.addItem(new Label({ text: p.id, design: "Bold" }));
			body.addItem(keyValueBox((node.parameterValues[p.id] ??= {}) as Record<string, any>, refresh));
		} else if (p.type === "boolean") {
			const cb = new CheckBox({ text: p.id, selected: !!node.parameterValues[p.id] });
			cb.attachSelect(() => (node.parameterValues[p.id] = cb.getSelected()));
			body.addItem(cb);
		} else if (refKey) {
			body.addItem(new Label({ text: p.id }));
			body.addItem(refSelect(refKey, node.parameterValues[p.id], p.multivalued, (val) => (node.parameterValues[p.id] = val)));
		} else {
			const v = node.parameterValues[p.id];
			const shown = p.multivalued ? (Array.isArray(v) ? v.join(", ") : "") : (v == null ? "" : String(v));
			const input = new Input({ value: shown, type: p.type === "integer" ? "Number" : "Text" });
			input.attachChange(() => (node.parameterValues[p.id] = coerce(input.getValue(), p)));
			body.addItem(new Label({ text: p.multivalued ? `${p.id} (coma)` : p.id }));
			body.addItem(input);
		}
	});
}

// Free key/value map editor (action `properties` param, profile properties, ...).
// ponytail: value coercion via JSON.parse preserves numbers/booleans/objects
// (nbOfVisits stays a number); a bare word that fails to parse stays a string.
// Labeled inputs for Unomi's known/native profile property definitions, bound to
// the profile's `properties` map by id. Boolean → CheckBox, integer → number Input,
// everything else → text Input. Missing values render empty so the user can fill them.
export interface NativeProp { id: string; name?: string; valueTypeId?: string | null; }
export function nativePropsBox(map: Record<string, any>, defs: NativeProp[]): VBox {
	const box = new VBox().addStyleClass("sapUiSmallMarginBegin");
	defs.forEach((d) => {
		const label = new Label({ text: d.name || d.id, width: "35%", tooltip: d.id });
		let field: Control;
		if (d.valueTypeId === "boolean") {
			const cb = new CheckBox({ selected: !!map[d.id] });
			cb.attachSelect(() => (map[d.id] = cb.getSelected()));
			field = cb;
		} else {
			const isInt = d.valueTypeId === "integer";
			const inp = new Input({ value: map[d.id] == null ? "" : String(map[d.id]), type: isInt ? "Number" : "Text", width: "60%" });
			inp.attachChange(() => { const v = inp.getValue(); if (v === "") { delete map[d.id]; } else { map[d.id] = isInt ? Number(v) : v; } });
			field = inp;
		}
		box.addItem(new HBox({ items: [label, field] }).addStyleClass("sapUiTinyMarginBottom"));
	});
	return box;
}

export function keyValueBox(map: Record<string, any>, refresh: () => void, exclude?: Set<string>): VBox {
	const box = new VBox().addStyleClass("sapUiSmallMarginBegin");
	Object.keys(map).filter((k) => !exclude?.has(k)).forEach((k) => {
		const cur = map[k];
		const key = new Input({ value: k, width: "35%" });
		const val = new Input({ value: typeof cur === "object" ? JSON.stringify(cur) : String(cur ?? ""), width: "50%" });
		key.attachChange(() => { const nk = key.getValue(); if (nk !== k) { map[nk] = map[k]; delete map[k]; refresh(); } });
		val.attachChange(() => (map[key.getValue()] = parseValue(val.getValue())));
		box.addItem(new HBox({ items: [key, val, new Button({ icon: "sap-icon://decline", press: () => { delete map[k]; refresh(); } })] }).addStyleClass("sapUiTinyMarginBottom"));
	});
	box.addItem(new Button({ text: "+", icon: "sap-icon://add", press: () => { let i = 1; while (("key" + i) in map) { i++; } map["key" + i] = ""; refresh(); } }));
	return box;
}

function parseValue(s: string): unknown {
	try {
		return JSON.parse(s);
	} catch {
		return s;
	}
}

function coerce(v: string, p: Param): unknown {
	if (p.multivalued) {
		const parts = v.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
		return p.type === "integer" ? parts.map(Number) : parts;
	}
	if (v === "") {
		return undefined;
	}
	return p.type === "integer" ? Number(v) : v;
}

// Used by ItemDetail to render a scoring element (condition + integer value).
// condEditor lets the caller inject the BRM visual editor; falls back to the raw tree.
export function elementPanel(el: { condition?: Node; value?: number }, defs: Defs, refresh: () => void, onRemove: () => void, condEditor?: (node: Node, refresh: () => void) => Control): Panel {
	el.condition ??= emptyCondition();
	const value = new Input({ value: String(el.value ?? 0), type: "Number", width: "8rem" });
	value.attachChange(() => (el.value = Number(value.getValue()) || 0));
	const header = new Toolbar({ content: [new Label({ text: "value" }), value, new ToolbarSpacer(), new Button({ icon: "sap-icon://decline", tooltip: "Remove", press: onRemove })] });
	const editor = condEditor ? condEditor(el.condition, refresh) : conditionPanel(el.condition, defs, refresh);
	const body = new VBox({ items: [new Label({ text: "condition", design: "Bold" }), editor] }).addStyleClass("sapUiSmallMarginBegin");
	return new Panel({ headerToolbar: header, content: [body] }).addStyleClass("sapUiSmallMarginTop");
}

// A collection of controls hosting an array of actions with add/remove.
export function actionsList(arr: Node[], defs: Defs, refresh: () => void): Control[] {
	const items: Control[] = arr.map((a, i) => actionPanel(a, defs, refresh, () => { arr.splice(i, 1); refresh(); }));
	items.push(new Button({ text: "+ action", icon: "sap-icon://add", press: () => { arr.push({ type: defs.actionTypes[0], parameterValues: {} }); refresh(); } }));
	return items;
}
