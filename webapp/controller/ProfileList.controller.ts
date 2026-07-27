import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import Event from "sap/ui/base/Event";
import ListItemBase from "sap/m/ListItemBase";
import VBox from "sap/m/VBox";
import Input from "sap/m/Input";
import Select from "sap/m/Select";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import { Profile } from "unomi/ui/model/types";
import { loadDefs, emptyDefs, Defs, Node } from "unomi/ui/control/builders";
import { conditionEditor, loadProps, loadCatalogs, emptyCat, PropDef, emptyCondition } from "unomi/ui/control/brm/conditionEditor";

const PAGE = 25;
const LS_KEY = "unomi.ui.savedQueries";

const loadSaved = (): Record<string, Node> => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}") as Record<string, Node>; } catch { return {}; } };
const storeSaved = (m: Record<string, Node>): void => localStorage.setItem(LS_KEY, JSON.stringify(m));

/**
 * @namespace unomi.ui.controller
 */
export default class ProfileList extends BaseController {

	private offset = 0;
	private searchText = "";
	private defs: Defs = emptyDefs();
	private props: { profile: PropDef[]; session: PropDef[]; event: PropDef[] } = { profile: [], session: [], event: [] };
	private cat = emptyCat();

	public onInit(): void {
		this.getView()?.setModel(new JSONModel({ profiles: [] as Profile[], total: 0, busy: false, canLoadMore: false }), "list");
		this.getView()?.setModel(new JSONModel({ condition: emptyCondition(), saved: [] as string[] }), "query");
		this.getRouter().getRoute("profiles")?.attachPatternMatched(this.onShow, this);
	}

	private onShow(): void {
		if (!this.requireAuth()) {
			return;
		}
		void this.init();
	}

	private async init(): Promise<void> {
		try {
			this.defs = await loadDefs();
			this.props = await loadProps();
			this.cat = await loadCatalogs();
		} catch (e) {
			MessageToast.show(`Definitions failed: ${(e as Error).message}`);
		}
		this.renderQuery();
		this.refreshSaved();
		void this.load(true);
	}

	private renderQuery(): void {
		const host = this.byId("queryHost") as VBox;
		host.destroyItems();
		const cond = (this.getView()?.getModel("query") as JSONModel).getProperty("/condition") as Node;
		host.addItem(conditionEditor(cond, { defs: this.defs, props: this.props, cat: this.cat }, () => this.renderQuery()));
	}

	private refreshSaved(): void {
		(this.getView()?.getModel("query") as JSONModel).setProperty("/saved", Object.keys(loadSaved()));
	}

	public onSearch(event: Event): void {
		this.searchText = (event.getParameter("query" as never) as string) || "";
		void this.load(true);
	}

	public onRunQuery(): void {
		void this.load(true);
	}

	public onSaveQuery(): void {
		const name = (this.byId("queryName") as Input).getValue().trim();
		if (!name) {
			return;
		}
		const m = loadSaved();
		m[name] = (this.getView()?.getModel("query") as JSONModel).getProperty("/condition") as Node;
		storeSaved(m);
		this.refreshSaved();
		MessageToast.show("Query saved");
	}

	public onLoadQuery(): void {
		const name = (this.byId("savedQueries") as Select).getSelectedKey();
		const cond = loadSaved()[name];
		if (cond) {
			(this.getView()?.getModel("query") as JSONModel).setProperty("/condition", structuredClone(cond));
			this.renderQuery();
		}
	}

	public onDeleteQuery(): void {
		const name = (this.byId("savedQueries") as Select).getSelectedKey();
		const m = loadSaved();
		delete m[name];
		storeSaved(m);
		this.refreshSaved();
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
			const query = {
				text: this.searchText || null,
				offset: this.offset,
				limit: PAGE,
				// Condition comes from the visual query builder (matchAll = everything).
				condition: (this.getView()?.getModel("query") as JSONModel).getProperty("/condition") as Node
			};
			const res = await UnomiClient.queryList<Profile>("/profiles/search", query);
			const current = reset ? [] : (model.getProperty("/profiles") as Profile[]);
			model.setProperty("/profiles", current.concat(res.list));
			model.setProperty("/total", res.totalSize);
			this.offset += res.list.length;
			model.setProperty("/canLoadMore", this.offset < res.totalSize);
		} catch (e) {
			MessageToast.show(`Search failed: ${(e as Error).message}`);
		} finally {
			model.setProperty("/busy", false);
		}
	}

	public onProfilePress(event: Event): void {
		const item = event.getParameter("listItem" as never) as ListItemBase;
		const profile = item.getBindingContext("list")?.getObject() as Profile;
		this.getRouter().navTo("profileDetail", { profileId: encodeURIComponent(profile.itemId) });
	}
}
