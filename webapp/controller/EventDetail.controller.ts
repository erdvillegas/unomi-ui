import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import Event from "sap/ui/base/Event";
import * as UnomiClient from "unomi/ui/service/UnomiClient";

/**
 * @namespace unomi.ui.controller
 */
export default class EventDetail extends BaseController {

	public onInit(): void {
		this.getView()?.setModel(new JSONModel({ title: "", e: {}, json: "", busy: false }), "detail");
		this.getRouter().getRoute("eventDetail")?.attachPatternMatched(this.onShow, this);
	}

	private onShow(event: Event): void {
		if (!this.requireAuth()) {
			return;
		}
		const id = decodeURIComponent(event.getParameter("arguments" as never)["eventId"] as string);
		void this.load(id);
	}

	private async load(id: string): Promise<void> {
		const model = this.getView()?.getModel("detail") as JSONModel;
		model.setData({ title: id, e: {}, json: "", busy: true });
		try {
			const ev = await UnomiClient.getJson<{ eventType?: string }>(`/events/${encodeURIComponent(id)}`);
			model.setProperty("/e", ev);
			model.setProperty("/title", ev.eventType || id);
			model.setProperty("/json", JSON.stringify(ev, null, 2));
		} catch (e) {
			MessageToast.show(`Load failed: ${(e as Error).message}`);
		} finally {
			model.setProperty("/busy", false);
		}
	}

	public onNavBack(): void {
		this.getRouter().navTo("events");
	}
}
