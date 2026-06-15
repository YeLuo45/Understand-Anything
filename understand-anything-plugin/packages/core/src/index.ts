export * from "./types.js";
export * from "./persistence/index.js";
export {
  KnowledgeGraphSchema,
  validateGraph,
  sanitizeGraph,
  autoFixGraph,
  COMPLEXITY_ALIASES,
  DIRECTION_ALIASES,
  type ValidationResult,
  type GraphIssue,
} from "./schema.js";
export { TreeSitterPlugin } from "./plugins/tree-sitter-plugin.js";
export type { LanguageExtractor } from "./plugins/extractors/types.js";
export { builtinExtractors } from "./plugins/extractors/index.js";
export { GraphBuilder } from "./analyzer/graph-builder.js";
export {
  buildFileAnalysisPrompt,
  buildProjectSummaryPrompt,
  parseFileAnalysisResponse,
  parseProjectSummaryResponse,
} from "./analyzer/llm-analyzer.js";
export type { LLMFileAnalysis, LLMProjectSummary } from "./analyzer/llm-analyzer.js";
export {
  normalizeNodeId,
  normalizeComplexity,
  normalizeBatchOutput,
  type DroppedEdge,
  type NormalizationStats,
  type NormalizeBatchResult,
} from "./analyzer/normalize-graph.js";
export { SearchEngine, type SearchResult, type SearchOptions } from "./search.js";
export {
  getChangedFiles,
  isStale,
  mergeGraphUpdate,
  type StalenessResult,
} from "./staleness.js";
export {
  detectLayers,
  buildLayerDetectionPrompt,
  parseLayerDetectionResponse,
  applyLLMLayers,
} from "./analyzer/layer-detector.js";
export type { LLMLayerResponse } from "./analyzer/layer-detector.js";
export {
  buildTourGenerationPrompt,
  parseTourGenerationResponse,
  generateHeuristicTour,
} from "./analyzer/tour-generator.js";
export {
  buildLanguageLessonPrompt,
  parseLanguageLessonResponse,
  detectLanguageConcepts,
  type LanguageLessonResult,
} from "./analyzer/language-lesson.js";
export { PluginRegistry } from "./plugins/registry.js";
export {
  LanguageRegistry,
  FrameworkRegistry,
  builtinLanguageConfigs,
  builtinFrameworkConfigs,
  LanguageConfigSchema,
  FrameworkConfigSchema,
} from "./languages/index.js";
export type {
  LanguageConfig,
  FrameworkConfig,
  TreeSitterConfig,
  FilePatternConfig,
} from "./languages/index.js";
export {
  parsePluginConfig,
  serializePluginConfig,
  DEFAULT_PLUGIN_CONFIG,
  type PluginConfig,
  type PluginEntry,
} from "./plugins/discovery.js";
export {
  SemanticSearchEngine,
  cosineSimilarity,
  type SemanticSearchOptions,
} from "./embedding-search.js";
export {
  extractFileFingerprint,
  compareFingerprints,
  analyzeChanges,
  buildFingerprintStore,
  contentHash,
  type FunctionFingerprint,
  type ClassFingerprint,
  type ImportFingerprint,
  type FileFingerprint,
  type FingerprintStore,
  type ChangeLevel,
  type FileChangeResult,
  type ChangeAnalysis,
} from "./fingerprint.js";
export {
  classifyUpdate,
  type UpdateDecision,
} from "./change-classifier.js";
// Non-code parsers
export {
  MarkdownParser,
  YAMLConfigParser,
  JSONConfigParser,
  TOMLParser,
  EnvParser,
  DockerfileParser,
  SQLParser,
  GraphQLParser,
  ProtobufParser,
  TerraformParser,
  MakefileParser,
  ShellParser,
  registerAllParsers,
} from "./plugins/parsers/index.js";
export {
  createIgnoreFilter,
  DEFAULT_IGNORE_PATTERNS,
  type IgnoreFilter,
} from "./ignore-filter.js";
export { generateStarterIgnoreFile } from "./ignore-generator.js";

// Architecture Decision Record (ADR) — V1 Direction A "Why" persona
export {
  ADRStatusSchema,
  ADRSourceSchema,
  ADRComplexitySchema,
  ADRAlternativeSchema,
  ADRConsequencesSchema,
  ArchitectureDecisionRecordSchema,
  ADRGraphSchema,
  validateADR,
  validateADRGraph,
} from "./schema.js";

// Decision extraction pipeline (Direction A — V6/V7/V8/V9)
export {
  matchRationaleKeywords,
  parseGitLogOutput,
  scanGitLog,
  type DecisionCandidate,
  type ScanGitLogOptions,
} from "./analyzer/git-decision-scanner.js";
export {
  extractCommentCandidates,
  scanCodeComments,
  type ScanCodeCommentsOptions,
} from "./analyzer/comment-decision-scanner.js";
export {
  candidateToADR,
  extractDecisions,
  type ExtractDecisionsOptions,
} from "./analyzer/decision-extractor.js";
export {
  buildSummarizePrompt,
  parseSummarizeResponse,
  mergeSummarize,
  type LLMSummarizeInput,
  type LLMSummarizeOutput,
} from "./analyzer/llm-decision-summarizer.js";

// LLM client (Direction A R2 — V1/V2/V3/V4)
export {
  LLMError,
  classifyStatus,
  parseRetryAfter,
  chatWithRetry,
  generateStructured,
  sleep,
  type ChatMessage,
  type ChatOptions,
  type ChatCompletion,
  type LLMProvider,
  type LLMErrorKind,
  type RetryOptions,
} from "./llm/llm-client.js";
export { AnthropicProvider, type AnthropicProviderConfig } from "./llm/anthropic-provider.js";
export { OpenAIProvider, type OpenAIProviderConfig } from "./llm/openai-provider.js";
export { OllamaProvider, type OllamaProviderConfig } from "./llm/ollama-provider.js";
export {
  buildWhyStoryPrompt,
  parseWhyStory,
  mergeWhyStory,
  extractWhyStory,
  generateWhyStory,
  WhyStoryCache,
  WhyStorySchema,
  type WhyStory,
} from "./llm/why-story.js";
export {
  scoreStaleness,
  scoreAllStaleness,
  filterStale,
  isStaleScore,
  stalenessBucketFor,
  type StalenessScore,
  type StalenessBucket,
  type FileChangeInfo,
} from "./llm/why-impact.js";
