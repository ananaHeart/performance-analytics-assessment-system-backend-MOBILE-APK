import React, { useEffect } from 'react';
import { Alert, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { DialogProvider, useDialog, type DialogApi } from '../src/components/ui';
import { V3LoginFlow } from '../src/components/V3LoginFlow';
import { V3AccountNotAllowedError } from '../src/services/v3/authClient';
import type { V3DiagnosticsConnectionAdapter } from '../src/services/v3/diagnosticsConnection';

jest.mock('../src/services/v3/diagnosticsConnection', () => ({
  defaultV3DiagnosticsConnection: {},
  getDefaultV3BaseUrl: () => 'http://127.0.0.1:8080',
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

type Renderer = ReactTestRenderer.ReactTestRenderer;

const texts = (renderer: Renderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
// The outermost pressable whose label is `label`.
const pressButton = async (renderer: Renderer, label: string) => {
  const button = renderer.root.findAll(
    node => node.props.accessibilityRole === 'button'
      && typeof node.props.onPress === 'function'
      && node.findAllByType(Text).some(text => text.props.children === label),
    { deep: false },
  ).at(-1)!;
  await ReactTestRenderer.act(async () => { button.props.onPress(); });
};

describe('Marka dialogs', () => {
  let renderer: Renderer;
  let api: DialogApi;
  const Grab = () => {
    const dialog = useDialog();
    useEffect(() => { api = dialog; }, [dialog]);
    return null;
  };

  beforeEach(async () => {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<DialogProvider><Grab /></DialogProvider>);
    });
  });
  afterEach(async () => {
    await ReactTestRenderer.act(async () => { renderer.unmount(); });
  });

  test('a confirm dialog keeps its exact words and runs the chosen action', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await ReactTestRenderer.act(async () => {
      api.confirm({
        title: 'Discard this scan?',
        message: 'This scan has not been saved yet. Leaving now discards it and you will need to rescan.',
        cancelLabel: 'Keep Reviewing',
        confirmLabel: 'Discard',
        destructive: true,
        onConfirm,
        onCancel,
      });
    });
    expect(texts(renderer)).toEqual([
      'Discard this scan?',
      'This scan has not been saved yet. Leaving now discards it and you will need to rescan.',
      'Keep Reviewing',
      'Discard',
    ]);

    await pressButton(renderer, 'Discard');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(texts(renderer)).toEqual([]);
  });

  test('dialogs asked for together are shown one after another', async () => {
    const onClose = jest.fn();
    await ReactTestRenderer.act(async () => {
      api.info({ title: 'Sync Status', message: 'V3 download complete.' });
      api.confirm({ title: 'Log out?', message: 'Your saved results stay on this phone.', confirmLabel: 'Log out', onCancel: onClose });
    });
    expect(texts(renderer)).toEqual(['Sync Status', 'V3 download complete.', 'OK']);

    await pressButton(renderer, 'OK');
    expect(texts(renderer)).toEqual(['Log out?', 'Your saved results stay on this phone.', 'Cancel', 'Log out']);

    await pressButton(renderer, 'Cancel');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(texts(renderer)).toEqual([]);
  });
});

describe('the principal pop-up inside the app', () => {
  test('shows "Teacher accounts only" as a Marka dialog, not a system alert', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onAccountRejected = jest.fn();
    const adapter = {
      login: jest.fn().mockRejectedValue(new V3AccountNotAllowedError('not_teacher')),
      verifyMfa: jest.fn(), refresh: jest.fn(), restore: jest.fn(),
      clearSession: jest.fn(), logout: jest.fn(),
    } as unknown as V3DiagnosticsConnectionAdapter;

    let renderer!: Renderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DialogProvider>
          <V3LoginFlow request={{ email: 'principal@example.com', password: 'secret' }}
            connectionAdapter={adapter} onAuthenticated={jest.fn()} onClose={jest.fn()}
            onAccountRejected={onAccountRejected} />
        </DialogProvider>,
      );
    });

    expect(alert).not.toHaveBeenCalled();
    expect(onAccountRejected).toHaveBeenCalledTimes(1);
    expect(texts(renderer)).toEqual(expect.arrayContaining([
      'Teacher accounts only',
      'This mobile app is for teachers. Please log in to Marka on a computer to use your principal account.',
      'OK',
    ]));

    await ReactTestRenderer.act(async () => { renderer.unmount(); });
    alert.mockRestore();
  });
});
