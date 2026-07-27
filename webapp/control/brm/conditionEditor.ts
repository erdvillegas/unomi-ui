import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import Panel from "sap/m/Panel";
import Toolbar from "sap/m/Toolbar";
import ToolbarSpacer from "sap/m/ToolbarSpacer";
import Select from "sap/m/Select";
import ComboBox from "sap/m/ComboBox";
import MultiComboBox from "sap/m/MultiComboBox";
import MenuButton from "sap/m/MenuButton";
import Menu from "sap/m/Menu";
import MenuItem from "sap/m/MenuItem";
import Item from "sap/ui/core/Item";
import Input from "sap/m/Input";
import MultiInput from "sap/m/MultiInput";
import Token from "sap/m/Token";
import Switch from "sap/m/Switch";
import DateTimePicker from "sap/m/DateTimePicker";
import Button from "sap/m/Button";
import Label from "sap/m/Label";
import Text from "sap/m/Text";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import { Node, Defs, Param, conditionPanel, emptyCondition } from "unomi/ui/control/builders";

// BRM-style visual editor: AND/OR/NOT groups + "property → operator → value" rows.
// Rows map to profile/session PropertyCondition; anything else falls back to the
// technical tree (builders.ts) without data loss.

export interface PropDef { id: string; name: string; valueTypeId: string | null; }
export interface Opt { id: string; name: string; }
type Target = "profile" | "session" | "event";
export interface BrmCtx { defs: Defs; props: Record<Target, PropDef[]>; cat: { segments: Opt[]; scorings: Opt[]; lists: Opt[] }; }

export const emptyCat = (): BrmCtx["cat"] => ({ segments: [], scorings: [], lists: [] });

const ROW_TYPE: Record<Target, string> = { profile: "profilePropertyCondition", session: "sessionPropertyCondition", event: "eventPropertyCondition" };
const TARGET_OF: Record<string, Target> = { profilePropertyCondition: "profile", sessionPropertyCondition: "session", eventPropertyCondition: "event" };
// Catalog properties live under `properties.` in the stored path; events are free-form.
const PREFIX: Record<Target, string> = { profile: "properties.", session: "properties.", event: "" };

// Ephemeral "edit this node as raw tree" flag, keyed by node identity so it
// survives full re-renders without polluting the saved Condition JSON.
const advanced = new WeakSet<object>();

const advBtn = (node: Node, refresh: () => void): Button => new Button({ icon: "sap-icon://syntax", tooltip: "Advanced (raw)", press: () => { advanced.add(node); refresh(); } });
const rmBtn = (onRemove: () => void): Button => new Button({ icon: "sap-icon://decline", tooltip: "Remove", press: onRemove });
const MATCH_TYPES: [string, string][] = [["in", "is in any of"], ["notin", "is not in"], ["all", "is in all of"]];
// Broad operator set for generic property-ish conditions (topic/aliases/userList props).
const BROAD_OPS = ["equals", "notEquals", "contains", "startsWith", "endsWith", "matchesRegex", "in", "notIn", "greaterThan", "greaterThanOrEqualTo", "lessThan", "lessThanOrEqualTo", "between", "exists", "missing"];

// "eventTypeCondition" -> "Event type"; "numberOfDays" -> "Number of days".
function friendly(s: string): string {
	const t = s.replace(/Condition$/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/\bId\b/g, "ID").trim();
	return t.charAt(0).toUpperCase() + t.slice(1);
}
function category(tags: string[]): string {
	if (tags.includes("logical")) { return "Logical"; }
	if (tags.includes("eventCondition")) { return "Event"; }
	if (tags.includes("sessionCondition")) { return "Session"; }
	if (tags.includes("aggregated")) { return "Aggregated"; }
	if (tags.includes("profileCondition")) { return "Profile"; }
	return "Other";
}
const isRow = (t: string) => t in TARGET_OF;
const isGroup = (t: string) => t === "booleanCondition" || t === "notCondition" || t === "matchAllCondition";

