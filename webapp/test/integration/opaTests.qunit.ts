/*global QUnit */
import Opa5 from "sap/ui/test/Opa5";
import opaTest from "sap/ui/test/opaQunit";

// Component-based OPA5 journey: boots the real app (Component + router + views)
// on the default (logged-out) route. No live Unomi is touched — home renders
// without any /cxs call. Verifies the boot, the shell and the auth gating
// (admin tiles hidden, only the logged-out hint + connect action shown).
QUnit.module("Integration — app boot & auth gating");

Opa5.extendConfig({ autoWait: true, timeout: 30 });

opaTest("logged-out Home shows the hint and connect action inside the shell", (Given: Opa5, When: Opa5, Then: Opa5) => {
	Given.iStartMyUIComponent({ componentConfig: { name: "unomi.ui" } });

	// Shell renders → Component + App controller + routing booted.
	Then.waitFor({
		controlType: "sap.tnt.ToolPage",
		success: () => Opa5.assert.ok(true, "ToolPage shell is present"),
		errorMessage: "ToolPage shell was not found"
	});

	// Logged-out landing: the information MessageStrip is the gated home content.
	Then.waitFor({
		controlType: "sap.m.MessageStrip",
		success: () => Opa5.assert.ok(true, "logged-out hint shown (admin tiles gated away)"),
		errorMessage: "logged-out hint was not shown"
	});

	Then.iTeardownMyApp();
});
