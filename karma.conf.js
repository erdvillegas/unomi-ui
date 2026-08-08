// karma-ui5 boots the app through the ui5-tooling-transpile middleware, so the
// TypeScript tests + sources are transpiled exactly as in `ui5 serve`. Coverage is
// instrumented there (babel-plugin-istanbul, enabled in ui5.yaml) and bridged out of
// the test iframe by karma-ui5's helper below.
module.exports = function (config) {
	config.set({
		frameworks: ["ui5"],
		ui5: {
			type: "application"
		},
		browsers: ["ChromeHeadless"],
		reporters: ["progress", "coverage"],
		coverageReporter: {
			includeAllSources: true,
			dir: "coverage",
			reporters: [
				{ type: "text-summary" },
				{ type: "html", subdir: "html" },
				{ type: "lcovonly", subdir: ".", file: "lcov.info" }
			],
			// The plan's target: 90% line coverage. Fails the run below it. Only lines is
			// gated (the stated goal); branches/functions are reported, not enforced.
			check: { global: { lines: 90 } }
		},
		browserConsoleLogOptions: { level: "error" },
		singleRun: true
	});

	// Bridges coverage collected inside the UI5 test iframe to karma-coverage (v2+).
	require("karma-ui5/helper").configureIframeCoverage(config);
};
