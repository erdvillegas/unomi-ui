import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import Event from "sap/ui/base/Event";
import Input from "sap/m/Input";
import Select from "sap/m/Select";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import { PartialList } from "unomi/ui/service/UnomiClient";
import * as Catalog from "unomi/ui/service/Catalog";
import { Opt } from "unomi/ui/service/Catalog";

// Data-protection hub: cross-profile consent audit, scopes, and the right-to-be-
// forgotten / per-profile privacy controls. Everything here is backed by real /cxs
// endpoints — Unomi has no global anonymization-policy config, so "policies" is the
// per-profile privacy surface (anonymousBrowsing + eventFilters), not a global screen.

interface Consent { typeIdentifier: string; scope: string; status: string; statusDate?: string; revokeDate?: string | null; }
interface AProfile { itemId: string; consents?: Record<string, Consent>; }
interface ConsentRow extends Consent { profileId: string; state: string; }

const STATE: Record<string, string> = { GRANTED: "Success", DENIED: "Error", REVOKED: "Warning" };
const AUDIT_PAGE = 50;
// ponytail: aggregate consents client-side by paging /profiles/search. Fine at admin
// scale (hundreds); cap the sweep so a huge tenant can't runaway-load. Move to a
// server-side aggregation if profile counts ever reach five digits.
const AUDIT_MAX_PAGES = 20;

/**
 * @namespace unomi.ui.controller
 */
export default class DataProtection extends BaseController {

	private rows: ConsentRow[] = []; // full audit, unfiltered (source for the table projection)

	public onInit(): void {
		this.getView()?.setModel(new JSONModel({
			consents: [] as ConsentRow[], scopes: [] as Opt[], scopeCounts: [] as { scope: string; count: number }[],
			counts: { total: 0, granted: 0, denied: 0, revoked: 0, profiles: 0 },
			fStatus: "", fScope: "",
			profileId: "", anonScope: "systemscope", propName: "",
			privacy: { loaded: false, anonBrowsing: false, filters: [] as object[] },
			busy: false
		}), "dp");
		this.getRouter().getRoute("dataProtection")?.attachPatternMatched(this.onShow, this);
	}

	private onShow(): void {
		if (!this.requireAuth()) {
			return;
		}
		void this.loadAudit();
	}

	private model(): JSONModel {
		return this.getView()?.getModel("dp") as JSONModel;
	}

	// ---- Consent audit (cross-profile) ---------------------------------------
	private async loadAudit(): Promise<void> {
		const m = this.model();
		m.setProperty("/busy", true);
		try {
			const scopes = await Catalog.get("scopes");
			m.setProperty("/scopes", scopes);
			const rows: ConsentRow[] = [];
			const profilesWithConsent = new Set<string>();
			let offset = 0, total = Infinity, page = 0;
			while (offset < total && page < AUDIT_MAX_PAGES) {
				const res = await UnomiClient.queryList<AProfile>("/profiles/search",
					{ offset, limit: AUDIT_PAGE, condition: { type: "matchAllCondition", parameterValues: {} } });
				total = res.totalSize;
				for (const p of res.list) {
					const cs = p.consents || {};
					for (const key of Object.keys(cs)) {
						const c = cs[key];
						rows.push({ profileId: p.itemId, typeIdentifier: c.typeIdentifier || key, scope: c.scope,
							status: c.status, state: STATE[c.status] || "None", statusDate: c.statusDate, revokeDate: c.revokeDate });
						profilesWithConsent.add(p.itemId);
					}
				}
				offset += res.list.length;
				page += 1;
				if (res.list.length === 0) {
					break;
				}
			}
			this.rows = rows;
			m.setProperty("/counts", {
				total: rows.length, profiles: profilesWithConsent.size,
				granted: rows.filter((r) => r.status === "GRANTED").length,
				denied: rows.filter((r) => r.status === "DENIED").length,
				revoked: rows.filter((r) => r.status === "REVOKED").length
			});
			m.setProperty("/scopeCounts", this.scopeCounts(rows));
			this.applyFilter();
		} catch (e) {
			MessageToast.show(`Audit failed: ${(e as Error).message}`);
		} finally {
			m.setProperty("/busy", false);
		}
	}

	private scopeCounts(rows: ConsentRow[]): { scope: string; count: number }[] {
		const by: Record<string, number> = {};
		rows.forEach((r) => (by[r.scope || "(sin ámbito)"] = (by[r.scope || "(sin ámbito)"] || 0) + 1));
		return Object.keys(by).sort().map((scope) => ({ scope, count: by[scope] }));
	}