const OPS: Record<string, string[]> = {
	string: ["equals", "notEquals", "contains", "startsWith", "endsWith", "matchesRegex", "in", "notIn", "exists", "missing"],
	integer: ["equals", "notEquals", "greaterThan", "greaterThanOrEqualTo", "lessThan", "lessThanOrEqualTo", "between", "in", "notIn", "exists", "missing"],
	date: ["equals", "greaterThan", "greaterThanOrEqualTo", "lessThan", "lessThanOrEqualTo", "between", "exists", "missing"],
	boolean: ["equals", "exists", "missing"]
};
const OP_LABEL: Record<string, string> = {
	equals: "equals", notEquals: "not equals", contains: "contains", startsWith: "starts with",
	endsWith: "ends with", matchesRegex: "matches regex", in: "in", notIn: "not in",
	exists: "exists", missing: "is missing", greaterThan: "after / greater", greaterThanOrEqualTo: "≥",
	lessThan: "before / less", lessThanOrEqualTo: "≤", between: "between"
};
const VALUE_SLOTS = ["propertyValue", "propertyValues", "propertyValueInteger", "propertyValuesInteger", "propertyValueDate", "propertyValuesDate"];
const DATE_FMT = "yyyy-MM-dd'T'HH:mm:ss";
const isMulti = (op: string) => ["in", "notIn", "between", "all", "hasSomeOf", "hasNoneOf"].includes(op);
const noValue = (op: string) => op === "exists" || op === "missing";

let propsCache: BrmCtx["props"] | null = null;
export async function loadProps(): Promise<BrmCtx["props"]> {
	if (propsCache) {
		return propsCache;
	}
	const raw = await UnomiClient.getJson<Record<string, { valueTypeId?: string; metadata: { id: string; name?: string } }[]>>("/profiles/properties");
	const map = (arr?: { valueTypeId?: string; metadata: { id: string; name?: string } }[]): PropDef[] =>
		(arr || []).map((p) => ({ id: p.metadata.id, name: p.metadata.name || p.metadata.id, valueTypeId: p.valueTypeId || null }));
	// Event properties have no catalog endpoint → free-text picker (empty list).
	propsCache = { profile: map(raw.profiles), session: map(raw.sessions), event: [] };
	return propsCache;
}

// Segment / scoring / list catalogs for the picker-based condition rows.
let catCache: BrmCtx["cat"] | null = null;
export async function loadCatalogs(): Promise<BrmCtx["cat"]> {
	if (catCache) {
		return catCache;
	}
	const [segs, scos, lists] = await Promise.all([
		UnomiClient.getJson<{ id: string; name?: string }[]>("/segments"),
		UnomiClient.getJson<{ id: string; name?: string }[]>("/scoring"),
		UnomiClient.getJson<{ list: { id: string; name?: string }[] }>("/lists")
	]);
	const flat = (a: { id: string; name?: string }[]): Opt[] => (a || []).map((x) => ({ id: x.id, name: x.name || x.id }));
	catCache = { segments: flat(segs), scorings: flat(scos), lists: flat(lists.list || []) };
	return catCache;
}

export function conditionEditor(root: Node, ctx: BrmCtx, refresh: () => void): Control {
	if (!isGroup(root.type)) {
		const orig: Node = { type: root.type, parameterValues: root.parameterValues };
		root.type = "booleanCondition";
		root.parameterValues = { operator: "and", subConditions: [orig] };
	}
	return group(root, ctx, refresh);
}

// ---- Groups (booleanCondition and/or, notCondition = NONE) --------------------

