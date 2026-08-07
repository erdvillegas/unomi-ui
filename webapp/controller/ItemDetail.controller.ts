import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import Event from "sap/ui/base/Event";
import VBox from "sap/m/VBox";
import Panel from "sap/m/Panel";
import Button from "sap/m/Button";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import { buildForm } from "unomi/ui/control/FormEngine";
import { formFields } from "unomi/ui/model/forms";
import { loadDefs, conditionPanel, actionsList, elementPanel, emptyCondition, emptyDefs, Defs, Node } from "unomi/ui/control/builders";
import { conditionEditor, loadProps, loadCatalogs, emptyCat, PropDef } from "unomi/ui/control/brm/conditionEditor";
import { sourceBuilder } from "unomi/ui/control/sourceBuilder";
import { exportPropsBuilder } from "unomi/ui/control/exportPropsBuilder";
import { Metadata } from "unomi/ui/model/types";

const meta = { id: "", name: "", scope: "systemscope", enabled: true };
const RES: Record<string, { path: string; list: string; stats: boolean; template: object }> = {
	segmentDetail: { path: "/segments", list: "segments", stats: false, template: { metadata: meta, condition: emptyCondition() } },
	ruleDetail: { path: "/rules", list: "rules", stats: true, template: { metadata: meta, condition: emptyCondition(), actions: [] } },
	scoringDetail: { path: "/scoring", list: "scoring", stats: false, template: { metadata: meta, elements: [] } },
	goalDetail: { path: "/goals", list: "goals", stats: false, template: { metadata: meta } },
	campaignDetail: { path: "/campaigns", list: "campaigns", stats: false, template: { metadata: meta } },
	scopeDetail: { path: "/scopes", list: "scopes", stats: false, template: { metadata: meta } },
	listDetail: { path: "/lists", list: "lists", stats: false, template: { metadata: meta } },
	propertyDetail: { path: "/profiles/properties", list: "properties", stats: false, template: { metadata: meta, target: "profiles", valueTypeId: "string", defaultValue: "", multivalued: false, rank: 0, dateRanges: [], numericRanges: [], ipRanges: [], childPropertyTypes: [] } },
	importConfigDetail: { path: "/importConfiguration", list: "importConfig", stats: false, template: { itemId: "", name: "", description: "", configType: "", columnSeparator: ",", lineSeparator: "\n", multiValueSeparator: ";", multiValueDelimiter: "[]", active: true, hasHeader: true, hasDeleteColumn: false, overwriteExistingProfiles: false, mergingProperty: "", propertiesToOverwrite: [], properties: {}, executions: [] } },
	exportConfigDetail: { path: "/exportConfiguration", list: "exportConfig", stats: false, template: { itemId: "", name: "", description: "", configType: "", columnSeparator: ",", lineSeparator: "\n", multiValueSeparator: ";", multiValueDelimiter: "[]", active: true, properties: {}, executions: [] } }
};

// Nested typed fields per resource, edited inline on the shared form model.
type Section = { prop: string; kind: "condition" | "actions" | "elements"; label: string; brm?: boolean };
const NESTED: Record<string, Section[]> = {
	segments: [{ prop: "condition", kind: "condition", label: "Condition", brm: true }],
	rules: [{ prop: "condition", kind: "condition", label: "Condition", brm: true }, { prop: "actions", kind: "actions", label: "Actions" }],
	scoring: [{ prop: "elements", kind: "elements", label: "Elements", brm: true }],
	goals: [{ prop: "startEvent", kind: "condition", label: "Start event", brm: true }, { prop: "targetEvent", kind: "condition", label: "Target event", brm: true }],
	campaigns: [{ prop: "entryCondition", kind: "condition", label: "Entry condition", brm: true }]
};

/**
 * @namespace unomi.ui.controller
 */
export default class ItemDetail extends BaseController {

