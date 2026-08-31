const COSTS = Object.freeze({
  stripePercent: 0.029,
  stripeFixedDollars: 0.30,
  managedVoiceDollarsPerMinute: 0.111,
  managedPhoneDollarsPerMonth: 2,
  textAiDollarsPerRun: 0.00182,
  transactionalEmailDollarsEach: 0.001
});

const PLANS = [
  { key: "job_tracker", price: 39, voiceIncluded: 0, aiIncluded: 25, managedPhone: false },
  { key: "calls", price: 49, voiceIncluded: 0, aiIncluded: 0, managedPhone: true },
  { key: "starter", price: 79, voiceIncluded: 25, aiIncluded: 200, managedPhone: true },
  { key: "growth", price: 199, voiceIncluded: 100, aiIncluded: 1000, managedPhone: true },
  { key: "operator", price: 399, voiceIncluded: 300, aiIncluded: 5000, managedPhone: true }
];

const SCENARIOS = {
  light: {
    job_tracker: { aiRuns: 5, emails: 25, sharedInfra: 0.5 },
    calls: { aiRuns: 0, emails: 25, sharedInfra: 0.75 },
    starter: { aiRuns: 30, emails: 100, sharedInfra: 1.5 },
    growth: { aiRuns: 150, emails: 300, sharedInfra: 3 },
    operator: { aiRuns: 500, emails: 750, sharedInfra: 6 }
  },
  normal: {
    job_tracker: { aiRuns: 12, emails: 75, sharedInfra: 1 },
    calls: { aiRuns: 0, emails: 100, sharedInfra: 1.5 },
    starter: { aiRuns: 100, emails: 300, sharedInfra: 3 },
    growth: { aiRuns: 500, emails: 1000, sharedInfra: 7 },
    operator: { aiRuns: 2000, emails: 2500, sharedInfra: 15 }
  },
  heavy: {
    job_tracker: { aiRuns: 25, emails: 250, sharedInfra: 3 },
    calls: { aiRuns: 0, emails: 500, sharedInfra: 5 },
    starter: { aiRuns: 200, emails: 1000, sharedInfra: 8 },
    growth: { aiRuns: 1000, emails: 2500, sharedInfra: 20 },
    operator: { aiRuns: 5000, emails: 5000, sharedInfra: 45 }
  }
};

function round(value) {
  return Math.round(value * 100) / 100;
}

function calculate(plan, scenario) {
  const stripe = plan.price * COSTS.stripePercent + COSTS.stripeFixedDollars;
  const voice = plan.voiceIncluded * COSTS.managedVoiceDollarsPerMinute;
  const phone = plan.managedPhone ? COSTS.managedPhoneDollarsPerMonth : 0;
  const ai = Math.min(scenario.aiRuns, plan.aiIncluded) * COSTS.textAiDollarsPerRun;
  const email = scenario.emails * COSTS.transactionalEmailDollarsEach;
  const cogs = stripe + voice + phone + ai + email + scenario.sharedInfra;
  return {
    plan: plan.key,
    revenue: plan.price,
    estimatedCogs: round(cogs),
    grossProfit: round(plan.price - cogs),
    grossMarginPercent: round(((plan.price - cogs) / plan.price) * 100),
    voiceAndNumberPercent: round(((voice + phone) / plan.price) * 100)
  };
}

for (const [scenarioName, planScenarios] of Object.entries(SCENARIOS)) {
  console.log(`\n${scenarioName.toUpperCase()}`);
  console.table(PLANS.map((plan) => calculate(plan, planScenarios[plan.key])));
}

console.log("\nAssumptions");
console.table(COSTS);

