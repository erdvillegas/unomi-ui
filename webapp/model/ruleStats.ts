// Rule execution statistics (docs/openapi.json #/components/schemas/RuleStatistics).
// Times are cumulative milliseconds; *local* counts are this node's share of the cluster total.
export interface RuleStats {
	executionCount?: number; localExecutionCount?: number;
	conditionsTime?: number; localConditionsTime?: number;
	actionsTime?: number; localActionsTime?: number;
	version?: number; scope?: string; lastSyncDate?: string;
}

export interface RuleStatsView extends RuleStats {
	conditionsPct: number; actionsPct: number; localPct: number;
}

// Derive the percentages the visual stats panel needs (bars + local share),
// guarding the divide-by-zero when a rule has never fired.
export function deriveRuleStats(s: RuleStats | null | undefined): RuleStatsView {
	const st = s ?? {};
	const totalTime = (st.conditionsTime ?? 0) + (st.actionsTime ?? 0);
	const exec = st.executionCount ?? 0;
	return {
		...st,
		conditionsPct: totalTime ? Math.round((st.conditionsTime ?? 0) / totalTime * 100) : 0,
		actionsPct: totalTime ? Math.round((st.actionsTime ?? 0) / totalTime * 100) : 0,
		localPct: exec ? Math.round((st.localExecutionCount ?? 0) / exec * 100) : 0
	};
}
