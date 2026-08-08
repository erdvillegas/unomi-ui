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
		browsers: ["ChromeHeadless"],
		reporters: ["progress"],
		browserConsoleLogOptions: { level: "error" },
		singleRun: true
	});
};
