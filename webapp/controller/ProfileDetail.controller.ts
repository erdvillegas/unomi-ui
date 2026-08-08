import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import Event from "sap/ui/base/Event";
import ListItemBase from "sap/m/ListItemBase";
import VBox from "sap/m/VBox";
import Input from "sap/m/Input";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import { PartialList } from "unomi/ui/service/UnomiClient";
import { Session, UnomiEvent, Metadata } from "unomi/ui/model/types";
import Label from "sap/m/Label";
import { keyValueBox, nativePropsBox } from "unomi/ui/control/builders";
import { loadProps } from "unomi/ui/control/brm/conditionEditor";

interface FullProfile { itemId: string; properties?: Record<string, unknown>; }
interface Alias { itemId: string; }

/**
 * @namespace unomi.ui.controller
 */
export default class ProfileDetail extends BaseController {

	private profileId = "";

	public onInit(): void {
		this.getView()?.setModel(new JSONModel({
			profileId: "", segments: [] as Metadata[], sessions: [] as Session[],
			events: [] as UnomiEvent[], aliases: [] as Alias[], anonBrowsing: false, busy: false
		}), "detail");
		this.getView()?.setModel(new JSONModel({}), "profile");
		this.getRouter().getRoute("profileDetail")?.attachPatternMatched(this.onShow, this);
	}

	private onShow(event: Event): void {
		if (!this.requireAuth()) {
			return;
		}
		this.profileId = decodeURIComponent(event.getParameter("arguments" as never)["profileId"] as string);
		void this.load();
	}

	private async load(): Promise<void> {
		const model = this.getView()?.getModel("detail") as JSONModel;
		model.setData({ profileId: this.profileId, segments: [], sessions: [], events: [], aliases: [], anonBrowsing: false, busy: true });
		const enc = encodeURIComponent(this.profileId);
		try {
			const [profile, segments, sessions, aliases, anon] = await Promise.all([
				UnomiClient.getJson<FullProfile>(`/profiles/${enc}`),
				UnomiClient.getJson<Metadata[]>(`/profiles/${enc}/segments`),
				UnomiClient.getJson<PartialList<Session>>(`/profiles/${enc}/sessions?size=50`),
				UnomiClient.getJson<PartialList<Alias>>(`/profiles/${enc}/aliases`),
				UnomiClient.getJson<boolean>(`/privacy/profiles/${enc}/anonymousBrowsing`)
			]);
			(this.getView()?.getModel("profile") as JSONModel).setData(profile);
			this.renderProps();
			model.setProperty("/segments", segments);
			model.setProperty("/sessions", sessions.list);
			model.setProperty("/aliases", aliases.list);
			model.setProperty("/anonBrowsing", anon);
		} catch (e) {
			MessageToast.show(`Load failed: ${(e as Error).message}`);
		} finally {
			model.setProperty("/busy", false);
		}
	}

	private async renderProps(): Promise<void> {
		const host = this.byId("propsHost") as VBox;
		host.destroyItems();
		const data = (this.getView()?.getModel("profile") as JSONModel).getData() as FullProfile;
		const props = (data.properties ??= {}) as Record<string, any>;
		const native = (await loadProps()).profile;
		host.addItem(nativePropsBox(props, native));
		host.addItem(new Label({ text: "Otras propiedades", design: "Bold" }).addStyleClass("sapUiSmallMarginTop"));
		host.addItem(keyValueBox(props, () => void this.renderProps(), new Set(native.map((p) => p.id))));
	}

	public async onSave(): Promise<void> {
		const profile = (this.getView()?.getModel("profile") as JSONModel).getData() as object;
		try {
			await UnomiClient.postJson("/profiles", profile);
			MessageToast.show("Saved");
		} catch (e) {
			MessageToast.show(`Save failed: ${(e as Error).message}`);
		}
	}

	public async onAddAlias(): Promise<void> {
		const input = this.byId("aliasInput") as Input;
		const alias = input.getValue().trim();
		if (!alias) {
			return;
		}
		try {
			await UnomiClient.postJson(`/profiles/${encodeURIComponent(this.profileId)}/aliases/${encodeURIComponent(alias)}`, {});
			input.setValue("");
			await this.loadAliases();
		} catch (e) {
			MessageToast.show(`Add alias failed: ${(e as Error).message}`);
		}
	}

	public async onRemoveAlias(event: Event): Promise<void> {
		const item = event.getParameter("listItem" as never) as ListItemBase;
		const alias = item.getBindingContext("detail")?.getObject() as Alias;
		try {
			await UnomiClient.del(`/profiles/${encodeURIComponent(this.profileId)}/aliases/${encodeURIComponent(alias.itemId)}`);
			await this.loadAliases();
		} catch (e) {
			MessageToast.show(`Remove alias failed: ${(e as Error).message}`);
		}
	}

	private async loadAliases(): Promise<void> {
		const aliases = await UnomiClient.getJson<PartialList<Alias>>(`/profiles/${encodeURIComponent(this.profileId)}/aliases`);
		(this.getView()?.getModel("detail") as JSONModel).setProperty("/aliases", aliases.list);
	}

	public async onSessionPress(event: Event): Promise<void> {
		const item = event.getParameter("listItem" as never) as ListItemBase;
		const session = item.getBindingContext("detail")?.getObject() as Session;
		try {
			const events = await UnomiClient.getJson<PartialList<UnomiEvent>>(
				`/profiles/sessions/${encodeURIComponent(session.itemId)}/events?size=50`
			);
			(this.getView()?.getModel("detail") as JSONModel).setProperty("/events", events.list);
		} catch (e) {
			MessageToast.show(`Events failed: ${(e as Error).message}`);
		}
	}

	public async onAnonymize(): Promise<void> {
		try {
			await UnomiClient.postJson(`/privacy/profiles/${encodeURIComponent(this.profileId)}/anonymize?scope=systemscope`, {});
			MessageToast.show("Profile anonymized");
		} catch (e) {
			MessageToast.show(`Anonymize failed: ${(e as Error).message}`);
		}
	}

	public async onToggleAnonBrowsing(event: Event): Promise<void> {
		const on = event.getParameter("state" as never) as boolean;
		const enc = encodeURIComponent(this.profileId);
		try {
			if (on) {
				await UnomiClient.postJson(`/privacy/profiles/${enc}/anonymousBrowsing`, {});
			} else {
				await UnomiClient.del(`/privacy/profiles/${enc}/anonymousBrowsing`);
			}
			MessageToast.show("Anonymous browsing updated");
		} catch (e) {
			MessageToast.show(`Update failed: ${(e as Error).message}`);
			(this.getView()?.getModel("detail") as JSONModel).setProperty("/anonBrowsing", !on);
		}
	}

	public onDeleteData(): void {
		MessageBox.confirm("Delete all data for this profile? This cannot be undone.", {
			onClose: (action: string | null) => {
				if (action === MessageBox.Action.OK) {
					void this.doDeleteData();
				}
			}
		});
	}

	private async doDeleteData(): Promise<void> {
		try {
			await UnomiClient.del(`/privacy/profiles/${encodeURIComponent(this.profileId)}`);
			MessageToast.show("Profile data deleted");
			this.getRouter().navTo("profiles");
		} catch (e) {
			MessageToast.show(`Delete failed: ${(e as Error).message}`);
		}
	}

	public onNavBack(): void {
		this.getRouter().navTo("profiles");
	}
}
