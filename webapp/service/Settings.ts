/**
 * App settings persisted in localStorage (not secrets — credentials stay in-memory
 * in UnomiClient). Base for future config: add a field here + a row in the Settings view.
 */

import Theming from "sap/ui/core/Theming";

const KEY = "unomi-ui-settings";

export interface AppSettings {
	appName: string;
	baseUrl: string;
	theme: string;
}

const DEFAULTS: AppSettings = { appName: "Unomi UI", baseUrl: "/cxs", theme: "sap_horizon" };

export function load(): AppSettings {
	try {
		return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
	} catch {
		return { ...DEFAULTS };
	}
}

export function save(s: AppSettings): void {
	localStorage.setItem(KEY, JSON.stringify(s));
}

export function applyTheme(theme: string): void {
	Theming.setTheme(theme || DEFAULTS.theme);
}
