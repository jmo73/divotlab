/**
 * Caption generation and regeneration via Claude API.
 * Read CAPTIONS.md before modifying any prompt here.
 *
 * Two-level prompt system:
 *   1. System prompt — brand voice, never changes
 *   2. User prompt  — trigger-specific, injects real data + context summary
 *
 * On Claude API failure: retry once, then return FALLBACK_CAPTIONS.
 * Fallback captions are flagged in the Telegram message.
 */
import { type PostContext } from './enrichment';
import type { TriggerType, EditPlatform } from './types';
export interface GeneratedCaptions {
    captionX: string;
    captionIG: string;
    usedFallback: boolean;
}
/**
 * Generate both platform captions for a trigger.
 * Runs sequentially (not parallel) to stay within API rate limits.
 */
export declare function generateCaptions(triggerType: TriggerType, context: PostContext, data: Record<string, unknown>): Promise<GeneratedCaptions>;
/**
 * Regenerate a single caption given an edit instruction.
 * Used by the Telegram edit flow — never re-fetches data.
 */
export declare function regenerateCaption(params: {
    currentCaption: string;
    rawData: Record<string, unknown>;
    context: PostContext;
    editInstruction: string;
    platform: EditPlatform;
}): Promise<{
    caption: string;
    usedFallback: boolean;
}>;
/**
 * Generate evergreen captions at seed time.
 * Returns JSON with both platform captions.
 */
export declare function generateEvergreenCaptions(params: {
    topic: string;
    triggerType: TriggerType;
    keyInsight: string;
    primaryStat: string;
    supportingContext: string;
}): Promise<{
    captionX: string;
    captionIG: string;
}>;
//# sourceMappingURL=claude.d.ts.map