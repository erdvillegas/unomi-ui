/*global QUnit */
import * as Settings from "unomi/ui/service/Settings";
import Theming from "sap/ui/core/Theming";
import Localization from "sap/base/i18n/Localization";

const KEY = "unomi-ui-settings";

QUnit.module("service/Settings", {
	afterEach() {
		localStorage.removeItem(KEY);
	}
});

QUnit.test("load returns defaults when storage empty", (assert) => {
	localStorage.removeItem(KEY);
	const s = Settings.load();
	assert.strictEqual(s.appName, "Unomi UI");
	assert.strictEqual(s.baseUrl, "/cxs");
	assert.strictEqual(s.theme, "sap_horizon");
	assert.strictEqual(s.language, "", "language defaults to browser");
});

QUnit.test("load merges stored values over defaults", (assert) => {
	localStorage.setItem(KEY, JSON.stringify({ baseUrl: "/api", language: "es" }));
	const s = Settings.load();
	assert.strictEqual(s.baseUrl, "/api", "stored override wins");
	assert.strictEqual(s.language, "es");
	assert.strictEqual(s.theme, "sap_horizon", "unset field keeps default");
});

QUnit.test("load falls back to defaults on corrupt JSON", (assert) => {
	localStorage.setItem(KEY, "{not valid json");
	assert.strictEqual(Settings.load().appName, "Unomi UI", "no throw, defaults returned");
});

QUnit.test("save writes the settings JSON under the key", (assert) => {
	Settings.save({ appName: "X", baseUrl: "/b", theme: "t", language: "en" });
	assert.deepEqual(
		JSON.parse(localStorage.getItem(KEY) || "null"),
		{ appName: "X", baseUrl: "/b", theme: "t", language: "en" }
	);
});

QUnit.test("applyTheme uses the theme, defaults when empty", (assert) => {
	const theming = Theming as unknown as { setTheme: (t: string) => void };
	const orig = theming.setTheme;
	const seen: string[] = [];
	theming.setTheme = (t) => seen.push(t) as unknown as void;
	Settings.applyTheme("sap_fiori_3");
	Settings.applyTheme("");
	theming.setTheme = orig;
	assert.deepEqual(seen, ["sap_fiori_3", "sap_horizon"], "explicit then default");
});

QUnit.test("applyLanguage sets only a non-empty language", (assert) => {
	const loc = Localization as unknown as { setLanguage: (l: string) => void };
	const orig = loc.setLanguage;
	const seen: string[] = [];
	loc.setLanguage = (l) => seen.push(l) as unknown as void;
	Settings.applyLanguage("");
	Settings.applyLanguage("es");
	loc.setLanguage = orig;
	assert.deepEqual(seen, ["es"], "empty skipped, es applied");
});
