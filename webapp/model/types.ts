/** Minimal domain types — only the fields the UI actually binds. Extend as needed. */

export interface Profile {
	itemId: string;
	scope?: string;
	properties?: Record<string, unknown>;
	segments?: string[];
}

export interface Session {
	itemId: string;
	scope?: string;
	timeStamp?: string;
	duration?: number;
	size?: number;
}

export interface UnomiEvent {
	itemId: string;
	eventType?: string;
	scope?: string;
	timeStamp?: string;
	properties?: Record<string, unknown>;
}

export interface Metadata {
	id: string;
	name?: string;
	description?: string;
	enabled?: boolean;
}
