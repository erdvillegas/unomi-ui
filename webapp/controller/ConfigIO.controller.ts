import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import Event from "sap/ui/base/Event";
import ListItemBase from "sap/m/ListItemBase";
import FileUploader from "sap/ui/unified/FileUploader";
import * as UnomiClient from "unomi/ui/service/UnomiClient";
import { Metadata } from "unomi/ui/model/types";

interface Cfg { itemId: string; name?: string; active?: boolean; }

/**
 * @namespace unomi.ui.controller
 */
export default class ConfigIO extends BaseController {

	private file: File | null = null;

	public onInit(): void {
		this.getView()?.setModel(new JSONModel({
			tab: "export", busy: false, segments: [] as { id: string; name: string }[],
			exportSegment: "", exportConfigs: [] as Cfg[], importConfigs: [] as Cfg[], importConfigId: ""
		}), "io");
		const router = this.getRouter();
		router.getRoute("exportConfig")?.attachPatternMatched(() => this.onShow("export"), this);
		router.getRoute("importConfig")?.attachPatternMatched(() => this.onShow("import"), this);
	}

	private onShow(tab: string): void {
		if (!this.requireAuth()) {
			return;
		}
		(this.getView()?.getModel("io") as JSONModel).setProperty("/tab", tab);
		void this.load();
	}

	private async load(): Promise<void> {
		const model = this.getView()?.getModel("io") as JSONModel;
		model.setProperty("/busy", true);
		try {
			const [segments, exp, imp] = await Promise.all([
				UnomiClient.getJson<Metadata[]>("/segments"),
				UnomiClient.getJson<Cfg[]>("/exportConfiguration"),
				UnomiClient.getJson<Cfg[]>("/importConfiguration")
			]);
			model.setProperty("/segments", [{ id: "", name: "(all profiles)" }, ...segments.map((s) => ({ id: s.id, name: s.name || s.id }))]);
			model.setProperty("/exportConfigs", exp);
			model.setProperty("/importConfigs", imp);
		} catch (e) {
			MessageToast.show(`Load failed: ${(e as Error).message}`);
		} finally {
			model.setProperty("/busy", false);
		}
	}

	public async onExportNow(): Promise<void> {
		const seg = (this.getView()?.getModel("io") as JSONModel).getProperty("/exportSegment") as string;
		const condition = seg
			? { type: "profileSegmentCondition", parameterValues: { segments: [seg], matchType: "in" } }
			: { type: "matchAllCondition", parameterValues: {} };
		try {
			const csv = await UnomiClient.postCsv("/profiles/export", { condition });
			UnomiClient.downloadText(csv, `profiles_${seg || "all"}.csv`);
		} catch (e) {
			MessageToast.show(`Export failed: ${(e as Error).message}`);
		}
	}

	public onFileChange(event: Event): void {
		const files = event.getParameter("files" as never) as FileList | undefined;
		this.file = files && files.length ? files[0] : null;
	}

	public async onImportNow(): Promise<void> {
		const configId = (this.getView()?.getModel("io") as JSONModel).getProperty("/importConfigId") as string;
		if (!configId) {
			MessageToast.show("Select an import configuration");
			return;
		}
		if (!this.file) {
			MessageToast.show("Choose a CSV file");
			return;
		}
		const form = new FormData();
		form.append("importConfigId", configId);
		form.append("file", this.file, this.file.name);
		try {
			await UnomiClient.postForm("/importConfiguration/oneshot", form);
			MessageToast.show("Import submitted");
			(this.byId("csvUploader") as FileUploader).clear();
			this.file = null;
		} catch (e) {
			MessageToast.show(`Import failed: ${(e as Error).message}`);
		}
	}

	public onNewExport(): void {
		this.getRouter().navTo("exportConfigDetail", { itemId: "new" });
	}

	public onNewImport(): void {
		this.getRouter().navTo("importConfigDetail", { itemId: "new" });
	}

