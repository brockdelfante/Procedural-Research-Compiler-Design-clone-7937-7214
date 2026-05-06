import { searchTavily } from '../api';
import { extractData } from './extractor';
import { systemLog } from '../logger';
import { PersistenceService } from '../persistence';

const MATRIX_AXES = {
  DOMAINS: ['site:.gov.au', 'site:.edu.au', 'site:.org'],
  FILETYPES: ['filetype:pdf', 'filetype:docx', 'filetype:xlsx'],
  INFO_TYPES: ['policy', 'report', 'review', 'guideline', 'evaluation', 'submission']
};

const TIER_NAMES = {
  0: 'Authority First',
  1: 'Official Data',
  2: 'Domain Matrix',
  3: 'Filetype Deep-dive',
  4: 'Contextual Policy'
};

// Minimum authority sources to consider a sub-question adequately covered by Tier 0
const MIN_AUTHORITY_HITS_PER_QUESTION = 2;
// Maximum total sources to collect per sub-question across all tiers
const MAX_SOURCES_PER_QUESTION = 4;

// Tier 0 templates A-C use the entity name; D uses the first synonym (if available)
const TIER0_ENTITY_TEMPLATES = [
  (entity, question) => `"${entity}" ${question} filetype:pdf`,
  (entity, question) => `"${entity}" ${question} site:.gov.au OR site:.edu.au`,
  (entity, question) => `"${entity}" ${question} "Report"`,
];

const TIER0_SYNONYM_TEMPLATE =
  (synonym, question) => `"${synonym}" ${question} filetype:pdf OR site:.gov.au`;

function generateQueries(tier, entity, coreTask, question) {
  const queries = [];
  const subjects = [entity.name, ...(entity.synonyms || [])];

  subjects.forEach(subject => {
    const base = `"${subject}" ${coreTask} ${question}`;
    if (tier === 1) {
      queries.push(`${base} AND ("official" OR "data")`);
    } else if (tier === 2) {
      MATRIX_AXES.DOMAINS.forEach(domain => queries.push(`${base} ${domain}`));
    } else if (tier === 3) {
      MATRIX_AXES.FILETYPES.forEach(ft => queries.push(`${base} ${ft}`));
    } else if (tier === 4) {
      MATRIX_AXES.DOMAINS.forEach(dom => {
        MATRIX_AXES.INFO_TYPES.slice(0, 2).forEach(it => queries.push(`${base} ${dom} ${it}`));
      });
    }
  });
  return [...new Set(queries)];
}

async function researchSubQuestion(entity, question, coreTask, uniqueSources, onProgress) {
  let sourcesCount = 0;
  let authorityHits = 0;
  let accumulatedKnowledge = "";

  // --- TIER 0: Authority-first searches scoped to this sub-question ---
  onProgress(`Tier 0 (Authority): ${entity.name} — ${question.slice(0, 50)}…`);
  systemLog.info(`  [Tier 0 – ${TIER_NAMES[0]}] Authority searches for: "${question}"`);

  const firstSynonym = entity.synonyms?.[0];
  const tier0Queries = [
    ...TIER0_ENTITY_TEMPLATES.map(t => t(entity.name, question)),
    ...(firstSynonym ? [TIER0_SYNONYM_TEMPLATE(firstSynonym, question)] : []),
  ];

  for (const query of tier0Queries) {
    if (sourcesCount >= MAX_SOURCES_PER_QUESTION) break;
    systemLog.info(`  [Tier 0 – ${TIER_NAMES[0]}] Search: ${query}`);

    try {
      const results = await searchTavily(query);
      systemLog.info(`    → ${results.length} results returned`);

      for (const result of results.slice(0, 2)) {
        if (uniqueSources.has(result.url)) continue;
        const { content, evaluation } = await extractData(result.url, question, sourcesCount);

        if (content && (evaluation.sufficient || evaluation.score >= 6)) {
          authorityHits++;
          sourcesCount++;
          uniqueSources.set(result.url, { title: result.title, url: result.url, isAuthority: true });
          accumulatedKnowledge += `\n\n${content}`;
          systemLog.info(`    ✅ Authority hit [${authorityHits}]: ${(result.title || '').slice(0, 70)}`);
        }
      }
    } catch (e) {
      systemLog.error(`Tier 0 error`, e.message);
    }
  }

  // --- Decision: was Tier 0 sufficient? ---
  if (authorityHits >= MIN_AUTHORITY_HITS_PER_QUESTION) {
    systemLog.info(`    ✅ Sufficient authority coverage (${authorityHits} hits) — skipping Tiers 1–4`);
    return { knowledge: accumulatedKnowledge, hasAuthority: true };
  }

  systemLog.info(`    ⚠️ Only ${authorityHits} authority hit(s) — activating Tiers 1–4`);

  // --- TIERS 1–4: Fallback for this sub-question ---
  for (let tier = 1; tier <= 4; tier++) {
    if (sourcesCount >= MAX_SOURCES_PER_QUESTION) break;
    onProgress(`Tier ${tier} Search: ${entity.name} (${sourcesCount} sources)`);

    const queries = generateQueries(tier, entity, coreTask, question);
    for (const query of queries) {
      if (sourcesCount >= MAX_SOURCES_PER_QUESTION) break;
      systemLog.info(`  [Tier ${tier} – ${TIER_NAMES[tier] || 'Custom'}] Search: ${query}`);

      try {
        const results = await searchTavily(query);
        systemLog.info(`    → ${results.length} results returned`);

        for (const result of results.slice(0, 2)) {
          if (uniqueSources.has(result.url)) continue;
          const { content } = await extractData(result.url, question, sourcesCount);
          if (content) {
            accumulatedKnowledge += `\n\n${content}`;
            uniqueSources.set(result.url, { title: result.title, url: result.url, isAuthority: false });
            sourcesCount++;
          }
        }
      } catch (e) {
        systemLog.error(`Tier ${tier} error`, e.message);
      }
    }
  }

  return { knowledge: accumulatedKnowledge, hasAuthority: authorityHits > 0 };
}

export async function executePlan(plan, onProgress) {
  systemLog.info("PART 2: Authority-First Matrix Executor");
  const localDatabase = [];
  const uniqueSources = new Map();

  for (const entity of plan.entities) {
    systemLog.info(`Processing entity: ${entity.name}`);

    const sqGroup = plan.sub_questions.find(sq => sq.entity === entity.name);
    if (!sqGroup || !sqGroup.questions.length) {
      systemLog.warn(`No sub-questions found for entity: ${entity.name} — skipping`);
      continue;
    }

    for (const question of sqGroup.questions) {
      systemLog.info(`  Sub-question: ${question}`);

      const { knowledge, hasAuthority } = await researchSubQuestion(
        entity, question, plan.core_task, uniqueSources, onProgress
      );

      if (knowledge) {
        localDatabase.push({
          entity: entity.name,
          question,
          answer: knowledge,
          isAuthority: hasAuthority,
          timestamp: new Date().toISOString()
        });
      } else {
        systemLog.warn(`  No content gathered for: "${question}"`);
      }
    }

    PersistenceService.save(localDatabase);
    systemLog.info(`Entity complete: ${entity.name} (${localDatabase.filter(d => d.entity === entity.name).length} entries in database)`);
  }

  return { database: localDatabase, sources: Array.from(uniqueSources.values()) };
}
