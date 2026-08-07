import Panel from "sap/m/Panel";
import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import Label from "sap/m/Label";
import Input from "sap/m/Input";
import ComboBox from "sap/m/ComboBox";
import Item from "sap/ui/core/Item";
import Text from "sap/m/Text";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";

// Guided editor for an export config's `properties`: which segment to export
// (picked from the live catalog) and, for recurrent exports, the period.
// The `mapping` (column index -> property) stays in the Advanced JSON panel.

const row = (label: string, ctrl: Control): HBox =>
	new HBox({ alignItems: "Center", items: [new Label({ text: label, width: "10rem" }), ctrl] }).addStyleClass("sapUiTinyMarginBottom");

export function exportPropsBuilder(props: Record<string, unknown>, segments: { id: string; name: string }[]): Control {
	const seg = new ComboBox({ selectedKey: (props.segment as string) || "", value: (props.segment as string) || "", placeholder: "segmento", width: "20rem" });
	segments.forEach((s) => seg.addItem(new Item({ key: s.id, text: s.name })));
	seg.attachSelectionChange((e: Event) => { const it = e.getParameter("selectedItem" as never) as Item; if (it) { props.segment = it.getKey(); } });
	seg.attachChange(() => { const v = seg.getSelectedKey() || seg.getValue(); if (v) { props.segment = v; } else { delete props.segment; } });

	const period = new Input({ value: (props.period as string) || "", placeholder: "2m30s (solo recurrent)", width: "12rem" });
	period.attachChange(() => { const v = period.getValue(); if (v) { props.period = v; } else { delete props.period; } });

	const body = new VBox().addStyleClass("sapUiSmallMarginBegin");
	body.addItem(new Text({ text: "Elige el segmento a exportar. El periodo solo aplica a exportaciones recurrentes (ej. 2m30s, 30s, 1h)." }).addStyleClass("sapUiTinyMarginBottom"));
	body.addItem(row("Segmento", seg));
	body.addItem(row("Periodo", period));
	body.addItem(new Text({ text: "El mapping (columna → propiedad) se edita en el panel Advanced JSON." }).addStyleClass("sapUiTinyMarginTop"));

	return new Panel({ headerText: "Segmento y periodo", expandable: true, expanded: true, content: [body] });
}
