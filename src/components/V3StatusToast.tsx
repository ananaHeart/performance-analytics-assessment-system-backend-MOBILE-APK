import React from 'react';

import {Toast} from './ui/Toast';

/**
 * The scan screens' pop-up: one notice or one error at a time, shown over the
 * top of the screen (errors used to appear under the student list, where they
 * were easy to miss while waiting). Built on the shared Toast:
 * - A notice (message) fades out on its own a few seconds after the work it
 *   describes has finished.
 * - An error stays until the teacher taps Try again (when there is something
 *   to retry) or Dismiss.
 */
export const V3StatusToast = ({
  message,
  error,
  busy,
  onRetry,
  onDismissMessage,
  onDismissError,
}: {
  message: string | null;
  error: string | null;
  busy: boolean;
  onRetry: (() => void) | null;
  onDismissMessage: () => void;
  onDismissError: () => void;
}): React.JSX.Element | null => {
  const isError = error !== null;
  return (
    <Toast
      variant={isError ? 'error' : 'notice'}
      message={error ?? message}
      busy={busy}
      onRetry={isError ? onRetry : null}
      onDismiss={isError ? onDismissError : onDismissMessage}
    />
  );
};
