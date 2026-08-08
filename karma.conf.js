// karma-ui5 boots the app through the ui5-tooling-transpile middleware, so the
// TypeScript tests + sources are transpiled exactly as in `ui5 serve`.
// Coverage instrumentation + the 90% gate are wired in a later phase (see
// docs/test-plan.md); phase 1 just proves the harness runs.
module.exports = function (config) {
	config.set({
		frameworks: ["ui5"],
		ui5: {
			type: "application"
		},
		// The Test Starter resolves the app's tests under test-resources/<namespace>,
		// but for an application project karma-ui5 serves the app (incl. its test
		// folder) flat under /base/webapp. Map the virtual namespace path back to the
		// real test folder so the tooling middleware transpiles + serves it.
		proxies: {
			"/base/webapp/test-resources/unomi/ui/": "/base/webapp/test/"
		},
		browsers: ["ChromeHeadless"],
		reporters: ["progress"],
		browserConsoleLogOptions: { level: "error" },
		singleRun: true
	});
};
