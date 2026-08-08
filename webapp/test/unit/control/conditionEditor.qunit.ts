/*global QUnit */
import {
	conditionEditor, loadProps, loadCatalogs, emptyCat, emptyCondition, _internals, BrmCtx
} from "unomi/ui/control/brm/conditionEditor";
import { emptyDefs, Node } from "unomi/ui/control/builders";
import * as Catalog from "unomi/ui/service/Catalog";

const { readGroup, setGroupMode, rowType, valueSlot, clearValues, summarize, friendly, category, isMulti, noValue } = _internals;

function ctx(): BrmCtx {
	return { defs: emptyDefs(), props: { profile: [], session: [], event: [] }, cat: emptyCat() };
}

function stubFetchByUrl(map: (url: string) => unknown): () => void {
	const orig = window.fetch;
	window.fetch = ((url: string) => Promise.resolve({
		ok: true, status: 200, statusText: "OK",
		json: () => Promise.resolve(map(url))
	} as Response)) as unknown as typeof fetch;
	return () => { window.fetch = orig; };
}

QUnit.module("control/brm/conditionEditor — group model");

QUnit.test("readGroup: booleanCondition and/or", (assert) => {
	assert.strictEqual(readGroup({ type: "booleanCondition", parameterValues: { operator: "and", subConditions: [] } } as Node).mode, "all");
	assert.strictEqual(readGroup({ type: "booleanCondition", parameterValues: { operator: "or", subConditions: [] } } as Node).mode, "any");
});

QUnit.test("readGroup: notCondition normalizes inner and reports NONE", (assert) => {
	const not = { type: "notCondition", parameterValues: {} } as Node;
	const g = readGroup(not);
	assert.strictEqual(g.mode, "none");
	assert.ok(Array.isArray(g.subs), "subs is an array");
	assert.strictEqual((not.parameterValues.subCondition as Node).type, "booleanCondition", "inner wrapped in a group");
});

QUnit.test("readGroup: matchAll is an empty ALL group", (assert) => {
	const g = readGroup({ type: "matchAllCondition", parameterValues: {} } as Node);
	assert.strictEqual(g.mode, "all");
	assert.deepEqual(g.subs, []);
});

QUnit.test("setGroupMode: NONE builds a notCondition wrapping an OR group", (assert) => {
	const node = { type: "booleanCondition", parameterValues: { operator: "and", subConditions: [] } } as Node;
	setGroupMode(node, "none", [{ type: "matchAllCondition", parameterValues: {} }]);
	assert.strictEqual(node.type, "notCondition");
	assert.strictEqual((node.parameterValues.subCondition as Node).parameterValues.operator, "or");
});

QUnit.test("setGroupMode: any/all set the boolean operator", (assert) => {
	const node = { type: "matchAllCondition", parameterValues: {} } as Node;
	setGroupMode(node, "any", []);
	assert.strictEqual(node.type, "booleanCondition");
	assert.strictEqual(node.parameterValues.operator, "or");
	setGroupMode(node, "all", []);
	assert.strictEqual(node.parameterValues.operator, "and");
});

QUnit.module("control/brm/conditionEditor — value slots");

QUnit.test("rowType: inferred from the populated value slot", (assert) => {
	assert.strictEqual(rowType({ propertyValueDate: "2020-01-01" }), "date");
	assert.strictEqual(rowType({ propertyValueInteger: 3 }), "integer");
	assert.strictEqual(rowType({ propertyValue: "true" }), "boolean");
	assert.strictEqual(rowType({ propertyValue: "abc" }), "string");
});

QUnit.test("rowType: falls back to the property definition value type", (assert) => {
	assert.strictEqual(rowType({}, { id: "age", name: "Age", valueTypeId: "integer" }), "integer");
	assert.strictEqual(rowType({}, { id: "x", name: "x", valueTypeId: null }), "string");
});

QUnit.test("valueSlot: type × multiplicity", (assert) => {
	assert.strictEqual(valueSlot("date", false), "propertyValueDate");
	assert.strictEqual(valueSlot("date", true), "propertyValuesDate");
	assert.strictEqual(valueSlot("integer", false), "propertyValueInteger");
	assert.strictEqual(valueSlot("string", true), "propertyValues");
	assert.strictEqual(valueSlot("string", false), "propertyValue");
});

QUnit.test("clearValues removes every value slot but keeps other params", (assert) => {
	const pv: Record<string, unknown> = { propertyName: "x", propertyValue: "1", propertyValuesInteger: [1], comparisonOperator: "equals" };
	clearValues(pv);
	assert.notOk("propertyValue" in pv, "scalar slot removed");
	assert.notOk("propertyValuesInteger" in pv, "multi slot removed");
	assert.strictEqual(pv.propertyName, "x", "non-value param kept");
	assert.strictEqual(pv.comparisonOperator, "equals");
});

