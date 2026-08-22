import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import Select from "sap/m/Select";
import Item from "sap/ui/core/Item";
import Input from "sap/m/Input";
import Label from "sap/m/Label";
import Button from "sap/m/Button";
import Control from "sap/ui/core/Control";

/**
 * Editor for a Unomi Aggregate object, part of the BRM control module (the same
 * place typed condition trees are edited). Feeds POST /cxs/query/{type}/{property}.
 * ponytail: raw expression Inputs (not DatePickers) — Unomi date ranges accept
 * relative expressions like "now-1M", which a date picker would block.
 */

export interface Range { key?: string; from?: unknown; to?: unknown; }
export interface Aggregate {
	type: string;
	property?: string;
	parameters?: Record<string, unknown>;
	dateRanges?: Range[];
	numericRanges?: Range[];
	ipRanges?: Range[];
}

// terms is the default bucketing (any non-matching type falls back to terms in Unomi).
export const AGG_TYPES = ["terms", "date", "dateRange", "numericRange", "ipRange"] as const;
export const emptyAggregate = (): Aggregate => ({ type: "terms" });

const RANGE_KEY: Record<string, keyof Aggregate> = {
	dateRange: "dateRanges", numericRange: "numericRanges", ipRange: "ipRanges"
};

function param(agg: Aggregate, key: string, placeholder: string): Input {
	const inp = new Input({ value: String(agg.parameters?.[key] ?? ""), placeholder, width: "12rem" });
	inp.attachChange(() => {
		agg.parameters ??= {};
		const v = inp.getValue();
		if (v === "") { delete agg.parameters[key]; } else { agg.parameters[key] = v; }
	});
	return inp;
}

function rangeList(arr: Range[], numeric: boolean, refresh: () => void): Control {
	const box = new VBox({ width: "100%" });
	arr.forEach((r, i) => {
		const key = new Input({ value: r.key ?? "", placeholder: "key", width: "10rem" });
		const from = new Input({ value: r.from == null ? "" : String(r.from), placeholder: "from", width: "12rem" });
		const to = new Input({ value: r.to == null ? "" : String(r.to), placeholder: "to", width: "12rem" });
		const cast = (v: string): unknown => (v === "" ? undefined : numeric ? Number(v) : v);
		key.attachChange(() => (r.key = key.getValue()));
		from.attachChange(() => (r.from = cast(from.getValue())));
		to.attachChange(() => (r.to = cast(to.getValue())));
		box.addItem(new HBox({ alignItems: "Center", items: [
			key.addStyleClass("sapUiTinyMarginEnd"), from.addStyleClass("sapUiTinyMarginEnd"), to,
			new Button({ icon: "sap-icon://decline", press: () => { arr.splice(i, 1); refresh(); } }).addStyleClass("sapUiTinyMarginBegin")
		] }).addStyleClass("sapUiTinyMarginBottom"));
	});
	box.addItem(new Button({ text: "+", icon: "sap-icon://add", press: () => { arr.push({}); refresh(); } }));
	return box;
}

export function aggregateBox(agg: Aggregate, refresh: () => void): Control {
	const box = new VBox({ width: "100%" });
	const sel = new Select({ selectedKey: agg.type, width: "12rem" });
	AGG_TYPES.forEach((t) => sel.addItem(new Item({ key: t, text: t })));
	sel.attachChange(() => {
		agg.type = sel.getSelectedKey();
		// Drop the parameters/ranges of the previous type so we never send a stale shape.
		delete agg.parameters; delete agg.dateRanges; delete agg.numericRanges; delete agg.ipRanges;
		refresh();
	});
	box.addItem(new HBox({ alignItems: "Center", items: [new Label({ text: "Tipo", width: "5rem" }), sel] }).addStyleClass("sapUiTinyMarginBottom"));

	if (agg.type === "date") {
		box.addItem(new HBox({ alignItems: "Center", items: [
			new Label({ text: "Intervalo", width: "5rem" }),
			param(agg, "interval", "1M, 1d, 1h…").addStyleClass("sapUiTinyMarginEnd"),
			new Label({ text: "Formato", width: "5rem" }),
			param(agg, "format", "yyyy-MM (opcional)")
		] }));
	} else if (agg.type === "terms") {
		box.addItem(new HBox({ alignItems: "Center", items: [new Label({ text: "Tamaño", width: "5rem" }), param(agg, "size", "buckets (opcional)")] }));
	} else {
		const arrKey = RANGE_KEY[agg.type];
		const arr = ((agg[arrKey] as Range[] | undefined) ??= []) as Range[];
		box.addItem(rangeList(arr, agg.type === "numericRange", refresh));
	}
	return box;
}