	// Perfiles de configuración de ejemplo (basados en la doc de Unomi).
	// mapping: <propiedad Unomi> -> <índice de columna CSV>; propertiesToOverwrite null = todas.
	private sampleImport(over: Record<string, unknown>): Record<string, unknown> {
		return {
			itemType: "importConfig",
			properties: { mapping: { email: 0, firstName: 1, lastName: 2 } },
			columnSeparator: ",", lineSeparator: "\n", multiValueSeparator: ";", multiValueDelimiter: "[]",
			mergingProperty: "email", overwriteExistingProfiles: true, propertiesToOverwrite: null,
			hasHeader: true, hasDeleteColumn: false, active: true, executions: [], ...over
		};
	}

	public onCreateSampleImport(): void {
		void this.createSample("/importConfiguration", this.sampleImport({
			itemId: "sample-import-config", name: "Import Config Sample", configType: "oneshot",
			description: "Ejemplo one-shot: importa perfiles desde un CSV con columnas email, firstName, lastName."
		}));
	}

	public onCreateSampleRecurrent(): void {
		// ponytail: active=false para no arrancar el polling FTP/archivo en dev; enciéndelo al probar.
		void this.createSample("/importConfiguration", this.sampleImport({
			itemId: "sample-import-recurrent", name: "Import Config Sample (recurrent)", configType: "recurrent",
			description: "Ejemplo recurrent: sondea un origen y lo importa periódicamente.",
			active: false,
			properties: {
				source: "file:///tmp/?fileName=profiles.csv&move=.done&consumer.delay=20000",
				mapping: { email: 0, firstName: 1, lastName: 2 }
			}
		}));
	}

	// Export samples. mapping va al revés que import: <índice de columna> -> <propiedad Unomi>.
	private sampleExport(over: Record<string, unknown>): Record<string, unknown> {
		return {
			itemType: "exportConfig",
			properties: { segment: "clientes-garcia", mapping: { "0": "firstName", "1": "lastName", "2": "email" } },
			columnSeparator: ",", lineSeparator: "\n", multiValueSeparator: ";", multiValueDelimiter: "[]",
			active: true, executions: [], ...over
		};
	}

	public onCreateSampleExport(): void {
		void this.createSample("/exportConfiguration", this.sampleExport({
			itemId: "sample-export-config", name: "Export configuration sample", configType: "oneshot",
			description: "Ejemplo one-shot: exporta los perfiles de un segmento a CSV."
		}));
	}

	public onCreateSampleExportRecurrent(): void {
		void this.createSample("/exportConfiguration", this.sampleExport({
			itemId: "sample-export-recurrent", name: "Export configuration sample (recurrent)", configType: "recurrent",
			description: "Ejemplo recurrent: exporta un segmento cada cierto periodo.",
			properties: { period: "2m30s", segment: "clientes-garcia", mapping: { "0": "firstName", "1": "lastName", "2": "email" } }
		}));
	}

	private async createSample(path: string, sample: Record<string, unknown>): Promise<void> {
		try {
			await UnomiClient.postJson(path, sample);
			MessageToast.show("Configuración de ejemplo creada");
			await this.load();
		} catch (e) {
			MessageToast.show(`No se pudo crear: ${(e as Error).message}`);
		}
	}

	public onExportPress(event: Event): void {
		this.openDetail(event, "exportConfigDetail");
	}

	public onImportPress(event: Event): void {
		this.openDetail(event, "importConfigDetail");
	}

	private openDetail(event: Event, route: string): void {
		const cfg = (event.getSource() as ListItemBase).getBindingContext("io")?.getObject() as Cfg;
		this.getRouter().navTo(route, { itemId: encodeURIComponent(cfg.itemId) });
	}

	public onDeleteExport(event: Event): void {
		void this.doDelete(event, "/exportConfiguration");
	}

	public onDeleteImport(event: Event): void {
		void this.doDelete(event, "/importConfiguration");
	}

	private async doDelete(event: Event, path: string): Promise<void> {
		const cfg = (event.getParameter("listItem" as never) as ListItemBase).getBindingContext("io")?.getObject() as Cfg;
		try {
			await UnomiClient.del(`${path}/${encodeURIComponent(cfg.itemId)}`);
			MessageToast.show("Deleted");
			await this.load();
		} catch (e) {
			MessageToast.show(`Delete failed: ${(e as Error).message}`);
		}
	}
}
