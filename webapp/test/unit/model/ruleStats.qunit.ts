/*global QUnit */
import { deriveRuleStats } from "unomi/ui/model/ruleStats";

QUnit.module("model/ruleStats");

QUnit.test("splits time and local share as percentages", (assert) => {
	const v = deriveRuleStats({
		executionCount: 10, localExecutionCount: 4,
		conditionsTime: 30, actionsTime: 90
	});
	assert.strictEqual(v.conditionsPct, 25, "30/(30+90)");
	assert.strictEqual(v.actionsPct, 75, "90/(30+90)");
	assert.strictEqual(v.localPct, 40, "4/10");
});

QUnit.test("never-fired rule: no divide-by-zero", (assert) => {
	const v = deriveRuleStats({});
	assert.strictEqual(v.conditionsPct, 0);
	assert.strictEqual(v.actionsPct, 0);
	assert.strictEqual(v.localPct, 0);
});

QUnit.test("null stats tolerated", (assert) => {
	assert.strictEqual(deriveRuleStats(null).localPct, 0);
});
