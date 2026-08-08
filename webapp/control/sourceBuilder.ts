import Panel from "sap/m/Panel";
import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import Label from "sap/m/Label";
import Input from "sap/m/Input";
import Select from "sap/m/Select";
import Item from "sap/ui/core/Item";
import Text from "sap/m/Text";
import Control from "sap/ui/core/Control";
import { row } from "unomi/ui/control/builders";

// Guided editor for a recurrent import `properties.source` (a Camel file/ftp URI).
// The user picks from fixed options (protocol, match mode, delay unit) and fills
// inputs; we assemble the URI. Falls back cleanly — the raw string is still in the
// Advanced JSON panel. ponytail: best-effort parse; anything exotic stays editable there.

export interface SourceParts {
	protocol: string; host: string; port: string; user: string; password: string;
	path: string; matchMode: "name" | "pattern"; fileName: string; pattern: string;
	delayVal: string; delayUnit: string; move: string;
}
const PROTOCOLS = ["file", "ftp", "sftp", "ftps"];

function defaults(): SourceParts {
	return { protocol: "file", host: "", port: "", user: "", password: "", path: "/",
		matchMode: "name", fileName: "", pattern: "", delayVal: "", delayUnit: "", move: "" };
}

export function buildSource(p: SourceParts): string {
	const proto = p.protocol || "file";
	const authority = proto === "file" ? ""
		: (p.user ? p.user + "@" : "") + (p.host || "") + (p.port ? ":" + p.port : "");
	let path = p.path || "/";
	if (!path.startsWith("/")) { path = "/" + path; }
	const q: string[] = [];
	if (proto !== "file" && p.password) { q.push("password=" + p.password); }
	if (p.matchMode === "pattern") { if (p.pattern) { q.push("include=" + p.pattern); } }
	else if (p.fileName) { q.push("fileName=" + p.fileName); }
	if (p.delayVal) { q.push("consumer.delay=" + p.delayVal + (p.delayUnit || "")); }
	if (p.move) { q.push("move=" + p.move); }
	return proto + "://" + authority + path + (q.length ? "?" + q.join("&") : "");
}

export function parseSource(url: string): SourceParts {
	const p = defaults();
	if (!url) { return p; }
	const sep = url.indexOf("://");
	if (sep < 0) { return p; }
	p.protocol = url.slice(0, sep) || "file";
	const rest = url.slice(sep + 3);
	const qIdx = rest.indexOf("?");
	const beforeQ = qIdx >= 0 ? rest.slice(0, qIdx) : rest;
	const query = qIdx >= 0 ? rest.slice(qIdx + 1) : "";
	if (beforeQ.startsWith("/")) {
		p.path = beforeQ;
	} else {
		const slash = beforeQ.indexOf("/");
		const auth = slash >= 0 ? beforeQ.slice(0, slash) : beforeQ;
		p.path = slash >= 0 ? beforeQ.slice(slash) : "/";
		let hostpart = auth;
		const at = auth.indexOf("@");
		if (at >= 0) { p.user = auth.slice(0, at); hostpart = auth.slice(at + 1); }
		const colon = hostpart.indexOf(":");
		if (colon >= 0) { p.host = hostpart.slice(0, colon); p.port = hostpart.slice(colon + 1); }
		else { p.host = hostpart; }
	}
	const params = new Map<string, string>();
	query.split("&").filter(Boolean).forEach((kv) => {
		const i = kv.indexOf("=");
		params.set(i >= 0 ? kv.slice(0, i) : kv, i >= 0 ? kv.slice(i + 1) : "");
	});
	if (params.has("password")) { p.password = params.get("password") as string; }
	if (params.has("include") || params.has("antInclude")) {
		p.matchMode = "pattern"; p.pattern = (params.get("include") ?? params.get("antInclude")) as string;
	} else if (params.has("fileName")) {
		p.matchMode = "name"; p.fileName = params.get("fileName") as string;
	}
	const d = params.get("consumer.delay") ?? params.get("delay");
	if (d) {
		const m = /^(\d+)(ms|s|m|h)?$/.exec(d);
		if (m) { p.delayVal = m[1]; p.delayUnit = m[2] && m[2] !== "ms" ? m[2] : ""; }
	}
	if (params.has("move")) { p.move = params.get("move") as string; }
	return p;
}

