import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { isV3SessionExpired } from '../src/services/v3/sessionExpiry';
import { SessionReloginSheet } from '../src/components/SessionReloginSheet';
import { V3LoginFlow } from '../src/components/V3LoginFlow';
import { Button, TextField } from '../src/components/ui';

jest.mock('../src/components/V3LoginFlow', () => ({ V3LoginFlow: jest.fn(() => null) }));
jest.setTimeout(20000);

describe('SES-1: expired session before Send', () => {
  test('any V3 client 401 means "sign in again"; other failures do not', () => {
    expect(isV3SessionExpired({ status: 401, code: 'SESSION_IDLE_EXPIRED' })).toBe(true);
    expect(isV3SessionExpired({ status: 401, code: null })).toBe(true);
    expect(isV3SessionExpired({ status: 409, code: 'CAPTURE_NOT_ALLOWED' })).toBe(false);
    expect(isV3SessionExpired(new TypeError('Network request failed'))).toBe(false);
    expect(isV3SessionExpired(null)).toBe(false);
  });

  test('the sign-in prompt keeps the teacher\'s email and hands back the new session', async () => {
    const onRenewed = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SessionReloginSheet visible email="teacher@example.com" onRenewed={onRenewed} onCancel={jest.fn()} />,
      );
    });

    const [emailField, passwordField] = renderer.root.findAllByType(TextField);
    expect(emailField.props.value).toBe('teacher@example.com');
    expect(emailField.props.editable).toBe(false);
    const signIn = () => renderer.root.findAllByType(Button).find(b => b.props.label === 'Sign in and send')!;
    expect(signIn().props.disabled).toBe(true);

    await ReactTestRenderer.act(async () => { passwordField.props.onChangeText('correct-password'); });
    await ReactTestRenderer.act(async () => { signIn().props.onPress(); });

    const loginFlow = jest.mocked(V3LoginFlow).mock.calls.at(-1)![0];
    expect(loginFlow.request).toMatchObject({ email: 'teacher@example.com', password: 'correct-password' });

    const session = { accessToken: 'new-token' } as never;
    const snapshot = {} as never;
    await ReactTestRenderer.act(async () => { loginFlow.onAuthenticated(session, snapshot); });
    expect(onRenewed).toHaveBeenCalledWith(session, snapshot);
  });
});