QUnit.test("isMulti / noValue operator classification", (assert) => {
	["in", "notIn", "between", "all", "hasSomeOf", "hasNoneOf"].forEach((o) => assert.ok(isMulti(o), o + " is multi"));
	assert.notOk(isMulti("equals"), "equals is single");
	assert.ok(noValue("exists") && noValue("missing"), "exists/missing take no value");
	assert.notOk(noValue("equals"), "equals takes a value");
});

QUnit.module("control/brm/conditionEditor — formatting & summary");

QUnit.test("friendly humanizes condition type ids", (assert) => {
	assert.strictEqual(friendly("eventTypeCondition"), "Event Type");
	assert.strictEqual(friendly("numberOfDays"), "Number Of Days");
	assert.strictEqual(friendly("goalId"), "Goal ID");
});

QUnit.test("category maps system tags to a bucket", (assert) => {
	assert.strictEqual(category(["logical"]), "Logical");
	assert.strictEqual(category(["profileCondition"]), "Profile");
	assert.strictEqual(category([]), "Other");
});

QUnit.test("summarize: property row and segment membership", (assert) => {
	const row = { type: "profilePropertyCondition", parameterValues: { propertyName: "properties.age", comparisonOperator: "greaterThan", propertyValueInteger: 30 } } as Node;
	assert.strictEqual(summarize(row), "properties.age greaterThan 30");
	const seg = { type: "profileSegmentCondition", parameterValues: { segments: ["vip"] } } as Node;
	assert.strictEqual(summarize(seg), "in segment: vip");
});

QUnit.test("summarize: nested boolean group joins with AND", (assert) => {
	const g = { type: "booleanCondition", parameterValues: { operator: "and", subConditions: [
		{ type: "profileSegmentCondition", parameterValues: { segments: ["vip"] } },
		{ type: "profileUserListCondition", parameterValues: { lists: ["l1"] } }
	] } } as Node;
	assert.strictEqual(summarize(g), "(in segment: vip AND in list: l1)");
});

QUnit.module("control/brm/conditionEditor — public API");

QUnit.test("emptyCat / emptyCondition defaults", (assert) => {
	assert.deepEqual(emptyCat(), { segments: [], scorings: [], lists: [], goals: [], eventTypes: [] });
	assert.strictEqual(emptyCondition().type, "matchAllCondition");
});

QUnit.test("conditionEditor wraps a non-group root in an AND boolean group", (assert) => {
	const root = { type: "profilePropertyCondition", parameterValues: { propertyName: "properties.age" } } as Node;
	const control = conditionEditor(root, ctx(), () => { /* refresh */ }, false);
	assert.ok(control, "returns a control");
	assert.strictEqual(root.type, "booleanCondition", "root normalized to a group");
	assert.strictEqual(root.parameterValues.operator, "and");
	assert.strictEqual((root.parameterValues.subConditions as Node[])[0].type, "profilePropertyCondition", "original condition preserved");
});

QUnit.test("loadProps maps profile/session props and drops id-less rows", async (assert) => {
	Catalog.invalidate();
	const restore = stubFetchByUrl(() => ({
		profiles: [{ valueTypeId: "integer", metadata: { id: "age", name: "Age" } }, { metadata: { name: "noid" } }],
		sessions: [{ metadata: { id: "duration" } }]
	}));
	const props = await loadProps();
	restore();
	assert.strictEqual(props.profile.length, 1, "id-less row dropped");
	assert.strictEqual(props.profile[0].id, "age");
	assert.strictEqual(props.profile[0].valueTypeId, "integer");
	assert.strictEqual(props.session[0].name, "duration", "name falls back to id");
	assert.deepEqual(props.event, [], "events are free-text (no catalog)");
});

QUnit.test("loadCatalogs flattens catalogs and filters junk rows", async (assert) => {
	Catalog.invalidate();
	const restore = stubFetchByUrl((url) =>
		url.endsWith("/segments") ? [{ id: "s1", name: "Seg 1" }, { id: "" }] :
		url.endsWith("/scoring") ? [{ id: "sc1" }] :
		url.endsWith("/lists") ? { list: [{ id: "l1", name: "L1" }] } :
		url.endsWith("/goals") ? [{ id: "g1" }] :
		url.endsWith("/events/types") ? ["view", "click"] : []
	);
	const cat = await loadCatalogs();
	restore();
	assert.strictEqual(cat.segments.length, 1, "id-less segment filtered");
	assert.strictEqual(cat.segments[0].name, "Seg 1");
	assert.strictEqual(cat.scorings[0].name, "sc1", "name falls back to id");
	assert.strictEqual(cat.lists[0].id, "l1", "lists unwrapped from PartialList");
	assert.deepEqual(cat.eventTypes.map((e) => e.id), ["view", "click"], "event types from string[]");
});