function readGroup(node: Node): { mode: "all" | "any" | "none"; subs: Node[] } {
	if (node.type === "notCondition") {
		let inner = node.parameterValues.subCondition as Node | undefined;
		if (!inner || inner.type !== "booleanCondition") {
			inner = { type: "booleanCondition", parameterValues: { operator: "or", subConditions: inner ? [inner] : [] } };
			node.parameterValues.subCondition = inner;
		}
		return { mode: "none", subs: (inner.parameterValues.subConditions ??= []) as Node[] };
	}
	if (node.type === "booleanCondition") {
		return { mode: node.parameterValues.operator === "or" ? "any" : "all", subs: (node.parameterValues.subConditions ??= []) as Node[] };
	}
	return { mode: "all", subs: [] }; // matchAllCondition
}

function setGroupMode(node: Node, mode: string, subs: Node[]): void {
	if (mode === "none") {
		node.type = "notCondition";
		node.parameterValues = { subCondition: { type: "booleanCondition", parameterValues: { operator: "or", subConditions: subs } } };
	} else {
		node.type = "booleanCondition";
		node.parameterValues = { operator: mode === "any" ? "or" : "and", subConditions: subs };
	}
}

// "+ condition" menu: bespoke shortcuts on top, then every other condition type
// grouped by category (Event/Session/Profile/Aggregated/Logical/Other).
const MENU_EXCLUDE = new Set([ROW_TYPE.profile, ROW_TYPE.session, ROW_TYPE.event, "profileSegmentCondition", "profileUserListCondition", "scoringCondition", "booleanCondition", "notCondition", "matchAllCondition"]);
function buildAddMenu(add: (n: Node) => void, ctx: BrmCtx): Menu {
	const items: MenuItem[] = [
		new MenuItem({ text: "Property", icon: "sap-icon://user-edit", press: () => add({ type: ROW_TYPE.profile, parameterValues: {} }) }),
		new MenuItem({ text: "In segment", icon: "sap-icon://group", press: () => add({ type: "profileSegmentCondition", parameterValues: { matchType: "in", segments: [] } }) }),
		new MenuItem({ text: "Score", icon: "sap-icon://target-group", press: () => add({ type: "scoringCondition", parameterValues: { comparisonOperator: "greaterThanOrEqualTo" } }) }),
		new MenuItem({ text: "In list", icon: "sap-icon://list", press: () => add({ type: "profileUserListCondition", parameterValues: { matchType: "in", lists: [] } }) })
	];
	const byCat: Record<string, string[]> = {};
	ctx.defs.condTypes.forEach((t) => {
		if (MENU_EXCLUDE.has(t)) { return; }
		(byCat[category(ctx.defs.condTags[t] || [])] ??= []).push(t);
	});
	["Event", "Session", "Profile", "Aggregated", "Logical", "Other"].forEach((cat) => {
		const types = byCat[cat];
		if (!types) { return; }
		const sub = types.sort().map((t) => new MenuItem({ text: friendly(t), press: () => add({ type: t, parameterValues: {} }) }));
		items.push(new MenuItem({ text: cat, icon: "sap-icon://slim-arrow-right", items: sub }));
	});
	return new Menu({ items });
}

function group(node: Node, ctx: BrmCtx, refresh: () => void, onRemove?: () => void): Control {
	const g = readGroup(node);

	const modeSel = new Select({ selectedKey: g.mode, width: "8rem" });
	modeSel.addItem(new Item({ key: "all", text: "ALL of" }));
	modeSel.addItem(new Item({ key: "any", text: "ANY of" }));
	modeSel.addItem(new Item({ key: "none", text: "NONE of" }));
	modeSel.attachChange(() => { setGroupMode(node, modeSel.getSelectedKey(), g.subs); refresh(); });

	const add = (child: Node): void => {
		if (node.type === "matchAllCondition") { setGroupMode(node, g.mode, []); }
		readGroup(node).subs.push(child);
		refresh();
	};
	const header = new Toolbar({ content: [new Label({ text: "Match" }), modeSel, new ToolbarSpacer(),
		new MenuButton({ text: "+ condition", icon: "sap-icon://add", menu: buildAddMenu(add, ctx) }),
		new Button({ text: "+ group", icon: "sap-icon://add-folder", press: () => add({ type: "booleanCondition", parameterValues: { operator: "and", subConditions: [] } }) })
	] });
	if (onRemove) {
		header.addContent(new Button({ icon: "sap-icon://decline", tooltip: "Remove", press: onRemove }));
	}

	const body = new VBox().addStyleClass("sapUiSmallMarginBegin");
	if (g.subs.length === 0) {
		body.addItem(new Text({ text: "Matches everything — add a condition." }).addStyleClass("sapUiSmallMargin"));
	}
	g.subs.forEach((child, i) => body.addItem(childEditor(child, ctx, refresh, () => {
		g.subs.splice(i, 1);
		if (g.subs.length === 0) { node.type = "matchAllCondition"; node.parameterValues = {}; }
		refresh();
	})));
	return new Panel({ headerToolbar: header, content: [body] }).addStyleClass("sapUiSmallMarginTop");
}

