import { callLLM } from '../api';
import { systemLog } from '../logger';

async function validateAndFixEntities(parsed, originalQuery) {
  const validationPrompt = `You are validating a research decomposition. Check and fix the following:

ORIGINAL QUERY: "${originalQuery}"
CURRENT DECOMPOSITION: ${JSON.stringify(parsed)}

RULES TO ENFORCE:
1. core_task must be the SUBJECT CONSTANT — the single thing being researched (e.g. "ways AI is being used", "STRA approval requirements"). It must NOT be one of the entities.
2. entities[] must be the DIMENSIONS — the list of things being compared or iterated over (e.g. industries, jurisdictions, companies). Do NOT put the subject in entities[].
3. Every entity must have EXACTLY 2-3 sub-questions.
4. CRITICAL: Every sub-question must explicitly reference the subject constant (core_task). A sub-question that does not mention or clearly imply the subject is WRONG and must be rewritten.
   - If core_task is "ways AI is being used", every question must mention AI.
   - If core_task is "STRA approval requirements", every question must reference STRA or approval requirements.
5. Each sub-question must also be specific to its entity (not generic).
6. Think of each sub-question as: "How does [core_task] apply to [entity]?"

If everything is already correct: {"valid": true}
Otherwise: return the COMPLETE corrected JSON using the same schema.`;

  try {
    const fixResult = await callLLM(validationPrompt, "", true);
    const fixed = JSON.parse(fixResult);
    if (fixed.valid !== true) {
      systemLog.info("🔧 Auto-corrected entity clustering & balanced sub-questions", {
        before: parsed.entities?.length || 0,
        after: fixed.entities?.length || 0
      });
      return fixed;
    }
    return parsed;
  } catch (error) {
    systemLog.warn("Self-healing failed, using original extraction", error.message);
    return parsed;
  }
}

function checkBalance(parsed) {
  const counts = (parsed.sub_questions || []).reduce((acc, sq) => {
    acc[sq.entity] = (sq.questions || []).length;
    return acc;
  }, {});
  const unbalanced = Object.entries(counts).filter(([_, c]) => c < 2);
  return { counts, unbalanced };
}

export async function translateQuery(query) {
  systemLog.info("PART 1: Translator (Semantic Clustering + Entity Isolation)");

  const systemPrompt = `You are a Research Decomposition Agent. Your job is to split a research question into a SUBJECT CONSTANT and a set of DIMENSIONS, then generate sub-questions that are the intersection of both.

STEP 1 — IDENTIFY THE SUBJECT CONSTANT (core_task):
Ask: "What is the single thing this question wants to understand?"
This is constant — it must appear in every sub-question.
It is NOT one of the things being compared. It is the lens.
Store this in core_task.

STEP 2 — IDENTIFY THE DIMENSIONS (entities):
Ask: "What is being compared or enumerated? What do I loop over?"
These become entities[]. They are the independent variables.
Do NOT put the subject in entities[].

STEP 3 — GENERATE SUB-QUESTIONS (subject × entity):
For each entity, generate EXACTLY 2-3 sub-questions where:
- EVERY question must explicitly reference the subject constant
- EVERY question must be specific to that entity
- Frame each as: "How does [subject] apply to [entity]?"

WORKED EXAMPLES:

Query: "Research the way AI is being used in mortgage brokering, lending and capital raising"
core_task: "ways AI is being used"
entities: [Mortgage Brokering, Lending, Capital Raising]
✅ CORRECT sub-questions:
  - "What AI tools are being used for risk assessment in mortgage brokering?"
  - "How is AI automating loan approval decisions in lending?"
  - "In what ways is AI being used to identify investors in capital raising?"
❌ WRONG (subject missing):
  - "How is the mortgage application process being streamlined?" ← no mention of AI
  - "What role does fraud detection play in lending?" ← no mention of AI

Query: "Compare STRA approval requirements in City of Stirling, City of Perth and Mosman Park"
core_task: "STRA development approval requirements"
entities: [City of Stirling, City of Perth, Mosman Park]
✅ CORRECT: "What are the STRA approval conditions for short-term rentals in the City of Stirling?"
❌ WRONG: "What development applications are common in the City of Stirling?" ← subject missing

REQUIRED JSON OUTPUT:
{"core_task": "[subject constant]", "entities": [{"name": "Entity Name", "domain": "Optional", "synonyms": []}], "sub_questions": [{"entity": "Entity Name", "questions": ["Q1 referencing subject", "Q2 referencing subject"]}]}

CRITICAL: Return ONLY valid JSON. Every sub-question MUST reference the subject constant (core_task).`;

  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await callLLM(systemPrompt, query, true);
      let parsed = JSON.parse(result);

      parsed = await validateAndFixEntities(parsed, query);

      const { counts, unbalanced } = checkBalance(parsed);

      if (unbalanced.length > 0) {
        systemLog.warn(`Attempt ${attempt}/${MAX_ATTEMPTS}: unbalanced sub-questions — retrying`, counts);
        if (attempt === MAX_ATTEMPTS) {
          throw new Error(`Could not produce balanced sub-questions after ${MAX_ATTEMPTS} attempts. Unbalanced: ${unbalanced.map(([e, c]) => `${e}: ${c}`).join(', ')}`);
        }
        continue;
      }

      if (!parsed.entities || parsed.entities.length === 0) {
        throw new Error("No valid target entities extracted.");
      }

      systemLog.info(`Research question: "${query}"`);
      systemLog.info(`Subject constant: ${parsed.core_task}`);
      systemLog.info(`Dimensions (entities): ${parsed.entities.map(e => e.name).join(', ')}`);
      parsed.entities.forEach(e => {
        const syns = e.synonyms?.length ? ` (also: ${e.synonyms.slice(0, 3).join(', ')})` : '';
        systemLog.info(`  Entity: ${e.name}${syns}`);
      });
      for (const sq of parsed.sub_questions) {
        sq.questions.forEach((q, i) => {
          systemLog.info(`  [${sq.entity}] Q${i + 1}: ${q}`);
        });
      }

      return parsed;

    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        systemLog.error("❌ Translator failed", { error: error.message, query });
        throw new Error(`Translator failed: ${error.message}`);
      }
      systemLog.warn(`Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${error.message} — retrying`);
    }
  }
}
