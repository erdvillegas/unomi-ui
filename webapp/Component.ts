import UIComponent from "sap/ui/core/UIComponent";
import JSONModel from "sap/ui/model/json/JSONModel";
import Device from "sap/ui/Device";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import * as Settings from "unomi/ui/service/Settings";

/**
 * @namespace unomi.ui
 */
export default class Component extends UIComponent {
	public static metadata = {
		manifest: "json",
		interfaces: ["sap.ui.core.IAsyncContentCreation"]
	};

	public init(): void {
		super.init();
		const cfg = Settings.load();
		UnomiClient.setBaseUrl(cfg.baseUrl);
		this.setModel(new JSONModel(cfg), "app");
		this.getRouter().initialize();
	}

	// Fiori content density: compact on desktop (denser tables/forms), cozy on touch.
	public getContentDensityClass(): string {
		return Device.support.touch ? "sapUiSizeCozy" : "sapUiSizeCompact";
	}
}