function childEditor(node: Node, ctx: BrmCtx, refresh: () => void, onRemove: () => void): Control {
	if (advanced.has(node)) {
		return advancedWrap(node, ctx, refresh, onRemove);
	}
	if (isGroup(node.type)) {
		return group(node, ctx, refresh, onRemove);
	}
	if (isRow(node.type)) {
		return row(node, ctx, refresh, onRemove);
	}
	if (node.type === "profileSegmentCondition") {
		return membershipRow(node, ctx.cat.segments, "segments", "Segment", refresh, onRemove);
	}
	if (node.type === "profileUserListCondition") {
		return membershipRow(node, ctx.cat.lists, "lists", "List", refresh, onRemove);
	}
	if (node.type === "scoringCondition") {
		return scoreRow(node, ctx, refresh, onRemove);
	}
	return typedFieldsRow(node, ctx, refresh, onRemove); // generic def-driven row (all other types)
}

// "Profile is in segment/list [X, Y]" with a multi-select picker from the catalog.
function membershipRow(node: Node, opts: Opt[], slot: string, label: string, refresh: () => void, onRemove: () => void): Control {
	const pv = node.parameterValues;
	const matchSel = new Select({ selectedKey: (pv.matchType as string) || "in", width: "10rem" });
	MATCH_TYPES.forEach(([k, t]) => matchSel.addItem(new Item({ key: k, text: t })));
	matchSel.attachChange(() => (pv.matchType = matchSel.getSelectedKey()));
	const mcb = new MultiComboBox({ width: "24rem", placeholder: label.toLowerCase() + "s" });
	opts.forEach((o) => mcb.addItem(new Item({ key: o.id, text: o.name })));
	mcb.setSelectedKeys(((pv[slot] as string[]) || []).slice());
	mcb.attachSelectionChange(() => (pv[slot] = mcb.getSelectedKeys()));
	const box = new HBox({ wrap: "Wrap", alignItems: "Center", items: [new Label({ text: label, design: "Bold" }).addStyleClass("sapUiTinyMarginEnd"), matchSel, mcb] }).addStyleClass("sapUiTinyMarginBottom");
	box.addItem(new ToolbarSpacer());
	box.addItem(advBtn(node, refresh));
	box.addItem(rmBtn(onRemove));
	return box;
}

