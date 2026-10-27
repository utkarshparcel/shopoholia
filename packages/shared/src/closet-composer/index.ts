/** The Closet week composer (§8): pure, seeded, and validated at every entry point. */

export { composeWeek } from "./week.js";
export type { WeekComposition } from "./week.js";
export { composeBackups } from "./backups.js";
export { restyle } from "./restyle.js";
export { applySwap } from "./edits.js";
export type { SwapRejection, SwapResult } from "./edits.js";
export type { Warning } from "./looks.js";
export { COMPOSER_VERSION } from "./outfit.js";
export {
  ComposeBackupsInputSchema,
  ComposerItemSchema,
  ComposerMetricSchema,
  ComposerSeedSchema,
  ComposerSettingsSchema,
  ComposeWeekInputSchema,
  CurrentDaySchema,
  MAX_CLOSET_ITEMS,
  RestyleInputSchema,
  SwapInputSchema,
} from "./input.js";
export type {
  ComposeBackupsInput,
  ComposerError,
  ComposerErrorCode,
  ComposerIssue,
  ComposerItem,
  ComposerItemInput,
  ComposerMetric,
  ComposerResult,
  ComposerSettings,
  ComposeWeekInput,
  CurrentDay,
  RestyleInput,
  SwapInput,
} from "./input.js";
