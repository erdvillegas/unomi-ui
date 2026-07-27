import BaseController from "unomi/ui/controller/BaseController";
import Event from "sap/ui/base/Event";
import SideNavigation from "sap/tnt/SideNavigation";
import ToolPage from "sap/tnt/ToolPage";
import * as UnomiClient from "unomi/ui/service/UnomiClient";

// Route name -> side-nav key (detail routes highlight their parent section).
const NAV_KEY: Record<string, string> = {
	profiles: "profiles", profileDetail: "profiles",
	segments: "segments", segmentDetail: "segments",
	rules: "rules", ruleDetail: "rules",
	scoring: "scoring", scoringDetail: "scoring",
	goals: "goals", goalDetail: "goals",
	campaigns: "campaigns", campaignDetail: "campaigns",
	scopes: "scopes", scopeDetail: "scopes",
	lists: "lists", listDetail: "lists",
	properties: "properties", propertyDetail: "properties",
	definitions: "definitions"
};

/**
 * @namespace unomi.ui.controller
 */
export default class App extends BaseController {

	public onInit(): void {
		this.getRouter().attachRouteMatched(this.onRouteMatched, this);
	}

	private onRouteMatched(event: Event): void {
		const name = event.getParameter("name" as never) as string;
		const isLogin = name === "login";
		(this.byId("toolPage") as ToolPage).setSideExpanded(!isLogin);
		(this.byId("sideNav") as SideNavigation).setSelectedKey(NAV_KEY[name] ?? "");
	}

	public onNavSelect(event: Event): void {
		const key = (event.getParameter("item" as never) as { getKey(): string }).getKey();
		this.getRouter().navTo(key);
	}

	public onLogout(): void {
		UnomiClient.clearCredentials();
		this.getRouter().navTo("login");
	}
}