	private applyFilter(): void {
		const m = this.model();
		const st = m.getProperty("/fStatus") as string;
		const sc = m.getProperty("/fScope") as string;
		m.setProperty("/consents", this.rows.filter((r) => (!st || r.status === st) && (!sc || r.scope === sc)));
	}

	public onFilterChange(): void {
		this.applyFilter();
	}

	public onRefreshAudit(): void {
		void this.loadAudit();
	}

	// ---- Right to be forgotten -----------------------------------------------
	private forgetTarget(): string {
		return ((this.model().getProperty("/profileId") as string) || "").trim();
	}

	public async onAnonymize(): Promise<void> {
		const id = this.forgetTarget();
		if (!id) {
			MessageToast.show("Indica el ID de perfil");
			return;
		}
		const scope = (this.model().getProperty("/anonScope") as string) || "systemscope";
		try {
			await UnomiClient.postJson(`/privacy/profiles/${encodeURIComponent(id)}/anonymize?scope=${encodeURIComponent(scope)}`, {});
			MessageToast.show(`Perfil ${id} anonimizado`);
		} catch (e) {
			MessageToast.show(`Anonymize failed: ${(e as Error).message}`);
		}
	}

	public onDeleteData(): void {
		const id = this.forgetTarget();
		if (!id) {
			MessageToast.show("Indica el ID de perfil");
			return;
		}
		MessageBox.warning(`¿Borrar todos los datos del perfil "${id}"? Esta acción no se puede deshacer.`, {
			actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
			emphasizedAction: MessageBox.Action.CANCEL,
			onClose: (a: string | null) => { if (a === MessageBox.Action.DELETE) { void this.doDeleteData(id); } }
		});
	}

	private async doDeleteData(id: string): Promise<void> {
		try {
			await UnomiClient.del(`/privacy/profiles/${encodeURIComponent(id)}`);
			MessageToast.show(`Datos del perfil ${id} borrados`);
		} catch (e) {
			MessageToast.show(`Delete failed: ${(e as Error).message}`);
		}
	}

	public async onDeleteProperty(): Promise<void> {
		const id = this.forgetTarget();
		const prop = ((this.model().getProperty("/propName") as string) || "").trim();
		if (!id || !prop) {
			MessageToast.show("Indica ID de perfil y propiedad");
			return;
		}
		try {
			await UnomiClient.del(`/privacy/profiles/${encodeURIComponent(id)}/properties/${encodeURIComponent(prop)}`);
			MessageToast.show(`Propiedad ${prop} eliminada`);
			this.model().setProperty("/propName", "");
		} catch (e) {
			MessageToast.show(`Delete property failed: ${(e as Error).message}`);
		}
	}

	// ---- Per-profile privacy "policies" (anonymousBrowsing + eventFilters) ----
	public async onLoadPrivacy(): Promise<void> {
		const id = this.forgetTarget();
		if (!id) {
			MessageToast.show("Indica el ID de perfil");
			return;
		}
		const enc = encodeURIComponent(id);
		try {
			const [anon, filters] = await Promise.all([
				UnomiClient.getJson<boolean>(`/privacy/profiles/${enc}/anonymousBrowsing`),
				UnomiClient.getJson<PartialList<object> | object[]>(`/privacy/profiles/${enc}/eventFilters`)
			]);
			const list = Array.isArray(filters) ? filters : (filters?.list ?? []);
			this.model().setProperty("/privacy", { loaded: true, anonBrowsing: !!anon, filters: list });
		} catch (e) {
			MessageToast.show(`Privacy load failed: ${(e as Error).message}`);
		}
	}

	public async onToggleAnonBrowsing(event: Event): Promise<void> {
		const on = event.getParameter("state" as never) as boolean;
		const id = this.forgetTarget();
		const enc = encodeURIComponent(id);
		try {
			if (on) {
				await UnomiClient.postJson(`/privacy/profiles/${enc}/anonymousBrowsing`, {});
			} else {
				await UnomiClient.del(`/privacy/profiles/${enc}/anonymousBrowsing`);
			}
			MessageToast.show("Navegación anónima actualizada");
		} catch (e) {
			MessageToast.show(`Update failed: ${(e as Error).message}`);
			this.model().setProperty("/privacy/anonBrowsing", !on);
		}
	}
}
