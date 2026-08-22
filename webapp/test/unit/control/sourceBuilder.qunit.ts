/*global QUnit */
import { buildSource, parseSource } from "unomi/ui/control/sourceBuilder";

QUnit.module("control/sourceBuilder");

QUnit.test("buildSource: file protocol with fileName (no authority)", (assert) => {
	const p = parseSource("");
	Object.assign(p, { protocol: "file", path: "/tmp/", matchMode: "name", fileName: "profiles.csv" });
	assert.strictEqual(buildSource(p), "file:///tmp/?fileName=profiles.csv");
});

QUnit.test("buildSource: ftp with auth, port, password, pattern, delay, move", (assert) => {
	const p = parseSource("");
	Object.assign(p, {
		protocol: "ftp", host: "h", port: "21", user: "u", password: "pw",
		path: "/in/", matchMode: "pattern", pattern: ".*\\.csv", delayVal: "20", delayUnit: "s", move: ".done"
	});
	assert.strictEqual(
		buildSource(p),
		"ftp://u@h:21/in/?password=pw&include=.*\\.csv&consumer.delay=20s&move=.done"
	);
});

QUnit.test("buildSource: normalizes a path missing the leading slash", (assert) => {
	const p = parseSource("");
	Object.assign(p, { protocol: "file", path: "data/", matchMode: "name", fileName: "" });
	assert.strictEqual(buildSource(p), "file:///data/");
});

QUnit.test("parseSource: file path without authority", (assert) => {
	const p = parseSource("file:///tmp/x/?fileName=p.csv");
	assert.strictEqual(p.protocol, "file");
	assert.strictEqual(p.path, "/tmp/x/");
	assert.strictEqual(p.host, "", "no host for file");
	assert.strictEqual(p.matchMode, "name");
	assert.strictEqual(p.fileName, "p.csv");
});

QUnit.test("parseSource: empty and invalid input return defaults", (assert) => {
	assert.strictEqual(parseSource("").protocol, "file");
	assert.strictEqual(parseSource("garbage-no-scheme").protocol, "file", "no :// → defaults");
});

QUnit.test("parseSource inverts buildSource (round-trip, sftp)", (assert) => {
	const url = "sftp://user@host:22/data/?password=secret&fileName=a.csv&consumer.delay=30&move=.camel";
	const p = parseSource(url);
	assert.strictEqual(p.protocol, "sftp");
	assert.strictEqual(p.user, "user");
	assert.strictEqual(p.host, "host");
	assert.strictEqual(p.port, "22");
	assert.strictEqual(p.path, "/data/");
	assert.strictEqual(p.password, "secret");
	assert.strictEqual(p.matchMode, "name");
	assert.strictEqual(p.fileName, "a.csv");
	assert.strictEqual(p.delayVal, "30");
	assert.strictEqual(p.move, ".camel");
	assert.strictEqual(buildSource(p), url, "round-trips back to the same URI");
});
