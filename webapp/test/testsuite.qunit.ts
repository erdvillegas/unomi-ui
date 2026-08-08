// UI5 Test Starter suite definition. Lists the test modules karma-ui5 runs.
// No `page` → the framework's generic Test.qunit.html runner is used.
export default {
	name: "QUnit test suite for unomi.ui",
	defaults: {
		qunit: { version: 2 },
		ui5: {
			language: "EN",
			theme: "sap_horizon"
		},
		loader: {
			// Absolute (karma basePath) so it resolves the same from the generic
			// runner page regardless of that page's directory. karma-ui5 rewrites
			// /base/webapp/* to the tooling middleware, which transpiles the .ts.
			paths: {
				"unomi/ui": "/base/webapp"
			}
		}
	},
	tests: {
		"unit/unitTests": {
			title: "Unit tests for unomi.ui"
		}
	}
};
