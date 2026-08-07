import SimpleForm from "sap/ui/layout/form/SimpleForm";
import Label from "sap/m/Label";
import Input from "sap/m/Input";
import TextArea from "sap/m/TextArea";
import Switch from "sap/m/Switch";
import Select from "sap/m/Select";
import Item from "sap/ui/core/Item";
import FormattedText from "sap/m/FormattedText";
import DateTimePicker from "sap/m/DateTimePicker";
import MultiInput from "sap/m/MultiInput";
import Token from "sap/m/Token";
import Control from "sap/ui/core/Control";
import JSONModel from "sap/ui/model/json/JSONModel";
import Integer from "sap/ui/model/type/Integer";
import Float from "sap/ui/model/type/Float";
import Event from "sap/ui/base/Event";

// Declarative field -> native control. Binds two-way to the "form" model, so the
// edited item object is the single source of truth (no manual read-back).
export interface Field {
	path: string;   // dotted path into the item, e.g. "metadata.name"
	label: string;
	type: "text" | "textarea" | "int" | "float" | "switch" | "datetime" | "tokens" | "select" | "help";
	readonly?: boolean;
	options?: { key: string; text: string }[];   // for "select"
	html?: string;                                 // for "help" (FormattedText)
}

const slash = (p: string): string => "/" + p.replace(/\./g, "/");
const bind = (p: string): string => "{form>" + slash(p) + "}";

export function buildForm(fields: Field[], model: JSONModel): SimpleForm {
	const content: Control[] = [];
	for (const f of fields) {
		// "help" spans a full row: empty label keeps the SimpleForm label/field pairing.
		content.push(new Label({ text: f.type === "help" ? "" : f.label }));
		content.push(field(f, model));
	}
	return new SimpleForm({ editable: true, layout: "ResponsiveGridLayout", content });
}

function field(f: Field, model: JSONModel): Control {
	const ro = f.readonly === true;
	switch (f.type) {
		case "textarea":
			return new TextArea({ value: bind(f.path), editable: !ro, rows: 3, width: "100%", growing: true });
		case "switch":
			return new Switch({ state: { path: "form>" + slash(f.path) }, enabled: !ro });
		case "int":
			return new Input({ value: { path: "form>" + slash(f.path), type: new Integer() }, editable: !ro, type: "Number" });
		case "float":
			return new Input({ value: { path: "form>" + slash(f.path), type: new Float() }, editable: !ro, type: "Number" });
		case "datetime":
			return new DateTimePicker({ value: bind(f.path), editable: !ro, valueFormat: "yyyy-MM-dd'T'HH:mm:ss", displayFormat: "yyyy-MM-dd HH:mm", width: "100%" });
		case "tokens":
			return tokens(f, model);
		case "select": {
			const sel = new Select({ selectedKey: bind(f.path), enabled: !ro, width: "100%" });
			(f.options || []).forEach((o) => sel.addItem(new Item({ key: o.key, text: o.text })));
			return sel;
		}
		case "help":
			return new FormattedText({ htmlText: f.html || "", width: "100%" });
		default:
			return new Input({ value: bind(f.path), editable: !ro, width: "100%" });
	}
}

// MultiInput for string[]. ponytail: sync deferred to next tick because tokenUpdate
// fires before the token list settles; fine for small tag lists.
function tokens(f: Field, model: JSONModel): MultiInput {
	const path = slash(f.path);
	const mi = new MultiInput({ width: "100%", editable: f.readonly !== true });
	((model.getProperty(path) as string[]) || []).forEach((v) => mi.addToken(new Token({ text: v })));
	const sync = () => model.setProperty(path, mi.getTokens().map((t) => t.getText()));
	mi.attachTokenUpdate(() => setTimeout(sync, 0));
	mi.attachSubmit((e: Event) => {
		const v = e.getParameter("value" as never) as string;
		if (v) { mi.addToken(new Token({ text: v })); mi.setValue(""); sync(); }
	});
	return mi;
}
