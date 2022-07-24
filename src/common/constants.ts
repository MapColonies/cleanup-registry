import { TriggerOptions } from './interfaces';

// the default timeout in ms for the whole cleanup process to complete, when passed new function completion attempts will cease
export const DEFAULT_OVERALL_TIMEOUT = 10000;

// the default timeout in ms for a single registered function to complete a single attempt
export const DEFAULT_FUNCTION_TIMEOUT = 1000;

// the default timeout duration in ms to wait after a single function attempt has failed, when time is passed a new attempt will be made
export const DEFAULT_TIMEOUT_AFTER_FAILURE = 500;

// the default options for the cleanup trigger, ignoring pre/post errors
export const DEFAULT_TRIGGER_OPTIONS: TriggerOptions = { ignorePreError: true, ignorePostError: true };
