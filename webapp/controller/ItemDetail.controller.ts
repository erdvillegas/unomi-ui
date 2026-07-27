import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import Event from "sap/ui/base/Event";
import * as UnomiClient from "unomi/ui/service/UnomiClient";

// Route name -> resource path, its list route, whether it has /statistics (rules),
// and the skeleton used when creating a new item.
const meta = { id: "", name: "", scope: "systemscope", enabled: true };
const RES: Record<string, { path: string; list: string; stats: boolean; template: object }> = {
	segmentDetail: { path: "/segments", list: "segments", stats: false, template: { metadata: meta, condition: { type: "matchAllCondition", parameterValues: {} } } },
	ruleDetail: { path: "/rules", list: "rules", stats: true, template: { metadata: meta, condition: { type: "matchAllCondition", parameterValues: {} }, actions: [] } },
	scoringDetail: { path: "/scoring", list: "scoring", stats: false, template: { metadata: meta, elements: [] } },
	goalDetail: { path: "/goals", list: "goals", stats: false, template: { metadata: meta } },
	campaignDetail: { path: "/campaigns", list: "campaigns", stats: false, template: { metadata: meta } }
};

interface Named { itemId?: string; metadata?: { name?: string; description?: string }; }

/**
 * @namespace unomi.ui.controller
 */
export default class ItemDetail extends BaseController {

	private cfg = RES.segmentDetail;
	private itemId = "";

	public onInit(): void {
		this.getView()?.setModel(new JSONModel({
			name: "", description: "", json: "", stats: "", hasStats: false, isNew: false, canEditCondition: false, busy: false
		}), "detail");
		const router = this.getRouter();
		Object.keys(RES).forEach((name) => router.getRoute(name)?.attachPatternMatched(this.onShow, this));
	}

	private onShow(event: Event): void {
		if (!this.requireAuth()) {
			return;
		}
		this.cfg = RES[event.getParameter("name" as never) as string];
		this.itemId = decodeURIComponent(event.getParameter("arguments" as never)["itemId"] as string);
		void this.load();
	}

	private async load(): Promise<void> {
		const model = this.getView()?.getModel("detail") as JSONModel;
		const isNew = this.itemId === "new";
		// Segments and rules carry a top-level `condition` the visual builder can edit.
		const canEditCondition = !isNew && (this.cfg.list === "segments" || this.cfg.list === "rules");
		model.setData({ name: this.itemId, description: "", json: "", stats: "", hasStats: this.cfg.stats && !isNew, isNew, canEditCondition, busy: !isNew });
		if (isNew) {
			model.setProperty("/name", "New");
			model.setProperty("/json", JSON.stringify(this.cfg.template, null, 2));
			return;
		}
		const enc = encodeURIComponent(this.itemId);
		try {
			const item = await UnomiClient.getJson<Named>(`${this.cfg.path}/${enc}`);
			model.setProperty("/name", item.metadata?.name || this.itemId);
			model.setProperty("/description", item.metadata?.description || "");
			model.setProperty("/json", JSON.stringify(item, null, 2));
			if (this.cfg.stats) {
				const stats = await UnomiClient.getJson<object>(`${this.cfg.path}/${enc}/statistics`);
				model.setProperty("/stats", JSON.stringify(stats, null, 2));
			}
		} catch (e) {
			MessageToast.show(`Load failed: ${(e as Error).message}`);
		} finally {
			model.setProperty("/busy", false);
		}
	}

	public async onSave(): Promise<void> {
		const model = this.getView()?.getModel("detail") as JSONModel;
		let body: object;
		try {
			body = JSON.parse(model.getProperty("/json") as string) as object;
		} catch (e) {
			MessageToast.show(`Invalid JSON: ${(e as Error).message}`);
			return;
		}
		try {
			await UnomiClient.postJson(this.cfg.path, body);
			MessageToast.show("Saved");
			this.getRouter().navTo(this.cfg.list);
		} catch (e) {
			MessageToast.show(`Save failed: ${(e as Error).message}`);
		}
	}

	public onEditCondition(): void {
		this.getRouter().navTo("conditionEditor", { res: this.cfg.list, itemId: encodeURIComponent(this.itemId) });
	}

	public onDelete(): void {
		MessageBox.confirm(`Delete "${this.itemId}"?`, {
			onClose: (action: string | null) => {
				if (action === MessageBox.Action.OK) {
					void this.doDelete();
				}
			}
		});
	}

	private async doDelete(): Promise<void> {
		try {
			await UnomiClient.del(`${this.cfg.path}/${encodeURIComponent(this.itemId)}`);
			MessageToast.show("Deleted");
			this.getRouter().navTo(this.cfg.list);
		} catch (e) {
			MessageToast.show(`Delete failed: ${(e as Error).message}`);
		}
	}

	public onNavBack(): void {
		this.getRouter().navTo(this.cfg.list);
	}
}
