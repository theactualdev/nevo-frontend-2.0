/** Barrel for shared domain types (FE Architecture §1, /lib/types). */
export type {
  TextContent,
  VisualContent,
  AudioContent,
  InteractiveContent,
  QuickCheck,
  CalculationVariant,
  CalcCardStep,
  CalcNumericStep,
  CalculationStep,
  CalculationSegment,
  LessonSegment,
  AssessmentQuestion,
  Assessment,
  CompletionSummary,
  LessonModule,
  Lesson,
  SegmentAdaptation,
  AdaptationPlan,
  DensityLevel,
  GuidedPrompt,
} from "./lesson";
export { isCardStep, isNumericStep, isTextStep } from "./lesson";
