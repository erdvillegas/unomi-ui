/*global QUnit */
import { buildForm, Field } from "unomi/ui/control/FormEngine";
import JSONModel from "sap/ui/model/json/JSONModel";
import MultiInput from "sap/m/MultiInput";
import * as Catalog from "unomi/ui/service/Catalog";

QUnit.module("control/FormEngine");

QUnit.test("buildForm emits a label + typed control per field", (assert) => {
	const fields: Field[] = [
		{ path: "a", label: "A", type: "text" },
		{ path: "b", label: "B", type: "textarea" },
		{ path: "c", label: "C", type: "int" },
		{ path: "d", label: "D", type: "float" },
		{ path: "e", label: "E", type: "switch" },
		{ path: "f", label: "F", type: "datetime" },
		{ path: "g", label: "G", type: "tokens" },
		{ path: "h", label: "H", type: "select", options: [{ key: "x", text: "X" }] },
		{ path: "", label: "", type: "help", html: "<p>h</p>" }
	];
	const model = new JSONModel({ g: ["t1"] });
	const content = buildForm(fields, model).getContent();
	assert.strictEqual(content.length, 18, "label + control per field");
	const controlTypes = content.filter((_, i) => i % 2 === 1).map((c) => c.getMetadata().getName());
	assert.deepEqual(controlTypes, [
		"sap.m.Input", "sap.m.TextArea", "sap.m.Input", "sap.m.Input", "sap.m.Switch",
		"sap.m.DateTimePicker", "sap.m.MultiInput", "sap.m.Select", "sap.m.FormattedText"
	], "each field maps to its control");
});

QUnit.test("tokens field writes submitted tokens back to the model", (assert) => {
	const model = new JSONModel({ tags: [] });
	const form = buildForm([{ path: "tags", label: "Tags", type: "tokens" }], model);
	const mi = form.getContent()[1] as MultiInput;
	mi.fireSubmit({ value: "new" });
	assert.deepEqual(model.getProperty("/tags"), ["new"], "submitted token stored");
});

QUnit.test("readonly renders a non-editable control", (assert) => {
	const model = new JSONModel({ id: "x" });
	const form = buildForm([{ path: "id", label: "ID", type: "text", readonly: true }], model);
	assert.notOk((form.getContent()[1] as unknown as { getEditable(): boolean }).getEditable(), "readonly -> not editable");
});

QUnit.test("ref field: editable -> searchable ComboBox, readonly -> read-only Input", (assert) => {
	const orig = window.fetch;
	window.fetch = (() => Promise.resolve({ ok: true, status: 200, statusText: "OK", json: () => Promise.resolve([]) } as Response)) as unknown as typeof fetch;
	Catalog.invalidate();
	const model = new JSONModel({ metadata: { scope: "systemscope" } });

	const editable = buildForm([{ path: "metadata.scope", label: "Scope", type: "ref", catalog: "scopes" }], model).getContent()[1];
	assert.strictEqual(editable.getMetadata().getName(), "sap.m.ComboBox", "editable ref -> ComboBox");

	const ro = buildForm([{ path: "metadata.scope", label: "Scope", type: "ref", catalog: "scopes", readonly: true }], model).getContent()[1];
	assert.strictEqual(ro.getMetadata().getName(), "sap.m.Input", "readonly ref -> Input");
	assert.notOk((ro as unknown as { getEditable(): boolean }).getEditable(), "read-only input");

	window.fetch = orig;
	Catalog.invalidate();
});
