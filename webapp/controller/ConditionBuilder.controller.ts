import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import Event from "sap/ui/base/Event";
import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import Panel from "sap/m/Panel";
import Toolbar from "sap/m/Toolbar";
import ToolbarSpacer from "sap/m/ToolbarSpacer";
import Select from "sap/m/Select";
import Item from "sap/ui/core/Item";
import Input from "sap/m/Input";
import CheckBox from "sap/m/CheckBox";
import Label from "sap/m/Label";
import Button from "sap/m/Button";
import * as UnomiClient from "unomi/ui/service/UnomiClient";

// Unomi's standard comparison operators (no live endpoint exposes them — 500).
// ponytail: hardcoded; refresh from Unomi source if new operators appear.
const OPERATORS = ["equals", "notEquals", "greaterThan", "greaterThanOrEqualTo", "lessThan",
	"lessThanOrEqualTo", "between", "exists", "missing", "contains", "startsWith", "endsWith",
	"matchesRegex", "in", "notIn", "all", "hasSomeOf", "hasNoneOf", "isDay", "isNotDay"];

interface Param { id: string; type: string; multivalued: boolean; }
interface Cond { type: string; parameterValues: Record<string, any>; }

/**
 * @namespace unomi.ui.controller
 */
export default class ConditionBuilder extends BaseController {

	private defs: Record<string, Param[]> = {};
	private typeIds: string[] = [];
	private res = "";           // "segments" | "rules"
	private itemId = "";
	private item: { condition?: Cond } = {};
	private condition: Cond = { type: "matchAllCondition", parameterValues: {} };

	public onInit(): void {
		this.getView()?.setModel(new JSONModel({ name: "", busy: false }), "cb");
		this.getRouter().getRoute("conditionEditor")?.attachPatternMatched(this.onShow, this);
	}

	private async onShow(event: Event): Promise<void> {
		if (!this.requireAuth()) {
			return;
		}
		const args = event.getParameter("arguments" as never) as Record<string, string>;
		this.res = args.res;
		this.itemId = decodeURIComponent(args.itemId);
		const model = this.getView()?.getModel("cb") as JSONModel;
		model.setData({ name: this.itemId, busy: true });
		try {
			if (Object.keys(this.defs).length === 0) {
				const list = await UnomiClient.getJson<Array<{ id: string; parameters: Param[] }>>("/definitions/conditions");
				list.forEach((c) => (this.defs[c.id] = c.parameters || []));
				this.typeIds = Object.keys(this.defs).sort();
			}
			this.item = await UnomiClient.getJson<{ condition?: Cond }>(`/${this.res}/${encodeURIComponent(this.itemId)}`);
			this.condition = this.item.condition ?? { type: "matchAllCondition", parameterValues: {} };
			this.refresh();
		} catch (e) {
			MessageToast.show(`Load failed: ${(e as Error).message}`);
		} finally {
			model.setProperty("/busy", false);
		}
	}

	/** Full re-render from the condition tree — simple and correct for structural edits. */
	private refresh(): void {
		const root = this.byId("tree") as VBox;
		root.destroyItems();
		root.addItem(this.renderNode(this.condition));
	}

	private renderNode(node: Cond, onRemove?: () => void): Panel {
		const typeSelect = new Select({ selectedKey: node.type });
		this.typeIds.forEach((t) => typeSelect.addItem(new Item({ key: t, text: t })));
		typeSelect.attachChange(() => {
			node.type = typeSelect.getSelectedKey();
			node.parameterValues = {};
			this.refresh();
		});
		const header = new Toolbar({ content: [new Label({ text: "type" }), typeSelect, new ToolbarSpacer()] });
		if (onRemove) {
			header.addContent(new Button({ icon: "sap-icon://decline", tooltip: "Remove", press: onRemove }));
		}
		const body = new VBox().addStyleClass("sapUiSmallMarginBegin");
		this.renderParams(node, body);
		return new Panel({ headerToolbar: header, content: [body] }).addStyleClass("sapUiSmallMarginTop");
	}

	private renderParams(node: Cond, body: VBox): void {
		(this.defs[node.type] || []).forEach((p) => {
			if (p.type === "Condition" && p.multivalued) {
				const arr = (node.parameterValues[p.id] ??= []) as Cond[];
				body.addItem(new Label({ text: p.id, design: "Bold" }));
				const box = new VBox().addStyleClass("sapUiSmallMarginBegin");
				arr.forEach((child, i) => box.addItem(this.renderNode(child, () => { arr.splice(i, 1); this.refresh(); })));
				body.addItem(box);
				body.addItem(new Button({ text: `+ ${p.id}`, icon: "sap-icon://add", press: () => { arr.push({ type: "matchAllCondition", parameterValues: {} }); this.refresh(); } }));
			} else if (p.type === "Condition") {
				const child = (node.parameterValues[p.id] ??= { type: "matchAllCondition", parameterValues: {} }) as Cond;
				body.addItem(new Label({ text: p.id, design: "Bold" }));
				body.addItem(this.renderNode(child));
			} else if (p.type === "comparisonOperator") {
				const sel = new Select({ selectedKey: (node.parameterValues[p.id] as string) || "" });
				OPERATORS.forEach((o) => sel.addItem(new Item({ key: o, text: o })));
				sel.attachChange(() => (node.parameterValues[p.id] = sel.getSelectedKey()));
				body.addItem(new Label({ text: p.id }));
				body.addItem(sel);
			} else if (p.type === "boolean") {
				const cb = new CheckBox({ text: p.id, selected: !!node.parameterValues[p.id] });
				cb.attachSelect(() => (node.parameterValues[p.id] = cb.getSelected()));
				body.addItem(cb);
			} else {
				const v = node.parameterValues[p.id];
				const shown = p.multivalued ? (Array.isArray(v) ? v.join(", ") : "") : (v == null ? "" : String(v));
				const input = new Input({ value: shown, type: p.type === "integer" ? "Number" : "Text" });
				input.attachChange(() => (node.parameterValues[p.id] = this.coerce(input.getValue(), p)));
				body.addItem(new Label({ text: p.multivalued ? `${p.id} (coma)` : p.id }));
				body.addItem(input);
			}
		});
	}

	private coerce(v: string, p: Param): unknown {
		if (p.multivalued) {
			const parts = v.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
			return p.type === "integer" ? parts.map(Number) : parts;
		}
		if (v === "") {
			return undefined;
		}
		return p.type === "integer" ? Number(v) : v;
	}

	public async onSave(): Promise<void> {
		this.item.condition = this.condition;
		try {
			await UnomiClient.postJson(`/${this.res}`, this.item);
			MessageToast.show("Saved");
			this.getRouter().navTo(this.res);
		} catch (e) {
			MessageToast.show(`Save failed: ${(e as Error).message}`);
		}
	}

	public onNavBack(): void {
		this.getRouter().navTo(this.res);
	}
}
