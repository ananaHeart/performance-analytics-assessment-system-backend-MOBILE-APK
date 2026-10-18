import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { V3StatusToast } from '../src/components/V3StatusToast';

const texts = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const buttons = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAll(
    node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    { deep: false },
  );

// The first render loads the shared UI components and icon set, which can
// take longer than Jest's 5 s default when the whole suite runs in parallel.
jest.setTimeout(20000);

describe('V3StatusToast', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('a notice fades out on its own once the work is done', async () => {
    const onDismissMessage = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <V3StatusToast message="Scan cancelled." error={null} busy={false} onRetry={null}
          onDismissMessage={onDismissMessage} onDismissError={jest.fn()} />,
      );
    });
    expect(texts(renderer)).toEqual(['Scan cancelled.']);

    await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(5000); });
    expect(onDismissMessage).toHaveBeenCalledTimes(1);
  });

  test('a notice stays while the work it describes is still running', async () => {
    const onDismissMessage = jest.fn();
    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(
        <V3StatusToast message="Sending to the web..." error={null} busy onRetry={null}
          onDismissMessage={onDismissMessage} onDismissError={jest.fn()} />,
      );
    });
    await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(10000); });
    expect(onDismissMessage).not.toHaveBeenCalled();
  });

  test('an error stays and offers Try again and Dismiss', async () => {
    const onRetry = jest.fn();
    const onDismissError = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <V3StatusToast message={null} error="Unable to send the result." busy={false} onRetry={onRetry}
          onDismissMessage={jest.fn()} onDismissError={onDismissError} />,
      );
    });
    await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(10000); });
    expect(texts(renderer)).toEqual(['Unable to send the result.', 'Try again', 'Dismiss']);

    const [retryButton, dismissButton] = buttons(renderer);
    retryButton.props.onPress();
    dismissButton.props.onPress();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDismissError).toHaveBeenCalledTimes(1);
  });
});
