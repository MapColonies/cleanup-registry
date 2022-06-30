import { TriggerOptions } from './interfaces';

export const DEFAULT_OVERALL_TIMEOUT = 10000;
export const DEFAULT_FUNCTION_TIMEOUT = 1000;
export const DAFAULT_TIMEOUT_AFTER_FAILURE = 500;
export const DEFAULT_TRIGGER_OPTIONS: TriggerOptions = { shouldThrowIfPreErrors: false, shouldThrowIfPostErrors: false };
