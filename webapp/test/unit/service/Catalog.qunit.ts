/*global QUnit */
import * as Catalog from "unomi/ui/service/Catalog";

let calls: string[];
let origFetch: typeof fetch;

function stub(respond: (url: string) => { ok?: boolean; body: unknown }): void {
	window.fetch = ((url: string) => {
		calls.push(url);
		const r = respond(url);
		const ok = r.ok !== false;
		return Promise.resolve({ ok, status: ok ? 200 : 500, statusText: ok ? "OK" : "Error", json: () => Promise.resolve(r.body) } as Response);
	}) as unknown as typeof fetch;
}

QUnit.module("service/Catalog", {
	beforeEach: () => { calls = []; origFetch = window.fetch; Catalog.invalidate(); },
	afterEach: () => { window.fetch = origFetch; Catalog.invalidate(); }
});

QUnit.test("get() memoizes: two calls hit the network once", async (assert) => {
	stub(() => ({ body: [{ id: "s1", name: "S1" }] }));
	const a = await Catalog.get("segments");
	const b = await Catalog.get("segments");
	assert.strictEqual(calls.length, 1, "second get served from cache");
	assert.strictEqual(a, b, "same resolved instance");
	assert.deepEqual(a, [{ id: "s1", name: "S1" }]);
});

QUnit.test("invalidate(key) forces a refetch", async (assert) => {
	stub(() => ({ body: [{ id: "s1" }] }));
	await Catalog.get("segments");
	Catalog.invalidate("segments");
	await Catalog.get("segments");
	assert.strictEqual(calls.length, 2, "refetched after invalidate");
});

QUnit.test("failures are not cached: a retry re-fetches", async (assert) => {
	let n = 0;
	stub(() => (++n === 1 ? { ok: false, body: {} } : { body: [{ id: "ok" }] }));
	try {
		await Catalog.get("segments");
		assert.ok(false, "first call should reject");
	} catch {
		assert.ok(true, "first call rejected (not cached)");
	}
	const second = await Catalog.get("segments");
	assert.strictEqual(calls.length, 2, "failure dropped from cache; retried");
	assert.deepEqual(second, [{ id: "ok", name: "ok" }], "retry resolves");
});