// "Score [plan] [op] [value]".
function scoreRow(node: Node, ctx: BrmCtx, refresh: () => void, onRemove: () => void): Control {
	const pv = node.parameterValues;
	const planSel = new ComboBox({ selectedKey: (pv.scoringPlanId as string) || "", value: (pv.scoringPlanId as string) || "", placeholder: "scoring plan", width: "14rem" });
	ctx.cat.scorings.forEach((s) => planSel.addItem(new Item({ key: s.id, text: s.name })));
	planSel.attachSelectionChange((e: Event) => { const it = e.getParameter("selectedItem" as never) as Item; if (it) { pv.scoringPlanId = it.getKey(); } });
	planSel.attachChange(() => (pv.scoringPlanId = planSel.getSelectedKey() || planSel.getValue()));
	const opSel = new Select({ selectedKey: (pv.comparisonOperator as string) || "greaterThanOrEqualTo", width: "9rem" });
	["equals", "greaterThan", "greaterThanOrEqualTo", "lessThan", "lessThanOrEqualTo"].forEach((o) => opSel.addItem(new Item({ key: o, text: OP_LABEL[o] || o })));
	opSel.attachChange(() => (pv.comparisonOperator = opSel.getSelectedKey()));
	const valInp = new Input({ value: pv.scoreValue == null ? "" : String(pv.scoreValue), type: "Number", width: "8rem", placeholder: "score" });
	valInp.attachChange(() => (pv.scoreValue = Number(valInp.getValue()) || 0));
	const box = new HBox({ wrap: "Wrap", alignItems: "Center", items: [new Label({ text: "Score", design: "Bold" }).addStyleClass("sapUiTinyMarginEnd"), planSel, opSel, valInp] }).addStyleClass("sapUiTinyMarginBottom");
	box.addItem(new ToolbarSpacer());
	box.addItem(advBtn(node, refresh));
	box.addItem(rmBtn(onRemove));
	return box;
}

// Raw tree editor (builders.ts) for a node, with a "back to visual" affordance.
function advancedWrap(node: Node, ctx: BrmCtx, refresh: () => void, onRemove: () => void): Control {
	const panel = conditionPanel(node, ctx.defs, refresh, onRemove);
	const bar = new Toolbar({ content: [new Button({ text: "◀ visual", icon: "sap-icon://tree", press: () => { advanced.delete(node); refresh(); } }), new ToolbarSpacer()] });
	return new VBox({ items: [bar, panel] }).addStyleClass("sapUiSmallMarginTop");
}

// Generic renderer for any condition, driven by its definition parameters.
// Zero params → a read-only event chip (F2). Otherwise a titled block of typed fields.
function typedFieldsRow(node: Node, ctx: BrmCtx, refresh: () => void, onRemove: () => void): Control {
	const params = ctx.defs.cond[node.type] || [];
	const head = new HBox({ alignItems: "Center", items: [new Label({ text: friendly(node.type), design: "Bold" }), new ToolbarSpacer(), advBtn(node, refresh), rmBtn(onRemove)] });
	if (params.length === 0) {
		return head.addStyleClass("sapUiTinyMarginBottom"); // event chip (no params)
	}
	const fields = new VBox().addStyleClass("sapUiSmallMarginBegin");
	params.forEach((p) => renderParam(p, node.parameterValues, ctx, refresh, fields));
	return new VBox({ items: [head, fields] }).addStyleClass("sapUiSmallMarginTop");
}

function labeled(text: string, ctrl: Control): HBox {
	return new HBox({ alignItems: "Center", items: [new Label({ text, width: "12rem" }), ctrl] }).addStyleClass("sapUiTinyMarginBottom");
}

