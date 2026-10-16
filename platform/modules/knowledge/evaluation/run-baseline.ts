import { runSyntheticKnowledgeBaseline } from "./synthetic-baseline.js";

const result = await runSyntheticKnowledgeBaseline(3);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
