import BaseController from "unomi/ui/controller/BaseController";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";
import SideNavigation from "sap/tnt/SideNavigation";
import ToolPage from "sap/tnt/ToolPage";
import Component from "unomi/ui/Component";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import * as Catalog from "unomi/ui/service/Catalog";

// Route name -> side-nav key (detail routes highlight their parent section).
const NAV_KEY: Record<string, string> = {
	login: "login",
	home: "home",
	profiles: "profiles", profileDetail: "profiles",
	events: "events", eventDetail: "events",
	segments: "segments", segmentDetail: "segments",
	rules: "rules", ruleDetail: "rules",
	scoring: "scoring", scoringDetail: "scoring",
	goals: "goals", goalDetail: "goals",
	campaigns: "campaigns", campaignDetail: "campaigns",
	scopes: "scopes", scopeDetail: "scopes",
	lists: "lists", listDetail: "lists",
	properties: "properties", propertyDetail: "properties",
	importConfig: "importConfig", importConfigDetail: "importConfig",
	exportConfig: "exportConfig", exportConfigDetail: "exportConfig",
	definitions: "definitions",
	settings: "settings",
	info: "info"
};

/**
 * @namespace unomi.ui.controller
 */
export default class App extends BaseController {

	public onInit(): void {
		this.getView()?.addStyleClass((this.getOwnerComponent() as Component).getContentDensityClass());
		this.getRouter().attachRouteMatched(this.onRouteMatched, this);
	}

	private onRouteMatched(event: Event): void {
		const name = event.getParameter("name" as never) as string;
		// Logged out → nav shows only the Login entry (item visibility bound to session>/authed).
		(this.getOwnerComponent()?.getModel("session") as JSONModel).setProperty("/authed", UnomiClient.isAuthenticated());
		(this.byId("toolPage") as ToolPage).setSideExpanded(name !== "login");
		(this.byId("sideNav") as SideNavigation).setSelectedKey(NAV_KEY[name] ?? "");
	}

	public onNavSelect(event: Event): void {
		const key = (event.getParameter("item" as never) as { getKey(): string }).getKey();
		if (key === "logout") {
			this.onLogout();
			return;
		}
		this.getRouter().navTo(key);
	}

	public onSideNavButtonPress(): void {
		const nav = this.byId("toolPage") as ToolPage;
		nav.setSideExpanded(!nav.getSideExpanded());
	}

	public onLogout(): void {
		UnomiClient.clearCredentials();
		Catalog.invalidate(); // don't leak one session's catalogs into the next
		this.getRouter().navTo("login");
	}
}