function renderParam(p: Param, pv: Record<string, any>, ctx: BrmCtx, refresh: () => void, host: VBox): void {
	const label = friendly(p.id);
	if (p.type.toLowerCase() === "condition") {
		host.addItem(new Label({ text: label, design: "Bold" }));
		pv[p.id] ??= emptyCondition();
		host.addItem(conditionEditor(pv[p.id] as Node, ctx, refresh));
		return;
	}
	if (p.type === "comparisonOperator") {
		const sel = new Select({ selectedKey: (pv[p.id] as string) || "", width: "12rem" });
		BROAD_OPS.forEach((o) => sel.addItem(new Item({ key: o, text: OP_LABEL[o] || o })));
		sel.attachChange(() => (pv[p.id] = sel.getSelectedKey()));
		host.addItem(labeled(label, sel));
		return;
	}
	if (p.type === "boolean") {
		const sw = new Switch({ state: !!pv[p.id] });
		sw.attachChange((e: Event) => (pv[p.id] = e.getParameter("state" as never) as boolean));
		host.addItem(new HBox({ alignItems: "Center", items: [new Label({ text: label, width: "12rem" }), sw] }).addStyleClass("sapUiTinyMarginBottom"));
		return;
	}
	if (p.multivalued) {
		const arr = (pv[p.id] ??= []) as any[];
		const mi = new MultiInput({ width: "22rem" });
		arr.forEach((v) => mi.addToken(new Token({ text: String(v) })));
		const sync = () => (pv[p.id] = mi.getTokens().map((t) => p.type === "integer" ? Number(t.getText()) : t.getText()));
		mi.attachTokenUpdate(() => setTimeout(sync, 0));
		mi.attachSubmit((e: Event) => { const v = e.getParameter("value" as never) as string; if (v) { mi.addToken(new Token({ text: v })); mi.setValue(""); sync(); } });
		host.addItem(labeled(label, mi));
		return;
	}
	if (p.type === "date") {
		const dp = new DateTimePicker({ value: (pv[p.id] as string) || "", valueFormat: DATE_FMT, displayFormat: "yyyy-MM-dd HH:mm", width: "16rem" });
		dp.attachChange(() => (pv[p.id] = dp.getValue()));
		host.addItem(labeled(label, dp));
		return;
	}
	const inp = new Input({ value: pv[p.id] == null ? "" : String(pv[p.id]), type: p.type === "integer" ? "Number" : "Text", width: "16rem" });
	inp.attachChange(() => (pv[p.id] = p.type === "integer" ? Number(inp.getValue()) : inp.getValue()));
	host.addItem(labeled(label, inp));
}

// ---- Rows (property → operator → value) --------------------------------------

function row(node: Node, ctx: BrmCtx, refresh: () => void, onRemove: () => void): Control {
	const pv = node.parameterValues;
	const target = TARGET_OF[node.type];
	const props = ctx.props[target];
	const prefix = PREFIX[target];
	const propName = (pv.propertyName as string) || "";
	const pickerKey = prefix && propName.startsWith(prefix) ? propName.slice(prefix.length) : propName;
	const propDef = props.find((p) => p.id === pickerKey);
	const type = rowType(pv, propDef);
	const op = (pv.comparisonOperator as string) || "";

	const targetSel = new Select({ selectedKey: target, width: "6.5rem" });
	targetSel.addItem(new Item({ key: "profile", text: "Profile" }));
	targetSel.addItem(new Item({ key: "session", text: "Session" }));
	targetSel.addItem(new Item({ key: "event", text: "Event" }));
	targetSel.attachChange(() => { node.type = ROW_TYPE[targetSel.getSelectedKey() as Target]; refresh(); });

	// Picker shows the catalog id/name; the stored propertyName carries the `properties.` path.
	const picker = new ComboBox({ selectedKey: propDef ? pickerKey : "", value: propDef ? "" : propName, placeholder: "property", width: "14rem" });
	props.forEach((p) => picker.addItem(new Item({ key: p.id, text: p.name })));
	picker.attachSelectionChange((e: Event) => { const it = e.getParameter("selectedItem" as never) as Item; if (it) { pv.propertyName = prefix + it.getKey(); refresh(); } });
	picker.attachChange(() => { const k = picker.getSelectedKey(); pv.propertyName = k ? prefix + k : picker.getValue(); refresh(); });

	const typeSel = new Select({ selectedKey: type, width: "6rem" });
	["string", "integer", "date", "boolean"].forEach((t) => typeSel.addItem(new Item({ key: t, text: t })));
	typeSel.attachChange(() => {
		const nt = typeSel.getSelectedKey();
		const multi = isMulti(op);
		clearValues(pv);
		if (nt === "boolean") { pv.propertyValue = "false"; } else { pv[valueSlot(nt, multi)] = multi ? [] : (nt === "integer" ? 0 : ""); }
		refresh();
	});

	const opSel = new Select({ selectedKey: op, width: "9rem" });
	(OPS[type] || OPS.string).forEach((o) => opSel.addItem(new Item({ key: o, text: OP_LABEL[o] || o })));
	opSel.attachChange(() => { pv.comparisonOperator = opSel.getSelectedKey(); refresh(); });

	const rowBox = new HBox({ wrap: "Wrap", alignItems: "Center", items: [targetSel, picker, typeSel, opSel] }).addStyleClass("sapUiTinyMarginBottom");
	const val = valueField(pv, type, op);
	if (val) {
		rowBox.addItem(val);
	}
	rowBox.addItem(new ToolbarSpacer());
	rowBox.addItem(advBtn(node, refresh));
	rowBox.addItem(rmBtn(onRemove));
	return rowBox;
}

