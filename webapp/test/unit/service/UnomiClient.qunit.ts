/*global QUnit */
import * as UnomiClient from "unomi/ui/service/UnomiClient";

// fetch is stubbed by swapping the global; every request is recorded so we can
// assert URL, method, headers and body without a live Unomi.
let calls: { url: string; init: RequestInit }[] = [];
const origFetch = window.fetch;

function stubFetch(res: { ok?: boolean; status?: number; statusText?: string; json?: unknown; text?: string }): void {
	window.fetch = ((url: string, init: RequestInit = {}) => {
		calls.push({ url, init });
		return Promise.resolve({
			ok: res.ok ?? true,
			status: res.status ?? 200,
			statusText: res.statusText ?? "OK",
			json: () => Promise.resolve(res.json),
			text: () => Promise.resolve(res.text ?? "")
		} as Response);
	}) as unknown as typeof fetch;
}

function header(i: number, name: string): string | null {
	return (calls[i].init.headers as Headers).get(name);
}

QUnit.module("service/UnomiClient", {
	beforeEach() {
		calls = [];
		UnomiClient.setBaseUrl("");
		UnomiClient.clearCredentials();
	},
	afterEach() {
		window.fetch = origFetch;
		UnomiClient.setBaseUrl("");
		UnomiClient.clearCredentials();
	}
});

QUnit.test("credentials lifecycle", (assert) => {
	assert.notOk(UnomiClient.isAuthenticated(), "starts unauthenticated");
	UnomiClient.setCredentials("karaf", "karaf");
	assert.ok(UnomiClient.isAuthenticated(), "authenticated after setCredentials");
	UnomiClient.clearCredentials();
	assert.notOk(UnomiClient.isAuthenticated(), "cleared");
});

QUnit.test("getJson: default base, Basic header, parsed body", async (assert) => {
	stubFetch({ json: { hello: "world" } });
	UnomiClient.setCredentials("karaf", "karaf");
	const out = await UnomiClient.getJson<{ hello: string }>("/x");
	assert.strictEqual(out.hello, "world", "parsed JSON");
	assert.strictEqual(calls[0].url, "/cxs/x", "default base + path");
	assert.strictEqual(header(0, "Authorization"), "Basic " + btoa("karaf:karaf"), "Basic auth header");
});

QUnit.test("no auth header when unauthenticated", async (assert) => {
	stubFetch({ json: {} });
	await UnomiClient.getJson("/x");
	assert.strictEqual(header(0, "Authorization"), null, "no Authorization header");
});

QUnit.test("setBaseUrl overrides base; empty falls back to /cxs", async (assert) => {
	stubFetch({ json: {} });
	UnomiClient.setBaseUrl("http://h:8181/cxs");
	await UnomiClient.getJson("/test/ping");
	assert.strictEqual(calls[0].url, "http://h:8181/cxs/test/ping", "explicit base used");
});

QUnit.test("queryList: POST with JSON body, content-type, PartialList", async (assert) => {
	stubFetch({ json: { list: [1, 2], totalSize: 2, offset: 0, pageSize: 10 } });
	const pl = await UnomiClient.queryList<number>("/profiles/search", { text: "x" });
	assert.strictEqual(pl.totalSize, 2, "envelope returned");
	assert.strictEqual(calls[0].init.method, "POST", "POST");
	assert.strictEqual(calls[0].init.body, JSON.stringify({ text: "x" }), "serialized body");
	assert.strictEqual(header(0, "Content-Type"), "application/json", "json content-type");
});

QUnit.test("postJson posts body; del sends DELETE", async (assert) => {
	stubFetch({ json: {} });
	await UnomiClient.postJson("/x", { a: 1 });
	assert.strictEqual(calls[0].init.method, "POST", "postJson POST");
	assert.strictEqual(calls[0].init.body, JSON.stringify({ a: 1 }), "postJson body");
	await UnomiClient.del("/x/1");
	assert.strictEqual(calls[1].init.method, "DELETE", "del DELETE");
});

QUnit.test("non-ok response throws with status text", async (assert) => {
	stubFetch({ ok: false, status: 401, statusText: "Unauthorized" });
	try {
		await UnomiClient.getJson("/x");
		assert.ok(false, "expected getJson to throw");
	} catch (e) {
		assert.strictEqual((e as Error).message, "401 Unauthorized", "throws status");
	}
});
