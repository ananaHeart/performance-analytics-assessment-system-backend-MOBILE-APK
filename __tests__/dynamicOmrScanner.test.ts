const mockCaptureDynamicAndDetect = jest.fn();
const mockChooseDynamicAndDetect = jest.fn();

import {NativeModules, Platform} from 'react-native';

import {
  captureDynamicOmrSheet,
  chooseDynamicOmrImage,
} from '../src/native/dynamicOmrScanner';

describe('dynamic OMR native bridge', () => {
  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', {value: 'android'});
    Object.defineProperty(NativeModules, 'OmrScanner', {
      configurable: true,
      value: {
        captureDynamicAndDetect: mockCaptureDynamicAndDetect,
        chooseDynamicAndDetect: mockChooseDynamicAndDetect,
      },
    });
  });

  beforeEach(() => {
    mockCaptureDynamicAndDetect.mockReset();
    mockChooseDynamicAndDetect.mockReset();
  });

  test('starts an offline camera scan without requiring backend identity', async () => {
    const result = {paperSize: 'A4', identity: {pageNumber: 1}};
    mockCaptureDynamicAndDetect.mockResolvedValue(result);

    await expect(captureDynamicOmrSheet()).resolves.toBe(result);
    expect(mockCaptureDynamicAndDetect).toHaveBeenCalledWith({});
  });

  test('passes optional selected identities to the gallery scanner', async () => {
    const options = {
      expectedAnswerSheetUuid: '56d628da-d7fc-4faa-b018-3f740e048bf0',
      expectedAssignmentUuid: '26b14ea2-4383-43f5-bb40-f60683ee46bb',
    };
    mockChooseDynamicAndDetect.mockResolvedValue({paperSize: 'US_LETTER'});

    await chooseDynamicOmrImage(options);

    expect(mockChooseDynamicAndDetect).toHaveBeenCalledWith(options);
  });

  test('passes a fetched manifest through to the camera scanner unchanged', async () => {
    const options = {
      expectedAnswerSheetUuid: '56d628da-d7fc-4faa-b018-3f740e048bf0',
      expectedAssignmentUuid: '26b14ea2-4383-43f5-bb40-f60683ee46bb',
      manifestJson: '{"contractVersion":"3.0"}',
    };
    mockCaptureDynamicAndDetect.mockResolvedValue({paperSize: 'A4'});

    await captureDynamicOmrSheet(options);

    expect(mockCaptureDynamicAndDetect).toHaveBeenCalledWith(options);
  });
});
