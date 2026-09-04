/*global QUnit */
// Regression guard: sap.uxap.ObjectPageSubSection lays its `blocks` out in a
// responsive COLUMN grid. A subsection with more than one direct block renders
// them side by side, which broke the imperative BRM condition editor (form and
// editor split into two columns). The fix wraps each subsection's content in a
// single full-width VBox. This test fails if any Object Page view regresses to
// multiple direct blocks in a subsection.
import Log from "sap/base/Log";

// Views built on sap.uxap.ObjectPageLayout.
const OBJECT_PAGE_VIEWS = ["ProfileDetail", "ItemDetail", "EventDetail", "Info"];

// sap.ui.require.toUrl resolves via the loader path "unomi/ui" configured in the
// test suite, so it works headless (karma) and in the browser alike.
const toUrl = (sap.ui.require as unknown as { toUrl: (n: string) => string }).toUrl;

QUnit.module("Object Page layout");

OBJECT_PAGE_VIEWS.forEach((view) => {
	QUnit.test(`${view}: every ObjectPageSubSection has exactly one block`, async (assert) => {
		const url = toUrl(`unomi/ui/view/${view}.view.xml`);
		const text = await (await fetch(url)).text();
		const doc = new DOMParser().parseFromString(text, "application/xml");

		assert.strictEqual(doc.getElementsByTagName("parsererror").length, 0, "XML parses");

		const blocks = Array.from(doc.getElementsByTagNameNS("sap.uxap", "blocks"));
		assert.ok(blocks.length > 0, `${view} has ObjectPageSubSection blocks`);

		blocks.forEach((b, i) => {
			assert.strictEqual(
				b.children.length,
				1,
				`subsection #${i + 1} wraps its content in a single full-width block ` +
					`(more than one block would render columns and break the BRM)`
			);
		});
	});
});

// Keep the import used so the transpiler emits a real module.
Log.info("objectPageLayout regression test loaded");
