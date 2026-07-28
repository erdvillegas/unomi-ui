/**
 * App settings persisted in localStorage (not secrets — credentials stay in-memory
 * in UnomiClient). Base for future config: add a field here + a row in the Settings view.
 */

const KEY = "unomi-ui-settings";

export interface AppSettings {
	appName: string;
	baseUrl: string;
}

const DEFAULTS: AppSettings = { appName: "Unomi UI", baseUrl: "/cxs" };

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
