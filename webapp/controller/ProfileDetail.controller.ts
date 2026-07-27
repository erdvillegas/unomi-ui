import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import Event from "sap/ui/base/Event";
import ListItemBase from "sap/m/ListItemBase";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import { PartialList } from "unomi/ui/service/UnomiClient";
import { Profile, Session, UnomiEvent, Metadata } from "unomi/ui/model/types";

/**
 * @namespace unomi.ui.controller
 */
export default class ProfileDetail extends BaseController {

	public onInit(): void {
		this.getView()?.setModel(new JSONModel({
			profileId: "",
			props: [] as { key: string; value: string }[],
			segments: [] as Metadata[],
			sessions: [] as Session[],
			events: [] as UnomiEvent[],
			busy: false
		}), "detail");
		this.getRouter().getRoute("profileDetail")?.attachPatternMatched(this.onShow, this);
	}

	private onShow(event: Event): void {
		if (!this.requireAuth()) {
			return;
		}
		const id = decodeURIComponent(event.getParameter("arguments" as never)["profileId"] as string);
		void this.load(id);
	}

	private async load(id: string): Promise<void> {
		const model = this.getView()?.getModel("detail") as JSONModel;
		model.setData({ profileId: id, props: [], segments: [], sessions: [], events: [], busy: true });
		const enc = encodeURIComponent(id);
		try {
			const [profile, segments, sessions] = await Promise.all([
				UnomiClient.getJson<Profile>(`/profiles/${enc}`),
				UnomiClient.getJson<Metadata[]>(`/profiles/${enc}/segments`),
				UnomiClient.getJson<PartialList<Session>>(`/profiles/${enc}/sessions?size=50`)
			]);
			model.setProperty("/props", toKeyValue(profile.properties));
			model.setProperty("/segments", segments);
			model.setProperty("/sessions", sessions.list);
		} catch (e) {
			MessageToast.show(`Load failed: ${(e as Error).message}`);
		} finally {
			model.setProperty("/busy", false);
		}
	}

	public async onSessionPress(event: Event): Promise<void> {
		const item = event.getParameter("listItem" as never) as ListItemBase;
		const session = item.getBindingContext("detail")?.getObject() as Session;
		const model = this.getView()?.getModel("detail") as JSONModel;
		try {
			const events = await UnomiClient.getJson<PartialList<UnomiEvent>>(
				`/profiles/sessions/${encodeURIComponent(session.itemId)}/events?size=50`
			);
			model.setProperty("/events", events.list);
		} catch (e) {
			MessageToast.show(`Events failed: ${(e as Error).message}`);
		}
	}

	public onNavBack(): void {
		this.getRouter().navTo("profiles");
	}
}

/** Flatten a properties object into rows; stringify nested values. */
function toKeyValue(obj?: Record<string, unknown>): { key: string; value: string }[] {
	if (!obj) {
		return [];
	}
	return Object.keys(obj).map((key) => {
		const v = obj[key];
		return { key, value: typeof v === "object" ? JSON.stringify(v) : String(v) };
	});
}