// `props` is the config's `properties` object; we read/write `props.source`.
// `refresh` fully re-renders the panel (used when a choice changes which fields show).
export function sourceBuilder(props: Record<string, unknown>, refresh: () => void): Control {
	const p = parseSource((props.source as string) || "");
	const preview = new Input({ value: "", editable: false, width: "100%" });
	const sync = (): void => { props.source = buildSource(p); preview.setValue(props.source as string); };

	const protoSel = new Select({ selectedKey: p.protocol, width: "8rem" });
	PROTOCOLS.forEach((x) => protoSel.addItem(new Item({ key: x, text: x })));
	protoSel.attachChange(() => { p.protocol = protoSel.getSelectedKey(); sync(); refresh(); });

	const body = new VBox().addStyleClass("sapUiSmallMarginBegin");
	body.addItem(new Text({ text: "Solo aplica a importaciones recurrentes. Protocolos: file, ftp, sftp, ftps." }).addStyleClass("sapUiTinyMarginBottom"));
	body.addItem(row("Protocolo", protoSel));

	if (p.protocol !== "file") {
		const host = new Input({ value: p.host, placeholder: "servidor", width: "16rem" });
		host.attachChange(() => { p.host = host.getValue(); sync(); });
		const port = new Input({ value: p.port, placeholder: "puerto", type: "Number", width: "8rem" });
		port.attachChange(() => { p.port = port.getValue(); sync(); });
		const user = new Input({ value: p.user, placeholder: "usuario", width: "16rem" });
		user.attachChange(() => { p.user = user.getValue(); sync(); });
		const pass = new Input({ value: p.password, placeholder: "contraseña", type: "Password", width: "16rem" });
		pass.attachChange(() => { p.password = pass.getValue(); sync(); });
		body.addItem(row("Host", host));
		body.addItem(row("Puerto", port));
		body.addItem(row("Usuario", user));
		body.addItem(row("Contraseña", pass));
	}

	const path = new Input({ value: p.path, placeholder: "/ruta/carpeta/", width: "24rem" });
	path.attachChange(() => { p.path = path.getValue(); sync(); });
	body.addItem(row("Carpeta", path));

	const matchSel = new Select({ selectedKey: p.matchMode, width: "12rem" });
	matchSel.addItem(new Item({ key: "name", text: "Un archivo" }));
	matchSel.addItem(new Item({ key: "pattern", text: "Patrón (regex)" }));
	matchSel.attachChange(() => { p.matchMode = matchSel.getSelectedKey() as "name" | "pattern"; sync(); refresh(); });
	const matchInp = new Input({
		value: p.matchMode === "pattern" ? p.pattern : p.fileName,
		placeholder: p.matchMode === "pattern" ? ".*\\.csv" : "profiles.csv", width: "16rem"
	});
	matchInp.attachChange(() => {
		if (p.matchMode === "pattern") { p.pattern = matchInp.getValue(); } else { p.fileName = matchInp.getValue(); }
		sync();
	});
	body.addItem(row("Archivo", new HBox({ items: [matchSel, matchInp] })));

	const delayVal = new Input({ value: p.delayVal, placeholder: "20", type: "Number", width: "8rem" });
	delayVal.attachChange(() => { p.delayVal = delayVal.getValue(); sync(); });
	const unitSel = new Select({ selectedKey: p.delayUnit || "ms", width: "6rem" });
	[["ms", "ms"], ["s", "s"], ["m", "min"], ["h", "h"]].forEach(([k, t]) => unitSel.addItem(new Item({ key: k, text: t })));
	unitSel.attachChange(() => { const k = unitSel.getSelectedKey(); p.delayUnit = k === "ms" ? "" : k; sync(); });
	body.addItem(row("Frecuencia", new HBox({ items: [delayVal, unitSel] })));

	const move = new Input({ value: p.move, placeholder: ".camel (por defecto)", width: "16rem" });
	move.attachChange(() => { p.move = move.getValue(); sync(); });
	body.addItem(row("Mover procesados a", move));

	body.addItem(new Label({ text: "source (generado)", design: "Bold" }).addStyleClass("sapUiSmallMarginTop"));
	preview.setValue(buildSource(p));
	body.addItem(preview);

	return new Panel({ headerText: "Origen (source)", expandable: true, expanded: true, content: [body] });
}
