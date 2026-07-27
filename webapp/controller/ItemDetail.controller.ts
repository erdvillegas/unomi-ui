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
import { loadDefs, conditionPanel, actionsList, elementPanel, emptyCondition, Defs, Node } from "unomi/ui/control/builders";

const meta = { id: "", name: "", scope: "systemscope", enabled: true };
const RES: Record<string, { path: string; list: string; stats: boolean; template: object }> = {
	segmentDetail: { path: "/segments", list: "segments", stats: false, template: { metadata: meta, condition: emptyCondition() } },
	ruleDetail: { path: "/rules", list: "rules", stats: true, template: { metadata: meta, condition: emptyCondition(), actions: [] } },
	scoringDetail: { path: "/scoring", list: "scoring", stats: false, template: { metadata: meta, elements: [] } },
	goalDetail: { path: "/goals", list: "goals", stats: false, template: { metadata: meta } },
	campaignDetail: { path: "/campaigns", list: "campaigns", stats: false, template: { metadata: meta } }
};

// Nested typed fields per resource, edited inline on the shared form model.
type Section = { prop: string; kind: "condition" | "actions" | "elements"; label: string };
const NESTED: Record<string, Section[]> = {
	segments: [{ prop: "condition", kind: "condition", label: "Condition" }],
	rules: [{ prop: "condition", kind: "condition", label: "Condition" }, { prop: "actions", kind: "actions", label: "Actions" }],
	scoring: [{ prop: "elements", kind: "elements", label: "Elements" }],
	goals: [{ prop: "startEvent", kind: "condition", label: "Start event" }, { prop: "targetEvent", kind: "condition", label: "Target event" }],
	campaigns: [{ prop: "entryCondition", kind: "condition", label: "Entry condition" }]
};

/**
 * @namespace unomi.ui.controller
 */
export default class ItemDetail extends BaseController {

	private cfg = RES.segmentDetail;
	private itemId = "";
	private defs: Defs = { cond: {}, condTypes: [], action: {}, actionTypes: [] };

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
			const m = (item as { metadata?: { name?: string } }).metadata;
			detail.setProperty("/name", m?.name || this.itemId);
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
				panel.addContent(conditionPanel(data[sec.prop] as Node, this.defs, refresh));
			} else if (sec.kind === "actions") {
				const arr = (data[sec.prop] ??= []) as Node[];
				actionsList(arr, this.defs, refresh).forEach((c) => panel.addContent(c));
			} else {
				const arr = (data[sec.prop] ??= []) as Array<{ condition?: Node; value?: number }>;
				arr.forEach((el, i) => panel.addContent(elementPanel(el, this.defs, refresh, () => { arr.splice(i, 1); refresh(); })));
				panel.addContent(new Button({ text: "+ element", icon: "sap-icon://add", press: () => { arr.push({ condition: emptyCondition(), value: 0 }); refresh(); } }));
			}
			host.addItem(panel);
		}
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
			MessageToast.show("JSON applied");
		} catch (e) {
			MessageToast.show(`Invalid JSON: ${(e as Error).message}`);
		}
	}

	public async onSave(): Promise<void> {
		const item = (this.getView()?.getModel("form") as JSONModel).getData() as object;
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
