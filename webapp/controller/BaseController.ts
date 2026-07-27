import Controller from "sap/ui/core/mvc/Controller";
import UIComponent from "sap/ui/core/UIComponent";
import Router from "sap/ui/core/routing/Router";
import * as UnomiClient from "unomi/ui/service/UnomiClient";

/**
 * @namespace unomi.ui.controller
 */
export default class BaseController extends Controller {
	public getRouter(): Router {
		return (this.getOwnerComponent() as UIComponent).getRouter();
	}

	/** Redirect to login if there are no credentials. Returns false when redirected. */
	protected requireAuth(): boolean {
		if (!UnomiClient.isAuthenticated()) {
			this.getRouter().navTo("login");
			return false;
		}
		return true;
	}
}
