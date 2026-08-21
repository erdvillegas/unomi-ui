import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import VBox from "sap/m/VBox";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import { loadDefs, emptyDefs, Defs, Node } from "unomi/ui/control/builders";
import { conditionEditor, loadProps, loadCatalogs, emptyCat, PropDef, emptyCondition } from "unomi/ui/control/brm/conditionEditor";
import { aggregateBox, emptyAggregate, Aggregate } from "unomi/ui/control/brm/aggregateBuilder";
import { propSelect, PropTarget } from "unomi/ui/control/refSelect";

// Metric key -> whether it's selected by default. Joined with "/" into the metrics path.
const METRICS = ["sum", "avg", "min", "max", "card"] as const;

/**
 * @namespace unomi.ui.controller
 */
export default class Queries extends BaseController {

	private defs: Defs = emptyDefs();
	private props: { profile: PropDef[]; session: PropDef[]; event: PropDef[] } = { profile: [], session: [], event: [] };
	private cat = emptyCat();
	private condition: Node = emptyCondition();
	private agg: Aggregate = emptyAggregate();

	public onInit(): void {
		this.getView()?.setModel(new JSONModel({
			type: "profile",
			operation: "count",
			property: "",
			metrics: { sum: true, avg: true, min: true, max: true, card: false },
			busy: false,
			showResult: false,
			isCount: false,
			count: 0,
			rows: [] as { key: string; value: number }[]
		}), "q");
		this.getRouter().getRoute("queries")?.attachPatternMatched(this.onShow, this);
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
		this.renderCondition();
		this.renderAggregate();
		this.renderProperty();
	}

	// Property picker fed from the catalog for the selected item type (profile/session/event).
	private renderProperty(): void {
		const host = this.byId("propertyHost") as VBox;
		host.destroyItems();
		const m = this.getView()?.getModel("q") as JSONModel;
		const target = m.getProperty("/type") as PropTarget;
		host.addItem(propSelect(target, m.getProperty("/property"), (v) => m.setProperty("/property", v)));
	}

	// Item type drives which catalog of properties applies, so reload the picker.
	public onTypeChange(): void {
		this.renderProperty();
	}

	private renderCondition(): void {
		const host = this.byId("conditionHost") as VBox;
		host.destroyItems();
		host.addItem(conditionEditor(this.condition, { defs: this.defs, props: this.props, cat: this.cat }, () => this.renderCondition()));
	}

	private renderAggregate(): void {
		const host = this.byId("aggHost") as VBox;
		host.destroyItems();
		host.addItem(aggregateBox(this.agg, () => this.renderAggregate()));
	}

	public async onRun(): Promise<void> {
		const m = this.getView()?.getModel("q") as JSONModel;
		const type = m.getProperty("/type") as string;
		const op = m.getProperty("/operation") as string;
		const property = (m.getProperty("/property") as string).trim();
		if (op !== "count" && !property) {
			MessageToast.show("Indica la propiedad a agregar");
			return;
		}
		m.setProperty("/busy", true);
		try {
			if (op === "count") {
				const n = await UnomiClient.post<number>(`/query/${type}/count`, this.condition);
				m.setProperty("/count", n);
				m.setProperty("/isCount", true);
				m.setProperty("/rows", []);
			} else if (op === "aggregation") {
				this.agg.property = property;
				const map = await UnomiClient.post<Record<string, number>>(
					`/query/${type}/${encodeURIComponent(property)}`,
					{ aggregate: this.agg, condition: this.condition }
				);
				m.setProperty("/rows", this.toRows(map));
				m.setProperty("/isCount", false);
			} else {
				const metrics = METRICS.filter((k) => (m.getProperty("/metrics") as Record<string, boolean>)[k]);
				if (!metrics.length) {
					MessageToast.show("Selecciona al menos una métrica");
					m.setProperty("/busy", false);
					return;
				}
				const map = await UnomiClient.post<Record<string, number>>(
					`/query/${type}/${encodeURIComponent(property)}/${metrics.join("/")}`,
					this.condition
				);
				m.setProperty("/rows", this.toRows(map));
				m.setProperty("/isCount", false);
			}
			m.setProperty("/showResult", true);
		} catch (e) {
			MessageToast.show(`Consulta fallida: ${(e as Error).message}`);
		} finally {
			m.setProperty("/busy", false);
		}
	}

	private toRows(map: Record<string, number>): { key: string; value: number }[] {
		return Object.keys(map).map((k) => ({ key: k, value: map[k] }));
	}
}
