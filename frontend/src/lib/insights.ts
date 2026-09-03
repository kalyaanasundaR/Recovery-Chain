// Pure aggregation over the real /cases list. No fabricated values — every
// number here is a count or sum of fields the backend returned.

const num = (v: any) => Number(v ?? 0);
const amt = (v: any) => (v && typeof v === 'object' ? Number(v.amount) : Number(v ?? 0));

export interface Group {
    key: string;
    count: number;
    atRisk: number;
    recovered: number;
    avgProb: number | null;
}

function groupBy(cases: any[], field: string): Group[] {
    const map = new Map<
        string,
        { count: number; atRisk: number; recovered: number; probSum: number; probN: number }
    >();
    for (const c of cases) {
        const k = c[field] || '—';
        const g = map.get(k) || { count: 0, atRisk: 0, recovered: 0, probSum: 0, probN: 0 };
        g.count++;
        g.atRisk += num(c.amount_at_risk);
        g.recovered += amt(c.actual_amount_recovered);
        if (c.recovery_probability != null) {
            g.probSum += num(c.recovery_probability);
            g.probN++;
        }
        map.set(k, g);
    }
    return [...map.entries()]
        .map(([key, g]) => ({
            key,
            count: g.count,
            atRisk: g.atRisk,
            recovered: g.recovered,
            avgProb: g.probN ? g.probSum / g.probN : null,
        }))
        .sort((a, b) => b.atRisk - a.atRisk);
}

export function computeInsights(cases: any[]) {
    const total = cases.length;
    const atRisk = cases.reduce((s, c) => s + num(c.amount_at_risk), 0);
    const recovered = cases.reduce((s, c) => s + amt(c.actual_amount_recovered), 0);
    const withOutcome = cases.filter((c) => c.outcome_status);
    const executed = cases.filter((c) => c.execution_status === 'COMPLETED_SIMULATED');
    const escalated = cases.filter((c) => c.policy_status === 'ESCALATE');
    const permitted = cases.filter((c) => c.policy_status === 'PERMITTED');
    const auto = total ? permitted.length / total : 0;

    return {
        total,
        atRisk,
        recovered,
        recoveryRate: atRisk ? recovered / atRisk : 0,
        outcomeCounts: {
            FULLY_RECOVERED: cases.filter((c) => c.outcome_status === 'FULLY_RECOVERED').length,
            PARTIALLY_RECOVERED: cases.filter((c) => c.outcome_status === 'PARTIALLY_RECOVERED')
                .length,
            NOT_RECOVERED: cases.filter((c) => c.outcome_status === 'NOT_RECOVERED').length,
            PENDING_VERIFICATION: cases.filter((c) => c.outcome_status === 'PENDING_VERIFICATION')
                .length,
            none: total - withOutcome.length,
        },
        policyCounts: {
            PERMITTED: permitted.length,
            ESCALATE: escalated.length,
            WAIT: cases.filter((c) => c.policy_status === 'WAIT').length,
            DENIED: cases.filter((c) => c.policy_status === 'DENIED').length,
            none: cases.filter((c) => !c.policy_status).length,
        },
        automationRate: auto,
        executedCount: executed.length,
        escalatedCount: escalated.length,
        byCause: groupBy(cases, 'cause_category'),
        byRisk: groupBy(cases, 'risk_level'),
        byAction: groupBy(cases, 'recommended_action'),
        byCategory: groupBy(cases, 'risk_category'),
    };
}
