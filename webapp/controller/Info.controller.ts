import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import VersionInfo from "sap/ui/VersionInfo";
import Component from "unomi/ui/Component";
import * as Settings from "unomi/ui/service/Settings";

/**
 * @namespace unomi.ui.controller
 */
export default class Info extends BaseController {

	public onInit(): void {
		this.getRouter().getRoute("info")?.attachPatternMatched(this.onShow, this);
	}

	// Version info model: app name/version (manifest), UI5 runtime version, API base URL.
	private async onShow(): Promise<void> {
		const comp = this.getOwnerComponent() as Component;
		const cfg = Settings.load();
		let ui5Version = "";
		try {
			ui5Version = ((await VersionInfo.load()) as { version?: string }).version || "";
		} catch { /* version info unavailable — leave blank */ }
		this.getView()?.setModel(new JSONModel({
			appName: cfg.appName,
			appVersion: comp?.getManifestEntry("/sap.app/applicationVersion/version") as string,
			ui5Version,
			baseUrl: cfg.baseUrl
		}), "info");
	}
}