	private cfg = RES.segmentDetail;
	private itemId = "";
	private defs: Defs = emptyDefs();
	private props: { profile: PropDef[]; session: PropDef[]; event: PropDef[] } = { profile: [], session: [], event: [] };
	private cat = emptyCat();

	public onInit(): void {
		this.getView()?.setModel(new JSONModel({ name: "", json: "", stats: "", hasStats: false, isNew: false, busy: false }), "detail");
		this.getView()?.setModel(new JSONModel({}), "form");
		const router = this.getRouter();
		Object.keys(RES).forEach((name) => router.getRoute(name)?.attachPatternMatched(this.onShow, this));
	}

	private onShow(event: Event): void {
		if (!this.requireAuth()) {
			return;
		}
		this.cfg = RES[event.getParameter("name" as never) as string];
		this.itemId = decodeURIComponent(event.getParameter("arguments" as never)["itemId"] as string);
		const isNew = this.itemId === "new";
		const detail = this.getView()?.getModel("detail") as JSONModel;
		detail.setData({ name: isNew ? "New" : this.itemId, json: "", stats: "", hasStats: this.cfg.stats && !isNew, isNew, busy: !isNew });
		// Build the scalar form synchronously (config known without data); values and
		// nested editors fill in once data + definitions arrive.
		(this.getView()?.getModel("form") as JSONModel).setData(isNew ? structuredClone(this.cfg.template) : {});
		this.renderForm(isNew);
		(this.byId("nestedHost") as VBox).destroyItems();
		this.refreshJson();
		if (isNew) {
			this.renderConfigExtras();
			void this.initNested();
		} else {
			void this.load();
		}
	}

	private async load(): Promise<void> {
		const detail = this.getView()?.getModel("detail") as JSONModel;
		try {
			const item = await UnomiClient.getJson<object>(`${this.cfg.path}/${encodeURIComponent(this.itemId)}`);
			(this.getView()?.getModel("form") as JSONModel).setData(item);
			this.renderForm(false);
			this.renderConfigExtras();
			const it = item as { metadata?: { name?: string }; name?: string };
			detail.setProperty("/name", it.metadata?.name ?? it.name ?? this.itemId);
			await this.initNested();
			if (this.cfg.stats) {
				const stats = await UnomiClient.getJson<object>(`${this.cfg.path}/${encodeURIComponent(this.itemId)}/statistics`);
				detail.setProperty("/stats", JSON.stringify(stats, null, 2));
			}
		} catch (e) {
			MessageToast.show(`Load failed: ${(e as Error).message}`);
		} finally {
			detail.setProperty("/busy", false);
		}
	}

	private renderForm(isNew: boolean): void {
		const host = this.byId("formHost") as VBox;
		host.destroyItems();
		host.addItem(buildForm(formFields(this.cfg.list, isNew), this.getView()?.getModel("form") as JSONModel));
	}

	private async initNested(): Promise<void> {
		if ((NESTED[this.cfg.list] || []).length === 0) {
			return;
		}
		try {
			this.defs = await loadDefs();
			if ((NESTED[this.cfg.list] || []).some((s) => s.brm)) {
				this.props = await loadProps();
				this.cat = await loadCatalogs();
			}
		} catch (e) {
			MessageToast.show(`Definitions failed: ${(e as Error).message}`);
			return;
		}
		this.renderNested();
	}

