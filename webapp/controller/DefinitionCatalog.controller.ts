import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import { Metadata } from "unomi/ui/model/types";

/**
 * @namespace unomi.ui.controller
 */
export default class DefinitionCatalog extends BaseController {

	public onInit(): void {
		this.getView()?.setModel(new JSONModel({ conditions: [], actions: [], busy: false }), "cat");
		this.getRouter().getRoute("definitions")?.attachPatternMatched(this.onShow, this);
	}

	private async onShow(): Promise<void> {
		if (!this.requireAuth()) {
			return;
		}
		const model = this.getView()?.getModel("cat") as JSONModel;
		model.setProperty("/busy", true);
		try {
			const [conditions, actions] = await Promise.all([
				UnomiClient.getJson<Metadata[]>("/definitions/conditions"),
				UnomiClient.getJson<Metadata[]>("/definitions/actions")
			]);
			model.setProperty("/conditions", conditions);
			model.setProperty("/actions", actions);
		} catch (e) {
			MessageToast.show(`Load failed: ${(e as Error).message}`);
		} finally {
			model.setProperty("/busy", false);
		}
	}
}
