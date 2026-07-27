import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import Event from "sap/ui/base/Event";
import ListItemBase from "sap/m/ListItemBase";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import { Metadata } from "unomi/ui/model/types";

// One view/controller serves both routes; config is picked by route name.
const RES: Record<string, { path: string; title: string; detail: string }> = {
	segments: { path: "/segments", title: "Segments", detail: "segmentDetail" },
	rules: { path: "/rules", title: "Rules", detail: "ruleDetail" },
	scoring: { path: "/scoring", title: "Scoring", detail: "scoringDetail" },
	goals: { path: "/goals", title: "Goals", detail: "goalDetail" },
	campaigns: { path: "/campaigns", title: "Campaigns", detail: "campaignDetail" }
};

/**
 * @namespace unomi.ui.controller
 */
export default class MetadataList extends BaseController {

	private detailRoute = "";

	public onInit(): void {
		this.getView()?.setModel(new JSONModel({ title: "", items: [] as Metadata[], busy: false }), "list");
		const router = this.getRouter();
		Object.keys(RES).forEach((name) => router.getRoute(name)?.attachPatternMatched(this.onShow, this));
	}

	private onShow(event: Event): void {
		if (!this.requireAuth()) {
			return;
		}
		const cfg = RES[event.getParameter("name" as never) as string];
		this.detailRoute = cfg.detail;
		void this.load(cfg);
	}

	private async load(cfg: { path: string; title: string }): Promise<void> {
		const model = this.getView()?.getModel("list") as JSONModel;
		model.setProperty("/title", cfg.title);
		model.setProperty("/busy", true);
		try {
			const items = await UnomiClient.getJson<Metadata[]>(cfg.path);
			model.setProperty("/items", items);
		} catch (e) {
			MessageToast.show(`Load failed: ${(e as Error).message}`);
		} finally {
			model.setProperty("/busy", false);
		}
	}

	public onPress(event: Event): void {
		const item = event.getParameter("listItem" as never) as ListItemBase;
		const meta = item.getBindingContext("list")?.getObject() as Metadata;
		this.getRouter().navTo(this.detailRoute, { itemId: encodeURIComponent(meta.id) });
	}

	public onNew(): void {
		this.getRouter().navTo(this.detailRoute, { itemId: "new" });
	}
}
