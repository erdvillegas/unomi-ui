/*global QUnit */
import { sourceBuilder } from "unomi/ui/control/sourceBuilder";
import { exportPropsBuilder } from "unomi/ui/control/exportPropsBuilder";
import Panel from "sap/m/Panel";
import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import Input from "sap/m/Input";
import Select from "sap/m/Select";
import ComboBox from "sap/m/ComboBox";

QUnit.module("control/sourceBuilder — guided editor");

QUnit.test("renders a Panel and writes props.source when a field changes", (assert) => {
	const props: Record<string, unknown> = {};
	const panel = sourceBuilder(props, () => { /* refresh */ }) as Panel;
	assert.ok(panel.isA("sap.m.Panel"), "returns a Panel");

	const body = panel.getContent()[0] as VBox;
	const protoRow = body.getItems()[1] as HBox;    // [Text, row(Protocolo), ...]
	const protoSel = protoRow.getItems()[1] as Select;
	protoSel.setSelectedKey("ftp");
	protoSel.fireChange({ selectedItem: protoSel.getSelectedItem() ?? undefined });
	assert.strictEqual(typeof props.source, "string", "source URI generated");
	assert.ok((props.source as string).startsWith("ftp://"), "reflects the chosen protocol");
});

QUnit.module("control/exportPropsBuilder");

QUnit.test("writes segment and period into props", (assert) => {
	const props: Record<string, unknown> = {};
	const panel = exportPropsBuilder(props, [{ id: "s1", name: "Seg 1" }]) as Panel;
	assert.ok(panel.isA("sap.m.Panel"));

	const body = panel.getContent()[0] as VBox;   // [Text, row(Segmento), row(Periodo), Text]
	const seg = (body.getItems()[1] as HBox).getItems()[1] as ComboBox;
	seg.setSelectedKey("s1");
	seg.fireSelectionChange({ selectedItem: seg.getItems()[0] });
	assert.strictEqual(props.segment, "s1", "segment set from selection");

	const period = (body.getItems()[2] as HBox).getItems()[1] as Input;
	period.setValue("2m30s");
	period.fireChange();
	assert.strictEqual(props.period, "2m30s", "period set");
	period.setValue("");
	period.fireChange();
	assert.notOk("period" in props, "empty period removed");
});