	private renderNested(): void {
		const host = this.byId("nestedHost") as VBox;
		host.destroyItems();
		const data = (this.getView()?.getModel("form") as JSONModel).getData() as Record<string, any>;
		const refresh = () => this.renderNested();
		for (const sec of NESTED[this.cfg.list] || []) {
			const panel = new Panel({ headerText: sec.label, expandable: true, expanded: true });
			if (sec.kind === "condition") {
				data[sec.prop] ??= emptyCondition();
				panel.addContent(sec.brm
					? conditionEditor(data[sec.prop] as Node, { defs: this.defs, props: this.props, cat: this.cat }, refresh)
					: conditionPanel(data[sec.prop] as Node, this.defs, refresh));
			} else if (sec.kind === "actions") {
				const arr = (data[sec.prop] ??= []) as Node[];
				actionsList(arr, this.defs, refresh).forEach((c) => panel.addContent(c));
			} else {
				const arr = (data[sec.prop] ??= []) as Array<{ condition?: Node; value?: number }>;
				const ctx = { defs: this.defs, props: this.props, cat: this.cat };
				const brm = (node: Node, r: () => void) => conditionEditor(node, ctx, r);
				arr.forEach((el, i) => panel.addContent(elementPanel(el, this.defs, refresh, () => { arr.splice(i, 1); refresh(); }, brm)));
				panel.addContent(new Button({ text: "+ element", icon: "sap-icon://add", press: () => { arr.push({ condition: emptyCondition(), value: 0 }); refresh(); } }));
			}
			host.addItem(panel);
		}
		this.refreshJson();
	}

	// Guided property editors for import/export configs, rendered into nestedHost.
	private renderConfigExtras(): void {
		if (this.cfg.list === "importConfig") { this.renderSource(); }
		else if (this.cfg.list === "exportConfig") { void this.renderExportProps(); }
	}

	private configProps(): Record<string, unknown> {
		const data = (this.getView()?.getModel("form") as JSONModel).getData() as Record<string, any>;
		return (data.properties ??= {}) as Record<string, unknown>;
	}

	// Guided `properties.source` editor for recurrent imports.
	private renderSource(): void {
		const host = this.byId("nestedHost") as VBox;
		host.destroyItems();
		host.addItem(sourceBuilder(this.configProps(), () => { this.renderSource(); this.refreshJson(); }));
		this.refreshJson();
	}

	// Guided segment/period editor for export configs (segments from the live catalog).
	private async renderExportProps(): Promise<void> {
		const host = this.byId("nestedHost") as VBox;
		host.destroyItems();
		let segments: { id: string; name: string }[] = [];
		try {
			segments = (await UnomiClient.getJson<Metadata[]>("/segments")).map((s) => ({ id: s.id, name: s.name || s.id }));
		} catch (e) {
			MessageToast.show(`Segments failed: ${(e as Error).message}`);
		}
		host.addItem(exportPropsBuilder(this.configProps(), segments));
		this.refreshJson();
	}

	/** Mirror the live form model into the Advanced-JSON textarea (source of truth = model). */
	public refreshJson(): void {
		const data = (this.getView()?.getModel("form") as JSONModel).getData() as object;
		(this.getView()?.getModel("detail") as JSONModel).setProperty("/json", JSON.stringify(data, null, 2));
	}

	public onApplyJson(): void {
		const detail = this.getView()?.getModel("detail") as JSONModel;
		try {
			const parsed = JSON.parse(detail.getProperty("/json") as string) as object;
			(this.getView()?.getModel("form") as JSONModel).setData(parsed);
			this.renderForm(detail.getProperty("/isNew") as boolean);
			this.renderNested();
			this.renderConfigExtras();
			MessageToast.show("JSON applied");
		} catch (e) {
			MessageToast.show(`Invalid JSON: ${(e as Error).message}`);
		}
	}

	public async onSave(): Promise<void> {
		const item = (this.getView()?.getModel("form") as JSONModel).getData() as { metadata?: { id?: string }; itemId?: string };
		// Guard: saving without an identity creates a blank, un-openable row (id "" → nothing to route to).
		const id = (item.metadata?.id ?? item.itemId ?? "").trim();
		if (!id) {
			MessageToast.show("ID is required");
			return;
		}
		try {
			await UnomiClient.postJson(this.cfg.path, item);
			MessageToast.show("Saved");
			this.getRouter().navTo(this.cfg.list);
		} catch (e) {
			MessageToast.show(`Save failed: ${(e as Error).message}`);
		}
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
