type ScenarioVariantKey = 'strict' | 'balanced' | 'relaxed';
export type ScenarioConditionDetail = {
    keyword: string;
    label: string;
    detail: string;
};
export type GeneratedScenario = {
    tempScenarioId: string;
    variant: ScenarioVariantKey;
    name: string;
    description: string;
    conditions: ScenarioConditionDetail[];
    sql: string;
    numericThresholds: Array<number | null>;
    keywords: string[];
};
export declare function generateScenarios(keywordsInput: string[]): GeneratedScenario[];
export {};
//# sourceMappingURL=scenarioGenerator.d.ts.map