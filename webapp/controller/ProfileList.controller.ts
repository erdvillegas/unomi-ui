import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import Event from "sap/ui/base/Event";
import ListItemBase from "sap/m/ListItemBase";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import { Profile } from "unomi/ui/model/types";

const PAGE = 25;

/**
 * @namespace unomi.ui.controller
 */
export default class ProfileList extends BaseController {

	private offset = 0;
	private searchText = "";

	public onInit(): void {
		this.getView()?.setModel(new JSONModel({
			profiles: [] as Profile[],
			total: 0,
			busy: false,
			canLoadMore: false
		}), "list");
		this.getRouter().getRoute("profiles")?.attachPatternMatched(this.onShow, this);
	}

	private onShow(): void {
		if (!this.requireAuth()) {
			return;
		}
		void this.load(true);
	}

	public onSearch(event: Event): void {
		this.searchText = (event.getParameter("query" as never) as string) || "";
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
			const query = {
				text: this.searchText || null,
				offset: this.offset,
				limit: PAGE,
				// matchAllCondition = Unomi's "return everything"; text filters on top.
				// NB: runtime field is `type`, not the spec's `conditionTypeId`.
				condition: { type: "matchAllCondition", parameterValues: {} }
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
