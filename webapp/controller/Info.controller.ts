import BaseController from "unomi/ui/controller/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import VersionInfo from "sap/ui/VersionInfo";
import Component from "unomi/ui/Component";
import * as Settings from "unomi/ui/service/Settings";
import * as UnomiClient from "unomi/ui/service/UnomiClient";

interface ClusterNode {
  publicHostAddress?: string;
  internalHostAddress?: string;
  uptime?: number;
  master?: boolean;
  data?: boolean;
  cpuLoad?: number;
  loadAverage?: number[];
  serverInfo?: { serverVersion?: string; serverBuildNumber?: string };
}

/**
 * @namespace unomi.ui.controller
 */
export default class Info extends BaseController {
  public onInit(): void {
    this.getRouter().getRoute("info")?.attachPatternMatched(this.onShow, this);
  }

  // Version info (app/UI5/base URL) + live cluster nodes from GET /cluster.
  private async onShow(): Promise<void> {
    const comp = this.getOwnerComponent() as Component;
    const cfg = Settings.load();
    let ui5Version = "";
    try {
      ui5Version =
        ((await VersionInfo.load()) as { version?: string }).version || "";
    } catch {
      /* version info unavailable — leave blank */
    }
    const model = new JSONModel({
      appName: cfg.appName,
      appVersion: comp?.getManifestEntry(
        "/sap.app/applicationVersion/version",
      ) as string,
      ui5Version,
      baseUrl: cfg.baseUrl,
      nodes: [] as ClusterNode[],
    });
    this.getView()?.setModel(model, "info");
    try {
      model.setProperty("/nodes", await UnomiClient.getJson<ClusterNode[]>("/cluster"));
    } catch {
      /* not authenticated / cluster unavailable — table stays empty */
    }
  }
}
