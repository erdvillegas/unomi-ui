import BaseController from "unomi/ui/controller/BaseController";
import Event from "sap/ui/base/Event";
import UI5Element from "sap/ui/core/Element";
import JSONModel from "sap/ui/model/json/JSONModel";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import Component from "unomi/ui/Component";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import * as Catalog from "unomi/ui/service/Catalog";

// Route name -> module key (detail routes fold into their parent module).
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
	queries: "queries",
	dataProtection: "dataProtection",
	definitions: "definitions",
	settings: "settings",
	info: "info"
};

// Module key -> i18n label key, shown as the header module-selector text.
const MODULE_LABEL: Record<string, string> = {
	home: "module.home", profiles: "module.profiles", events: "module.events",
	segments: "module.segments", rules: "module.rules", scoring: "module.scoring",
	goals: "module.goals", campaigns: "module.campaigns", lists: "module.lists",
	scopes: "module.scopes", properties: "module.properties",
	importConfig: "module.importConfig", exportConfig: "module.exportConfig",
	queries: "module.queries", dataProtection: "dp.title", definitions: "module.definitions",
	settings: "module.settings", info: "module.info", login: "module.login"
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
		// Logged out → the module selector and user menu hide (bound to session>/authed).
		(this.getOwnerComponent()?.getModel("session") as JSONModel).setProperty("/authed", UnomiClient.isAuthenticated());
		const bundle = (this.getOwnerComponent()?.getModel("i18n") as ResourceModel).getResourceBundle() as ResourceBundle;
		const labelKey = MODULE_LABEL[NAV_KEY[name] ?? name];
		(this.getOwnerComponent()?.getModel("app") as JSONModel).setProperty("/currentModule", labelKey ? bundle.getText(labelKey) : "");
	}

	// Header module selector + user menu: each MenuItem carries its route in app:nav.
	public onNav(event: Event): void {
		this.getRouter().navTo((event.getSource() as UI5Element).data("nav") as string);
	}

	public onLogout(): void {
		UnomiClient.clearCredentials();
		Catalog.invalidate(); // don't leak one session's catalogs into the next
		this.getRouter().navTo("login");
	}
}
