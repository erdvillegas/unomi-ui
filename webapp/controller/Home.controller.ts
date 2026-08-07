import BaseController from "unomi/ui/controller/BaseController";
import Event from "sap/ui/base/Event";
import Link from "sap/m/Link";
import JSONModel from "sap/ui/model/json/JSONModel";
import * as UnomiClient from "unomi/ui/service/UnomiClient";

/**
 * @namespace unomi.ui.controller
 */
export default class Home extends BaseController {

	public onInit(): void {
		this.getView()?.setModel(new JSONModel({ authed: false }), "home");
		this.getRouter().getRoute("home")?.attachPatternMatched(this.onShow, this);
	}

	// Landing page: don't redirect when logged out — just hide the controls.
	private onShow(): void {
		(this.getView()?.getModel("home") as JSONModel).setProperty("/authed", UnomiClient.isAuthenticated());
	}

	// Tile links carry their target route in custom data `nav`.
	public onNav(event: Event): void {
		this.getRouter().navTo((event.getSource() as Link).data("nav") as string);
	}

	public onLogin(): void {
		this.getRouter().navTo("login");
	}
}
