import { callLLM } from '../api';
import { systemLog } from '../logger';

async function validateAndFixEntities(parsed, originalQuery) {
  const validationPrompt = `FIX research entity clustering AND ENFORCE BALANCE:
ORIGINAL QUERY: "${originalQuery}"
CURRENT: ${JSON.stringify(parsed)}

TASK:
1. Remove CONTEXT TERMS (AI/ML/tech) from entities → add to core_task
2. **ENFORCE EXACTLY 2-3 questions PER TARGET ENTITY** (no exceptions)
3. Re-generate missing sub-questions for any entity with fewer than 2
4. Every entity must have equal coverage

If already perfect (every entity has 2-3 questions): {"valid": true}
Else: return COMPLETE corrected JSON with the same schema`;

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

  const systemPrompt = `You are a Semantic Research Planner. Decompose research queries into isolated target entities using clustering logic.

PHASE 1 - SEMANTIC CLUSTERING:
1. Extract ALL candidate terms from the query.
2. Group by SIMILAR NATURE (industries, locations, companies form TARGET clusters).
3. ISOLATED TERMS (technologies, methods like AI/ML) = CONTEXT, not entities.
4. Only TARGET CLUSTER becomes the entities[] array.

PHASE 2 - PER-ENTITY SUB-QUESTIONS:
- Generate EXACTLY 2-3 focused sub-questions PER TARGET ENTITY.
- Each sub-question targets ONE entity + the research context.
- Every entity MUST have its own entry in sub_questions with 2-3 questions.

REQUIRED JSON OUTPUT:
{"core_task": "Researching [CONTEXT] within specific sectors", "entities": [{"name": "Entity Name", "domain": "Optional", "synonyms": []}], "sub_questions": [{"entity": "Entity Name", "questions": ["Q1", "Q2", "Q3"]}]}

CRITICAL: Return ONLY valid JSON. Every entity in entities[] MUST have a matching entry in sub_questions[] with 2-3 questions.`;

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
      systemLog.info(`Context identified: ${parsed.core_task}`);
      systemLog.info(
        `Entities found: ${parsed.entities.map(e => {
          const syns = e.synonyms?.length ? ` (also: ${e.synonyms.slice(0, 3).join(', ')})` : '';
          return e.name + syns;
        }).join(' | ')}`
      );
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
