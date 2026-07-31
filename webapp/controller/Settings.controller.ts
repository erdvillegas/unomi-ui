import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import * as Settings from "unomi/ui/service/Settings";

/**
 * @namespace unomi.ui.controller
 */
export default class SettingsController extends BaseController {

	public onInit(): void {
		this.getRouter().getRoute("settings")?.attachPatternMatched(this.onShow, this);
	}

	private onShow(): void {
		// Edit a copy; the live "app" model is only updated on Save.
		this.getView()?.setModel(new JSONModel(Settings.load()), "settings");
	}

	public onSave(): void {
		const cfg = (this.getView()?.getModel("settings") as JSONModel).getData() as Settings.AppSettings;
		Settings.save(cfg);
		UnomiClient.setBaseUrl(cfg.baseUrl);
		(this.getOwnerComponent()?.getModel("app") as JSONModel).setData(cfg);
		MessageToast.show("Saved");
	}
}
