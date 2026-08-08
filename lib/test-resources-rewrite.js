// Dev-server middleware: map the Test Starter's virtual test path
// /test-resources/unomi/ui/* onto the app's real test folder /test/*, so the
// same QUnit/OPA5 suite runs both in the browser (`ui5 serve`) and headless
// (karma-ui5 applies this same customMiddleware). The rewritten URL then flows
// through the transpile middleware, so the .ts is served as .js.
const PREFIX = "/test-resources/unomi/ui/";

module.exports = function () {
	return function (req, res, next) {
		if (req.url.startsWith(PREFIX)) {
			req.url = "/test/" + req.url.slice(PREFIX.length);
		}
		next();
	};
};
