import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import Event from "sap/ui/base/Event";
import ListItemBase from "sap/m/ListItemBase";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import { Metadata } from "unomi/ui/model/types";

// One view/controller serves every metadata list; config is picked by route name.
// `extract` normalizes each endpoint's response to a flat Metadata[] — most return
// Metadata[] already, but scopes/lists/properties wrap full items differently.
interface ListCfg { path: string; title: string; detail: string; extract?: (raw: any) => Metadata[]; }
const RES: Record<string, ListCfg> = {
	segments: { path: "/segments", title: "Segments", detail: "segmentDetail" },
	rules: { path: "/rules", title: "Rules", detail: "ruleDetail" },
	scoring: { path: "/scoring", title: "Scoring", detail: "scoringDetail" },
	goals: { path: "/goals", title: "Goals", detail: "goalDetail" },
	campaigns: { path: "/campaigns", title: "Campaigns", detail: "campaignDetail" },
	scopes: { path: "/scopes", title: "Scopes", detail: "scopeDetail", extract: (r) => (r as { metadata: Metadata }[]).map((x) => x.metadata) },
	lists: { path: "/lists", title: "Lists", detail: "listDetail", extract: (r) => ((r as { list: { metadata: Metadata }[] }).list || []).map((x) => x.metadata) },
	properties: { path: "/profiles/properties", title: "Properties", detail: "propertyDetail", extract: (r) => Object.values(r as Record<string, { metadata: Metadata }[]>).flat().map((x) => x.metadata) },
	importConfig: { path: "/importConfiguration", title: "Import config", detail: "importConfigDetail", extract: (r) => (r as { itemId: string; name: string; active: boolean }[]).map((c) => ({ id: c.itemId, name: c.name, enabled: c.active })) },
	exportConfig: { path: "/exportConfiguration", title: "Export config", detail: "exportConfigDetail", extract: (r) => (r as { itemId: string; name: string; active: boolean }[]).map((c) => ({ id: c.itemId, name: c.name, enabled: c.active })) }
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

	private async load(cfg: ListCfg): Promise<void> {
		const model = this.getView()?.getModel("list") as JSONModel;
		model.setProperty("/title", cfg.title);
		model.setProperty("/busy", true);
		try {
			const raw = await UnomiClient.getJson<unknown>(cfg.path);
			model.setProperty("/items", cfg.extract ? cfg.extract(raw) : raw);
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
