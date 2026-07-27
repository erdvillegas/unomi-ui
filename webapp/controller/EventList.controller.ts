import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import Event from "sap/ui/base/Event";
import ListItemBase from "sap/m/ListItemBase";
import * as UnomiClient from "unomi/ui/service/UnomiClient";

// Events are read-only from the admin API (POST /events/search + GET /events/{id});
// there is no create/update/delete — they are ingested via the tracker/eventcollector.
interface UEvent { itemId: string; eventType: string; scope: string; profileId?: string; timeStamp?: string; }
const PAGE = 25;

/**
 * @namespace unomi.ui.controller
 */
export default class EventList extends BaseController {

	private offset = 0;

	public onInit(): void {
		this.getView()?.setModel(new JSONModel({
			events: [] as UEvent[], total: 0, busy: false, canLoadMore: false,
			types: [{ key: "", text: "(all types)" }] as { key: string; text: string }[],
			f: { eventType: "", scope: "", profileId: "" }
		}), "list");
		this.getRouter().getRoute("events")?.attachPatternMatched(this.onShow, this);
	}

	private onShow(): void {
		if (!this.requireAuth()) {
			return;
		}
		void this.initTypes();
		void this.load(true);
	}

	// Populate the eventType filter from /events/types (once).
	private async initTypes(): Promise<void> {
		const model = this.getView()?.getModel("list") as JSONModel;
		if ((model.getProperty("/types") as unknown[]).length > 1) {
			return;
		}
		try {
			const types = await UnomiClient.getJson<string[]>("/events/types");
			model.setProperty("/types", [{ key: "", text: "(all types)" }, ...types.map((t) => ({ key: t, text: t }))]);
		} catch { /* filter stays "(all types)" only */ }
	}

	// Build a booleanCondition AND from the non-empty filters (matchAll if none).
	private buildCondition(): object {
		const f = (this.getView()?.getModel("list") as JSONModel).getProperty("/f") as Record<string, string>;
		const subs = Object.entries(f)
			.filter(([, v]) => v)
			.map(([propertyName, propertyValue]) => ({ type: "eventPropertyCondition", parameterValues: { propertyName, comparisonOperator: "equals", propertyValue } }));
		return subs.length === 0
			? { type: "matchAllCondition", parameterValues: {} }
			: { type: "booleanCondition", parameterValues: { operator: "and", subConditions: subs } };
	}

	public onSearch(): void {
		void this.load(true);
	}

	public onLoadMore(): void {
		void this.load(false);
	}

	private async load(reset: boolean): Promise<void> {
		const model = this.getView()?.getModel("list") as JSONModel;
		if (reset) {
			this.offset = 0;
		}
		model.setProperty("/busy", true);
		try {
			const res = await UnomiClient.queryList<UEvent>("/events/search", {
				condition: this.buildCondition(), offset: this.offset, limit: PAGE, sortby: "timeStamp:desc"
			});
			const current = reset ? [] : (model.getProperty("/events") as UEvent[]);
			model.setProperty("/events", current.concat(res.list));
			model.setProperty("/total", res.totalSize);
			this.offset += res.list.length;
			model.setProperty("/canLoadMore", this.offset < res.totalSize);
		} catch (e) {
			MessageToast.show(`Search failed: ${(e as Error).message}`);
		} finally {
			model.setProperty("/busy", false);
		}
	}

	public onEventPress(event: Event): void {
		const item = event.getParameter("listItem" as never) as ListItemBase;
		const ev = item.getBindingContext("list")?.getObject() as UEvent;
		this.getRouter().navTo("eventDetail", { eventId: encodeURIComponent(ev.itemId) });
	}
}
