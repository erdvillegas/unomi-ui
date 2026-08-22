/*global QUnit */
import { formFields } from "unomi/ui/model/forms";

QUnit.module("model/forms");

QUnit.test("metadata resource: id/scope readonly on edit, name editable", (assert) => {
	const f = formFields("segments", false);
	const byPath = (p: string) => f.find((x) => x.path === p);
	assert.ok(byPath("metadata.id")?.readonly, "id readonly when not new");
	assert.ok(byPath("metadata.scope")?.readonly, "scope readonly when not new");
	assert.notOk(byPath("metadata.name")?.readonly, "name editable");
});

QUnit.test("metadata resource: id editable on create", (assert) => {
	const id = formFields("segments", true).find((x) => x.path === "metadata.id");
	assert.notOk(id?.readonly, "id editable when new");
});

QUnit.test("rules add priority + raiseEvent flags", (assert) => {
	const paths = formFields("rules", true).map((x) => x.path);
	assert.ok(paths.includes("priority"), "priority");
	assert.ok(paths.includes("raiseEventOnlyOnce"), "raiseEventOnlyOnce");
});

QUnit.test("campaigns add date/cost fields", (assert) => {
	const paths = formFields("campaigns", true).map((x) => x.path);
	["startDate", "endDate", "cost", "currency"].forEach((p) => assert.ok(paths.includes(p), p));
});

QUnit.test("importConfig: help block first, root fields, import-only extras", (assert) => {
	const f = formFields("importConfig", true);
	assert.strictEqual(f[0].type, "help", "help block first");
	const paths = f.map((x) => x.path);
	assert.ok(paths.includes("itemId"), "root id field");
	assert.ok(paths.includes("hasHeader"), "import extra");
	assert.ok(paths.includes("overwriteExistingProfiles"), "import extra");
});

QUnit.test("exportConfig: help block, no import-only extras", (assert) => {
	const f = formFields("exportConfig", true);
	assert.strictEqual(f[0].type, "help", "help block first");
	assert.notOk(f.map((x) => x.path).includes("hasHeader"), "no import-only extras");
});