function rowType(pv: Record<string, any>, propDef?: PropDef): string {
	if (pv.propertyValueDate != null || pv.propertyValuesDate != null) {
		return "date";
	}
	if (pv.propertyValueInteger != null || pv.propertyValuesInteger != null) {
		return "integer";
	}
	if (pv.propertyValue === "true" || pv.propertyValue === "false") {
		return "boolean";
	}
	if (pv.propertyValue != null || pv.propertyValues != null) {
		return "string";
	}
	const vt = propDef?.valueTypeId;
	return vt === "integer" || vt === "date" || vt === "boolean" ? vt : "string";
}

function valueSlot(type: string, multi: boolean): string {
	if (type === "date") {
		return multi ? "propertyValuesDate" : "propertyValueDate";
	}
	if (type === "integer") {
		return multi ? "propertyValuesInteger" : "propertyValueInteger";
	}
	return multi ? "propertyValues" : "propertyValue";
}

function clearValues(pv: Record<string, any>): void {
	VALUE_SLOTS.forEach((s) => delete pv[s]);
}

function valueField(pv: Record<string, any>, type: string, op: string): Control | null {
	if (noValue(op)) {
		clearValues(pv);
		return null;
	}
	if (type === "boolean") {
		VALUE_SLOTS.filter((s) => s !== "propertyValue").forEach((s) => delete pv[s]);
		const sw = new Switch({ state: pv.propertyValue === "true" });
		sw.attachChange((e: Event) => (pv.propertyValue = (e.getParameter("state" as never) as boolean) ? "true" : "false"));
		return sw;
	}
	const multi = isMulti(op);
	const slot = valueSlot(type, multi);
	VALUE_SLOTS.filter((s) => s !== slot).forEach((s) => delete pv[s]);
	if (multi) {
		const arr = (pv[slot] ??= []) as any[];
		const mi = new MultiInput({ width: "18rem", placeholder: op === "between" ? "min, max" : "values" });
		arr.forEach((v) => mi.addToken(new Token({ text: String(v) })));
		const sync = () => (pv[slot] = mi.getTokens().map((t) => type === "integer" ? Number(t.getText()) : t.getText()));
		mi.attachTokenUpdate(() => setTimeout(sync, 0));
		mi.attachSubmit((e: Event) => { const v = e.getParameter("value" as never) as string; if (v) { mi.addToken(new Token({ text: v })); mi.setValue(""); sync(); } });
		return mi;
	}
	if (type === "date") {
		const dp = new DateTimePicker({ value: (pv[slot] as string) || "", valueFormat: DATE_FMT, displayFormat: "yyyy-MM-dd HH:mm", width: "16rem" });
		dp.attachChange(() => (pv[slot] = dp.getValue()));
		return dp;
	}
	const inp = new Input({ value: pv[slot] == null ? "" : String(pv[slot]), type: type === "integer" ? "Number" : "Text", width: "14rem", placeholder: "value" });
	inp.attachChange(() => (pv[slot] = type === "integer" ? Number(inp.getValue()) : inp.getValue()));
	return inp;
}

export { emptyCondition };
