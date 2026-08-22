/*global QUnit */
import { aggregateBox, emptyAggregate, AGG_TYPES, Aggregate } from "unomi/ui/control/brm/aggregateBuilder";
import Select from "sap/m/Select";
import Control from "sap/ui/core/Control";

// Fire a control's primary change handler regardless of its concrete type.
function fire(root: Control, predicate: (c: Control) => boolean): Control | undefined {
	const all = (root as unknown as { findAggregatedObjects(rec: boolean): Control[] }).findAggregatedObjects(true);
	return all.find(predicate);
}

QUnit.module("control/aggregateBuilder");

QUnit.test("emptyAggregate defaults to terms", (assert) => {
	assert.strictEqual(emptyAggregate().type, "terms", "terms is the default bucketing");
	assert.ok(AGG_TYPES.indexOf("date") >= 0 && AGG_TYPES.indexOf("ipRange") >= 0, "known agg types exposed");
});

QUnit.test("switching type clears the previous shape", (assert) => {
	// Start on numericRange with a populated range array, then switch to date.
	const agg: Aggregate = { type: "numericRange", numericRanges: [{ key: "young", from: 0, to: 18 }] };
	const box = aggregateBox(agg, () => { /* re-render seam; not needed for the assert */ });
	const sel = fire(box, (c) => c.isA("sap.m.Select")) as Select;
	sel.setSelectedKey("date");
	sel.fireChange({ selectedItem: sel.getItems()[1] });
	assert.strictEqual(agg.type, "date", "type updated");
	assert.notOk(agg.numericRanges, "stale numericRanges dropped so we never send a mixed shape");
});

QUnit.test("date type seeds an interval parameter slot", (assert) => {
	const agg = { type: "date" } as Aggregate;
	const box = aggregateBox(agg, () => { /* noop */ });
	// The interval input is present and writes into parameters on change.
	const inputs = (box as unknown as { findAggregatedObjects(rec: boolean): Control[] }).findAggregatedObjects(true)
		.filter((c) => c.isA("sap.m.Input")) as unknown as { setValue(v: string): void; fireChange(): void }[];
	assert.ok(inputs.length >= 1, "date renders parameter inputs");
	inputs[0].setValue("1M");
	inputs[0].fireChange();
	assert.strictEqual(agg.parameters?.interval, "1M", "interval captured into parameters");
	box.destroy();
});
