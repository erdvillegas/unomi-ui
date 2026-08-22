/**
 * App settings persisted in localStorage (not secrets — credentials stay in-memory
 * in UnomiClient). Base for future config: add a field here + a row in the Settings view.
 */

import Theming from "sap/ui/core/Theming";
import Localization from "sap/base/i18n/Localization";

const KEY = "unomi-ui-settings";

export interface AppSettings {
	appName: string;
	baseUrl: string;
	theme: string;
	language: string; // "" = follow browser
}

const DEFAULTS: AppSettings = { appName: "Unomi UI", baseUrl: "/cxs", theme: "sap_horizon", language: "" };

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

// ponytail: only sets an explicit language; "" leaves the browser default untouched
// (switching back to auto needs a reload — acceptable for a settings change).
export function applyLanguage(language: string): void {
	if (language) { Localization.setLanguage(language); }
}
