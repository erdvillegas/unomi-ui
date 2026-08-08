// UI5 Test Starter suite definition. Lists the test modules the runner loads.
// No `page` → the framework's generic Test.qunit.html runner is used.

// The app root differs per environment: karma-ui5 serves it under /base/webapp,
// while `ui5 serve` (browser) serves it at /. Resolve it so `unomi/ui/*` loads in
// both — enabling the same suite to run headless (npm test) and in a browser.
const appRoot = location.pathname.indexOf("/base/") === 0 ? "/base/webapp" : "/";

export default {
	name: "QUnit test suite for unomi.ui",
	defaults: {
		qunit: { version: 2 },
		ui5: {
			language: "EN",
			theme: "sap_horizon"
		},
		loader: {
			// Absolute so it resolves the same from the generic runner page
			// regardless of that page's directory, in both environments.
			paths: {
				"unomi/ui": appRoot
			}
		}
	},
	tests: {
		"unit/unitTests": {
			title: "Unit tests for unomi.ui"
		},
		"integration/opaTests": {
			title: "Integration (OPA5) tests for unomi.ui"
		}
	}
};
