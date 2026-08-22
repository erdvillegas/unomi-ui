import BaseController from "unomi/ui/controller/BaseController";
import Event from "sap/ui/base/Event";
import Link from "sap/m/Link";

/**
 * @namespace unomi.ui.controller
 */
export default class Home extends BaseController {

	// Auth-gated visibility binds to the shared session>/authed model
	// (set in App.onRouteMatched), so this controller only handles navigation.

	// Tile links carry their target route in custom data `nav`.
	public onNav(event: Event): void {
		this.getRouter().navTo((event.getSource() as Link).data("nav") as string);
	}

	public onLogin(): void {
		this.getRouter().navTo("login");
	}
}
