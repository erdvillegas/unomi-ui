/*global QUnit */
import {
	row, emptyDefs, emptyCondition, nativePropsBox, keyValueBox, loadDefs,
	conditionPanel, actionsList, elementPanel, Node
} from "unomi/ui/control/builders";
import HBox from "sap/m/HBox";
import VBox from "sap/m/VBox";
import Input from "sap/m/Input";
import CheckBox from "sap/m/CheckBox";
import Button from "sap/m/Button";
import Label from "sap/m/Label";
import Toolbar from "sap/m/Toolbar";
import ComboBox from "sap/m/ComboBox";
import * as Catalog from "unomi/ui/service/Catalog";

QUnit.module("control/builders — helpers");

QUnit.test("row pairs a fixed-width label with a control", (assert) => {
	const ctrl = new Input();
	const hb = row("Name", ctrl);
	assert.ok(hb.isA("sap.m.HBox"));
	assert.strictEqual((hb.getItems()[0] as Label).getText(), "Name");
	assert.strictEqual(hb.getItems()[1], ctrl, "control placed after label");
});

QUnit.test("emptyDefs / emptyCondition defaults", (assert) => {
	assert.deepEqual(emptyDefs(), { cond: {}, condTypes: [], condTags: {}, action: {}, actionTypes: [] });
	assert.deepEqual(emptyCondition(), { type: "matchAllCondition", parameterValues: {} });
});

QUnit.module("control/builders — nativePropsBox");

QUnit.test("boolean/int/text fields read and write the map", (assert) => {
	const map: Record<string, unknown> = { active: true, count: 5, name: "x" };
	const box = nativePropsBox(map, [
		{ id: "active", name: "Active", valueTypeId: "boolean" },
		{ id: "count", name: "Count", valueTypeId: "integer" },
		{ id: "name", name: "Name", valueTypeId: "string" }
	]);
	const rows = box.getItems() as HBox[];
	assert.strictEqual(rows.length, 3, "one row per prop");

	const cb = rows[0].getItems()[1] as CheckBox;
	assert.ok(cb.isA("sap.m.CheckBox"), "boolean -> CheckBox");
	cb.setSelected(false);
	cb.fireSelect();
	assert.strictEqual(map.active, false, "checkbox writes map");

	const intInp = rows[1].getItems()[1] as Input;
	intInp.setValue("42");
	intInp.fireChange();
	assert.strictEqual(map.count, 42, "integer coerced to number");

	const nameInp = rows[2].getItems()[1] as Input;
	nameInp.setValue("");
	nameInp.fireChange();
	assert.notOk("name" in map, "empty value deletes the key");
});

QUnit.module("control/builders — keyValueBox");

QUnit.test("value edits use JSON coercion; add appends a fresh key", (assert) => {
	const map: Record<string, unknown> = { nb: 3 };
	let refreshed = 0;
	const box = keyValueBox(map, () => { refreshed++; });

	const firstRow = box.getItems()[0] as HBox;
	const valInp = firstRow.getItems()[1] as Input;
	valInp.setValue("42");
	valInp.fireChange();
	assert.strictEqual(map.nb, 42, "numeric string parsed to number");
	valInp.setValue("hello");
	valInp.fireChange();
	assert.strictEqual(map.nb, "hello", "non-JSON stays a string");

	const addBtn = box.getItems()[box.getItems().length - 1] as Button;
	addBtn.firePress();
	assert.ok(refreshed > 0, "add triggers refresh");
	assert.ok("key1" in map, "new key added");
});

QUnit.module("control/builders — loadDefs");

QUnit.test("maps and sorts condition/action definitions", async (assert) => {
	const orig = window.fetch;
	window.fetch = ((url: string) => Promise.resolve({
		ok: true, status: 200, statusText: "OK",
		json: () => Promise.resolve(url.endsWith("/definitions/conditions")
			? [
				{ id: "zCond", parameters: [{ id: "p", type: "string", multivalued: false }], systemTags: ["logical"] },
				{ id: "aCond", parameters: [] }
			]
			: [{ id: "setPropertyAction", parameters: [] }])
	} as Response)) as unknown as typeof fetch;
	const defs = await loadDefs();
	window.fetch = orig;
	assert.deepEqual(defs.condTypes, ["aCond", "zCond"], "condition types sorted");
	assert.deepEqual(defs.condTags.zCond, ["logical"], "system tags mapped");
	assert.strictEqual(defs.cond.zCond[0].id, "p", "parameters mapped");
	assert.ok(defs.actionTypes.includes("setPropertyAction"), "action types mapped");
});

