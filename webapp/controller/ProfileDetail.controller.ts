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
import Control from "sap/ui/core/Control";
import { keyValueBox, nativePropsBox } from "unomi/ui/control/builders";
import { loadProps } from "unomi/ui/control/brm/conditionEditor";

interface FullProfile { itemId: string; properties?: Record<string, unknown>; consents?: Record<string, Consent>; }
interface Alias { itemId: string; }
// Unomi Consent (docs/openapi.json #/components/schemas/Consent). Lives on the
// profile under `consents` (map keyed by typeIdentifier); persisted via POST /profiles.
interface Consent { typeIdentifier: string; scope: string; status: string; statusDate: string; revokeDate: string | null; }

/**
 * @namespace unomi.ui.controller
 */
export default class ProfileDetail extends BaseController {

	private profileId = "";

	public onInit(): void {
		this.getView()?.setModel(new JSONModel({
			profileId: "", segments: [] as Metadata[], sessions: [] as Session[],
			events: [] as UnomiEvent[], aliases: [] as Alias[], consents: [] as (Consent & { key: string })[],
			anonBrowsing: false, busy: false
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
		model.setData({ profileId: this.profileId, segments: [], sessions: [], events: [], aliases: [], consents: [], anonBrowsing: false, busy: true });
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
			this.projectConsents();
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

	// Consents are a map on the profile; project it to an array for the table.
	// The map stays the source of truth — every edit mutates it and re-projects.
	// ponytail: POST /profiles MERGES consents (verified live) — you can add/update
	// but not hard-delete a consent, so the UI only grants/denies/revokes. Revoking
	// is the domain-correct "remove" anyway (GDPR keeps the record).
	private profileConsents(): Record<string, Consent> {
		const profile = (this.getView()?.getModel("profile") as JSONModel).getData() as FullProfile;
		return (profile.consents ??= {});
	}

	private projectConsents(): void {
		const map = this.profileConsents();
		const rows = Object.keys(map).map((key) => ({ key, ...map[key] }));
		(this.getView()?.getModel("detail") as JSONModel).setProperty("/consents", rows);
	}

	public onConsentStatusChange(event: Event): void {
		const row = (event.getSource() as Control).getBindingContext("detail")?.getObject() as { key: string; status: string };
		const c = this.profileConsents()[row.key];
		if (!c) {
			return;
		}
		c.status = row.status; // two-way binding already wrote the new value into the row
		c.statusDate = new Date().toISOString();
		c.revokeDate = row.status === "REVOKED" ? new Date().toISOString() : null;
		this.projectConsents();
	}

	public onAddConsent(): void {
		const typeInput = this.byId("consentType") as Input;
		const scopeInput = this.byId("consentScope") as Input;
		const type = typeInput.getValue().trim();
		if (!type) {
			return;
		}
		this.profileConsents()[type] = {
			typeIdentifier: type, scope: scopeInput.getValue().trim() || "systemscope",
			status: "GRANTED", statusDate: new Date().toISOString(), revokeDate: null
		};
		typeInput.setValue("");
		scopeInput.setValue("");
		this.projectConsents();
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
