import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import Event from "sap/ui/base/Event";
import Input from "sap/m/Input";
import Select from "sap/m/Select";
import Button from "sap/m/Button";
import IconTabBar from "sap/m/IconTabBar";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import { PartialList } from "unomi/ui/service/UnomiClient";
import * as Catalog from "unomi/ui/service/Catalog";
import { Opt } from "unomi/ui/service/Catalog";

// Data-protection hub: cross-profile consent audit, scopes, and the right-to-be-
// forgotten / per-profile privacy controls. Everything here is backed by real /cxs
// endpoints — Unomi has no global anonymization-policy config, so "policies" is the
// per-profile privacy surface (anonymousBrowsing + eventFilters), not a global screen.

interface Consent { typeIdentifier: string; scope: string; status: string; statusDate?: string; revokeDate?: string | null; }
interface AProfile { itemId: string; consents?: Record<string, Consent>; properties?: Record<string, unknown>; }
interface ConsentRow extends Consent { profileId: string; state: string; }
interface ForgetRow { itemId: string; email: string; name: string; selected: boolean; }

const FORGET_PAGE = 25;

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
			forgetProfiles: [] as ForgetRow[], forgetText: "", forgetTotal: 0, selectAllMatching: false,
			selectedCount: 0, selectedLabel: "", hasSelection: false, anonScope: "systemscope", propName: "",
			profileId: "", // single-target field kept for the Policies tab
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
		void this.loadForgetProfiles("");
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

	// ---- Right to be forgotten (bulk over a searchable profile list) ---------
	// Pick one or many targets from a list that shows who you're erasing, instead
	// of typing opaque ids blind into a destructive action.
	private toForgetRow(p: AProfile): ForgetRow {
		const pr = (p.properties || {}) as Record<string, unknown>;
		return { itemId: p.itemId, email: (pr.email as string) || "",
			name: [pr.firstName, pr.lastName].filter(Boolean).join(" "), selected: false };
	}

	private async loadForgetProfiles(text: string): Promise<void> {
		this.model().setProperty("/forgetText", text);
		this.model().setProperty("/selectAllMatching", false); // new search invalidates a select-all
		try {
			const res = await UnomiClient.queryList<AProfile>("/profiles/search",
				{ text: text || null, offset: 0, limit: FORGET_PAGE, condition: { type: "matchAllCondition", parameterValues: {} } });
			this.model().setProperty("/forgetProfiles", res.list.map((p) => this.toForgetRow(p)));
			this.model().setProperty("/forgetTotal", res.totalSize);
			this.recomputeSelection();
		} catch (e) {
			MessageToast.show(`Search failed: ${(e as Error).message}`);
		}
	}

	public onForgetSearch(event: Event): void {
		void this.loadForgetProfiles((event.getParameter("query" as never) as string) || "");
	}

	// The MultiSelect table two-way-binds each row's `selected`; a manual row toggle
	// cancels an active "select all matching".
	public onSelectionChange(): void {
		this.model().setProperty("/selectAllMatching", false);
		this.recomputeSelection();
	}

	public onToggleSelectAll(event: Event): void {
		this.model().setProperty("/selectAllMatching", (event.getParameter("selected" as never) as boolean));
		this.recomputeSelection();
	}

	private selectedRows(): ForgetRow[] {
		return (this.model().getProperty("/forgetProfiles") as ForgetRow[]).filter((r) => r.selected);
	}

	private recomputeSelection(): void {
		const m = this.model();
		const all = m.getProperty("/selectAllMatching") as boolean;
		const total = m.getProperty("/forgetTotal") as number;
		const rows = this.selectedRows();
		const count = all ? total : rows.length;
		m.setProperty("/selectedCount", count);
		m.setProperty("/hasSelection", count > 0);
		m.setProperty("/selectedLabel", all
			? `Todos los ${total} perfiles que cumplen la búsqueda`
			: rows.map((r) => r.email ? `${r.itemId} (${r.email})` : r.itemId).join(", "));
		m.setProperty("/profileId", all ? "" : (rows[0]?.itemId ?? "")); // feeds the Policies tab
	}

	// Resolve the actual target ids: the page selection, or — in select-all mode —
	// every profile matching the current search, paged from the server.
	private async resolveTargets(): Promise<string[]> {
		if (!(this.model().getProperty("/selectAllMatching") as boolean)) {
			return this.selectedRows().map((r) => r.itemId);
		}
		const text = (this.model().getProperty("/forgetText") as string) || "";
		const ids: string[] = [];
		let offset = 0, total = Infinity, page = 0;
		while (offset < total && page < AUDIT_MAX_PAGES) {
			const res = await UnomiClient.queryList<AProfile>("/profiles/search",
				{ text: text || null, offset, limit: AUDIT_PAGE, condition: { type: "matchAllCondition", parameterValues: {} } });
			total = res.totalSize;
			res.list.forEach((p) => ids.push(p.itemId));
			offset += res.list.length;
			page += 1;
			if (res.list.length === 0) {
				break;
			}
		}
		return ids;
	}

	// Jump here from an audit row: load that exact profile, preselect it, switch tab.
	public async onForgetFromAudit(event: Event): Promise<void> {
		const row = (event.getSource() as Button).getBindingContext("dp")?.getObject() as ConsentRow | undefined;
		if (!row) {
			return;
		}
		try {
			const p = await UnomiClient.getJson<AProfile>(`/profiles/${encodeURIComponent(row.profileId)}`);
			const fr = this.toForgetRow(p);
			fr.selected = true;
			this.model().setProperty("/forgetProfiles", [fr]);
			this.model().setProperty("/forgetText", row.profileId);
			this.recomputeSelection();
			(this.byId("dpTabs") as IconTabBar).setSelectedKey("forget");
		} catch (e) {
			MessageToast.show(`Load profile failed: ${(e as Error).message}`);
		}
	}

	// Run a privacy op over each target id, sequentially (avoid flooding the
	// container — that's what OOM'd it before), and report a summary.
	private async runOver(ids: string[], op: (id: string) => Promise<void>, okMsg: (n: number) => string): Promise<void> {
		if (ids.length === 0) {
			MessageToast.show("Selecciona al menos un perfil");
			return;
		}
		let ok = 0;
		const fails: string[] = [];
		for (const id of ids) {
			try {
				await op(id);
				ok += 1;
			} catch {
				fails.push(id);
			}
		}
		MessageToast.show(fails.length ? `${okMsg(ok)} · fallaron: ${fails.length}` : okMsg(ok));
	}

	public async onAnonymize(): Promise<void> {
		const scope = (this.model().getProperty("/anonScope") as string) || "systemscope";
		const ids = await this.resolveTargets();
		await this.runOver(ids,
			(id) => UnomiClient.postJson(`/privacy/profiles/${encodeURIComponent(id)}/anonymize?scope=${encodeURIComponent(scope)}`, {}),
			(n) => `${n} perfil(es) anonimizados`);
	}

	public async onDeleteProperty(): Promise<void> {
		const prop = ((this.model().getProperty("/propName") as string) || "").trim();
		if (!prop) {
			MessageToast.show("Indica la propiedad");
			return;
		}
		const ids = await this.resolveTargets();
		await this.runOver(ids,
			(id) => UnomiClient.del(`/privacy/profiles/${encodeURIComponent(id)}/properties/${encodeURIComponent(prop)}`),
			(n) => `Propiedad "${prop}" eliminada en ${n} perfil(es)`);
		this.model().setProperty("/propName", "");
	}

	public async onDeleteData(): Promise<void> {
		const ids = await this.resolveTargets();
		if (ids.length === 0) {
			MessageToast.show("Selecciona al menos un perfil");
			return;
		}
		// Show the full list when small, just the count when it's a bulk select-all.
		const detail = ids.length <= 10 ? `\n\n${ids.join(", ")}` : "";
		MessageBox.warning(`¿Borrar todos los datos de ${ids.length} perfil(es)?${detail}\n\nEsta acción no se puede deshacer.`, {
			actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
			emphasizedAction: MessageBox.Action.CANCEL,
			onClose: (a: string | null) => { if (a === MessageBox.Action.DELETE) { void this.doDeleteData(ids); } }
		});
	}

	private async doDeleteData(ids: string[]): Promise<void> {
		await this.runOver(ids,
			(id) => UnomiClient.del(`/privacy/profiles/${encodeURIComponent(id)}`),
			(n) => `${n} perfil(es) borrados`);
		await this.loadForgetProfiles((this.model().getProperty("/forgetText") as string) || "");
		void this.loadAudit(); // consents changed → refresh the audit
	}

	private forgetTarget(): string {
		return ((this.model().getProperty("/profileId") as string) || "").trim();
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