QUnit.module("control/builders — panels");

QUnit.test("conditionPanel renders every parameter type and seeds values", (assert) => {
	const defs = emptyDefs();
	defs.condTypes = ["complexCondition"];
	defs.cond = {
		complexCondition: [
			{ id: "sub", type: "Condition", multivalued: false },
			{ id: "subs", type: "Condition", multivalued: true },
			{ id: "op", type: "comparisonOperator", multivalued: false },
			{ id: "props", type: "properties", multivalued: false },
			{ id: "flag", type: "boolean", multivalued: false },
			{ id: "tags", type: "string", multivalued: true },
			{ id: "count", type: "integer", multivalued: false }
		]
	};
	const node: Node = { type: "complexCondition", parameterValues: {} };
	const panel = conditionPanel(node, defs, () => { /* refresh */ });
	assert.ok(panel.isA("sap.m.Panel"), "returns a Panel");
	assert.strictEqual((node.parameterValues.sub as Node).type, "matchAllCondition", "nested condition seeded");
	assert.ok(Array.isArray(node.parameterValues.subs), "multivalued condition seeded to an array");
	assert.strictEqual(typeof node.parameterValues.props, "object", "properties map seeded");
});

QUnit.test("a reference param (scope) renders a searchable picker, not a plain Input", (assert) => {
	const orig = window.fetch;
	window.fetch = (() => Promise.resolve({ ok: true, status: 200, statusText: "OK", json: () => Promise.resolve([]) } as Response)) as unknown as typeof fetch;
	Catalog.invalidate();
	const defs = emptyDefs();
	defs.condTypes = ["scopedCondition"];
	defs.cond = { scopedCondition: [{ id: "scope", type: "string", multivalued: false }] };
	const panel = conditionPanel({ type: "scopedCondition", parameterValues: {} }, defs, () => { /* refresh */ });
	const body = panel.getContent()[0] as VBox;
	const controls = body.getItems().map((c) => c.getMetadata().getName());
	assert.ok(controls.includes("sap.m.ComboBox"), "scope param -> ComboBox picker");
	assert.notOk(controls.includes("sap.m.Input"), "not a free-text Input");
	window.fetch = orig;
	Catalog.invalidate();
});

QUnit.test("type picker is a searchable ComboBox that resets params on change", (assert) => {
	const defs = emptyDefs();
	defs.condTypes = ["aCond", "bCond"];
	defs.cond = { aCond: [], bCond: [] };
	const node: Node = { type: "aCond", parameterValues: { x: 1 } };
	const panel = conditionPanel(node, defs, () => { /* refresh */ });
	const header = panel.getHeaderToolbar() as Toolbar;
	const cb = header.getContent().find((c) => c.isA("sap.m.ComboBox")) as ComboBox;
	assert.ok(cb, "type control is a ComboBox (searchable)");
	cb.setSelectedKey("bCond");
	cb.fireSelectionChange({ selectedItem: cb.getItems()[1] });
	assert.strictEqual(node.type, "bCond", "type updated from selection");
	assert.deepEqual(node.parameterValues, {}, "params reset on type change");
});

QUnit.test("actionsList builds a panel per action plus an add button", (assert) => {
	const defs = emptyDefs();
	defs.actionTypes = ["setPropertyAction"];
	defs.action = { setPropertyAction: [] };
	const arr: Node[] = [{ type: "setPropertyAction", parameterValues: {} }];
	const items = actionsList(arr, defs, () => { /* refresh */ });
	assert.strictEqual(items.length, 2, "one action panel + add button");
	(items[1] as Button).firePress();
	assert.strictEqual(arr.length, 2, "add button appends an action");
});

QUnit.test("elementPanel seeds a condition and returns a Panel", (assert) => {
	const el: { condition?: Node; value?: number } = {};
	const panel = elementPanel(el, emptyDefs(), () => { /* refresh */ }, () => { /* remove */ });
	assert.ok(el.condition, "condition seeded");
	assert.ok(panel.isA("sap.m.Panel"));
	// silence unused-import lint for VBox by asserting a body exists
	assert.ok(panel.getContent()[0].isA("sap.m.VBox"));
});
