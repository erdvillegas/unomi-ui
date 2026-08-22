/*global QUnit */
// A real (used) import forces the transpiler to emit a sap.ui.define module — a
// file with no import/export becomes a bare script the ui5 loader can't require.
// QUnit itself is a global provided by the Test Starter runner.
import Log from "sap/base/Log";

QUnit.module("Sanity");

QUnit.test("test harness runs", (assert) => {
	assert.strictEqual(typeof Log.info, "function", "UI5 core loaded and QUnit is wired up");
});
