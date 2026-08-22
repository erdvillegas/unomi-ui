/*global QUnit */
import { refFor } from "unomi/ui/control/refMap";
import { refSelect, propSelect } from "unomi/ui/control/refSelect";
import * as Catalog from "unomi/ui/service/Catalog";
import ComboBox from "sap/m/ComboBox";
import MultiComboBox from "sap/m/MultiComboBox";

QUnit.module("control/refMap — refFor");

QUnit.test("explicit type.param overrides win", (assert) => {
	assert.strictEqual(refFor("goalMatchCondition", "goalId"), "goals");
	assert.strictEqual(refFor("scoringCondition", "scoringPlanId"), "scorings");
	assert.strictEqual(refFor("addToListsAction", "listIdentifiers"), "lists");
});

QUnit.test("wildcard *.scope maps any type's scope param", (assert) => {
	assert.strictEqual(refFor("someRandomCondition", "scope"), "scopes");
	assert.strictEqual(refFor("eventPropertyCondition", "scope"), "scopes");
});

QUnit.test("suffix heuristic fills the gaps", (assert) => {
	assert.strictEqual(refFor("x", "campaignId"), "campaigns");
	assert.strictEqual(refFor("x", "valueTypeId"), "valueTypes");
	assert.strictEqual(refFor("x", "sourceEventType"), "eventTypes");
	assert.strictEqual(refFor("x", "segmentId"), "segments");
});

QUnit.test("unknown params return null (fall back to a generic control)", (assert) => {
	assert.strictEqual(refFor("x", "propertyName"), null, "propertyName handled elsewhere");
	assert.strictEqual(refFor("x", "someFreeText"), null);
});

QUnit.module("control/refSelect", {
	beforeEach: () => { Catalog.invalidate(); },
	afterEach: () => { window.fetch = origFetch; Catalog.invalidate(); }
});

let origFetch: typeof fetch;
function stubScopes(): void {
	origFetch = window.fetch;
	window.fetch = (() => Promise.resolve({
		ok: true, status: 200, statusText: "OK",
		json: () => Promise.resolve([{ metadata: { id: "s1", name: "Scope 1" } }, { metadata: { id: "s2", name: "Scope 2" } }])
	} as Response)) as unknown as typeof fetch;
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

QUnit.test("single: fills from catalog and commits the chosen id", async (assert) => {
	stubScopes();
	let committed = "";
	const cb = refSelect("scopes", "s1", false, (v) => (committed = v as string)) as ComboBox;
	await tick();
	assert.strictEqual(cb.getItems().length, 2, "catalog items loaded");
	assert.strictEqual(cb.getSelectedKey(), "s1", "initial value preselected");
	cb.setSelectedKey("s2");
	cb.fireSelectionChange({ selectedItem: cb.getItems()[1] });
	assert.strictEqual(committed, "s2", "commit gets the picked id");
});

QUnit.test("single: free-text id (not in catalog) still commits via change", (assert) => {
	let committed = "";
	const cb = refSelect("scopes", "", false, (v) => (committed = v as string)) as ComboBox;
	cb.setValue("customScope");
	cb.fireChange({ value: "customScope" });
	assert.strictEqual(committed, "customScope", "typed id passes through");
});

QUnit.test("propSelect: profile props carry the 'properties.' prefix and commit", async (assert) => {
	origFetch = window.fetch;
	window.fetch = (() => Promise.resolve({
		ok: true, status: 200, statusText: "OK",
		json: () => Promise.resolve({ profiles: [{ valueTypeId: "string", metadata: { id: "email", name: "Email" } }], sessions: [] })
	} as Response)) as unknown as typeof fetch;
	Catalog.invalidate();
	let committed = "";
	const cb = propSelect("profile", "properties.email", (v) => (committed = v));
	await tick();
	assert.strictEqual(cb.getItems().length, 1, "profile prop loaded");
	assert.strictEqual(cb.getItems()[0].getKey(), "properties.email", "key carries the prefix");
	assert.strictEqual(cb.getSelectedKey(), "properties.email", "current value preselected");
	cb.fireSelectionChange({ selectedItem: cb.getItems()[0] });
	assert.strictEqual(committed, "properties.email", "commit gets the prefixed path");
});

QUnit.test("multi: commits the selected id array", async (assert) => {
	stubScopes();
	let committed: string[] = [];
	const mcb = refSelect("scopes", ["s1"], true, (v) => (committed = v as string[])) as MultiComboBox;
	await tick();
	assert.strictEqual(mcb.getItems().length, 2, "catalog items loaded");
	assert.deepEqual(mcb.getSelectedKeys(), ["s1"], "initial selection applied");
	mcb.setSelectedKeys(["s1", "s2"]);
	mcb.fireSelectionChange({});
	assert.deepEqual(committed, ["s1", "s2"], "commit gets the id array");
});
