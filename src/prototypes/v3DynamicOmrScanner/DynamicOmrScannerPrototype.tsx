import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Camera,
  CheckCircle2,
  Clock3,
  FileImage,
  Focus,
  Image as ImageIcon,
  RotateCcw,
  ScanLine,
  SunMedium,
  X,
} from 'lucide-react-native';

import {
  captureDynamicOmrSheet,
  chooseDynamicOmrImage,
  type DynamicDetectionStatus,
  type DynamicOmrScanResult,
} from '../../native/dynamicOmrScanner';

interface DynamicOmrScannerPrototypeProps {
  visible: boolean;
  onClose: () => void;
}

const statusLabel = (status: DynamicDetectionStatus): string => {
  if (status === 'multiple_marks') return 'Multiple marks';
  if (status === 'uncertain') return 'Uncertain';
  if (status === 'blank') return 'Blank';
  return 'Detected';
};

const statusColor = (status: DynamicDetectionStatus): string => {
  if (status === 'detected') return '#16863A';
  if (status === 'blank') return '#64748B';
  if (status === 'multiple_marks') return '#C2413B';
  return '#B45309';
};

const seconds = (milliseconds: number): string =>
  `${(milliseconds / 1000).toFixed(1)}s`;

export const DynamicOmrScannerPrototype = ({
  visible,
  onClose,
}: DynamicOmrScannerPrototypeProps): React.JSX.Element => {
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<DynamicOmrScanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanElapsedSeconds, setScanElapsedSeconds] = useState(0);
  const [evidenceView, setEvidenceView] = useState<'enhanced' | 'original'>('enhanced');

  useEffect(() => {
    if (!isScanning) return undefined;
    const startedAt = Date.now();
    setScanElapsedSeconds(0);
    const timer = setInterval(() => {
      setScanElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => clearInterval(timer);
  }, [isScanning]);

  const runScan = async (source: 'camera' | 'gallery') => {
    setIsScanning(true);
    setErrorMessage(null);
    try {
      const scan = source === 'camera'
        ? await captureDynamicOmrSheet()
        : await chooseDynamicOmrImage();
      setResult(scan);
      setEvidenceView('enhanced');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsScanning(false);
    }
  };

  const close = () => {
    if (isScanning) return;
    setResult(null);
    setErrorMessage(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={close}
            disabled={isScanning}
            accessibilityLabel="Close dynamic scanner"
          >
            <X size={22} color="#17261B" strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Dynamic Scanner Test</Text>
            <Text style={styles.subtitle}>Local prototype</Text>
          </View>
          <View style={styles.headerIcon}>
            <ScanLine size={22} color="#20B94B" strokeWidth={2.5} />
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.prototypeBand}>
            <FileImage size={18} color="#256B3A" strokeWidth={2.3} />
            <View style={styles.prototypeCopy}>
              <Text style={styles.prototypeTitle}>A4, Letter, and Legal</Text>
              <Text style={styles.prototypeText}>No grades, database writes, or uploads.</Text>
            </View>
          </View>

          {!result ? (
            <View style={styles.captureArea}>
              <View style={styles.captureIcon}>
                <ScanLine size={38} color="#20B94B" strokeWidth={2.2} />
              </View>
              <Text style={styles.captureTitle}>Scan one answer-sheet page</Text>
              <Text style={styles.captureMeta}>Template and page are read from the QR.</Text>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => runScan('camera')}
                disabled={isScanning}
                activeOpacity={0.88}
              >
                {isScanning ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Camera size={19} color="#FFFFFF" strokeWidth={2.6} />
                )}
                <Text style={styles.primaryButtonText}>
                  {isScanning ? `Analyzing ${scanElapsedSeconds}s` : 'Open Camera'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.outlineButton}
                onPress={() => runScan('gallery')}
                disabled={isScanning}
                activeOpacity={0.88}
              >
                <ImageIcon size={19} color="#174F2A" strokeWidth={2.4} />
                <Text style={styles.outlineButtonText}>Choose Photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.resultHeader}>
                <View style={styles.successIcon}>
                  <CheckCircle2 size={22} color="#16863A" strokeWidth={2.4} />
                </View>
                <View style={styles.resultHeaderCopy}>
                  <Text style={styles.resultTitle}>Page recognized</Text>
                  <Text style={styles.resultMeta}>
                    {result.paperSize.replaceAll('_', ' ')} | Page {result.identity.pageNumber} of {result.identity.totalPages}
                  </Text>
                </View>
              </View>

              <View style={styles.identityRows}>
                <View style={styles.identityRow}>
                  <Text style={styles.identityLabel}>Template</Text>
                  <Text style={styles.identityValue}>{result.identity.templateCode}</Text>
                </View>
                <View style={styles.identityRow}>
                  <Text style={styles.identityLabel}>Alignment</Text>
                  <Text style={styles.identityValue}>{result.alignmentMethod}</Text>
                </View>
                <View style={styles.identityRow}>
                  <Text style={styles.identityLabel}>Markers</Text>
                  <Text style={styles.identityValue}>{result.markerChecks.length}/4 valid</Text>
                </View>
                <View style={styles.identityRow}>
                  <Text style={styles.identityLabel}>Processing</Text>
                  <Text style={styles.identityValue}>
                    {seconds(result.timings.totalMs)} total | QR {seconds(result.timings.qrDecodeMs)}
                  </Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Scan diagnostics</Text>
              <View style={styles.diagnosticList}>
                <View style={styles.diagnosticRow}>
                  <Focus size={17} color="#256B3A" strokeWidth={2.3} />
                  <Text style={styles.diagnosticLabel}>Sharpness</Text>
                  <Text style={styles.diagnosticValue}>
                    {result.quality.focusScore >= 70 ? 'Good' : 'Low'} ({result.quality.focusScore.toFixed(0)})
                  </Text>
                </View>
                <View style={styles.diagnosticRow}>
                  <SunMedium size={17} color="#256B3A" strokeWidth={2.3} />
                  <Text style={styles.diagnosticLabel}>Lighting</Text>
                  <Text style={styles.diagnosticValue}>
                    {result.quality.illuminationRange <= 85 ? 'Balanced' : 'Uneven'}
                  </Text>
                </View>
                <View style={styles.diagnosticRow}>
                  <ScanLine size={17} color="#256B3A" strokeWidth={2.3} />
                  <Text style={styles.diagnosticLabel}>Page angle</Text>
                  <Text style={styles.diagnosticValue}>
                    {result.quality.perspectiveSkewPercent.toFixed(1)}% skew
                  </Text>
                </View>
                <View style={styles.diagnosticRow}>
                  <Clock3 size={17} color="#256B3A" strokeWidth={2.3} />
                  <Text style={styles.diagnosticLabel}>Analysis</Text>
                  <Text style={styles.diagnosticValue}>{seconds(result.timings.analysisMs)}</Text>
                </View>
              </View>
              {result.quality.warnings.length > 0 ? (
                <View style={styles.warningBand}>
                  {result.quality.warnings.map(warning => (
                    <Text style={styles.warningText} key={warning}>{warning}</Text>
                  ))}
                </View>
              ) : (
                <Text style={styles.qualityPassed}>Capture quality checks passed.</Text>
              )}

              <Text style={styles.sectionTitle}>Review overlay</Text>
              <View style={styles.previewFrame}>
                <Image
                  source={{uri: result.annotatedImageUri}}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
              </View>

              <Text style={styles.sectionTitle}>Objective detections</Text>
              {result.objectiveDetections.length === 0 ? (
                <Text style={styles.emptyText}>No objective regions on this page.</Text>
              ) : (
                <View style={styles.detectionList}>
                  {result.objectiveDetections.map(detection => (
                    <View style={styles.detectionRow} key={detection.regionUuid}>
                      <View style={styles.itemNumber}>
                        <Text style={styles.itemNumberText}>{detection.itemNumber}</Text>
                      </View>
                      <View style={styles.detectionCopy}>
                        <Text style={styles.detectionType}>
                          {detection.questionType === 'true_false' ? 'True / False' : 'Multiple Choice'}
                        </Text>
                        <Text
                          style={[
                            styles.detectionStatus,
                            {color: statusColor(detection.detectionStatus)},
                          ]}
                        >
                          {statusLabel(detection.detectionStatus)}
                        </Text>
                      </View>
                      <Text style={styles.detectedAnswer}>{detection.detectedLabel ?? '-'}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.evidenceSectionHeader}>
                <View style={styles.evidenceSectionCopy}>
                  <Text style={[styles.sectionTitle, styles.evidenceSectionTitle]}>Written-response crops</Text>
                  <Text style={styles.sectionMeta}>Captured for teacher review, not handwriting recognition.</Text>
                </View>
                <View style={styles.segmentedControl}>
                  {(['enhanced', 'original'] as const).map(mode => (
                    <TouchableOpacity
                      key={mode}
                      style={[
                        styles.segmentButton,
                        evidenceView === mode && styles.segmentButtonActive,
                      ]}
                      onPress={() => setEvidenceView(mode)}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          evidenceView === mode && styles.segmentTextActive,
                        ]}
                      >
                        {mode === 'enhanced' ? 'Enhanced' : 'Original'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {result.writtenEvidence.length === 0 ? (
                <Text style={styles.emptyText}>No written-response regions on this page.</Text>
              ) : (
                result.writtenEvidence.map(evidence => (
                  <View style={styles.evidenceBlock} key={evidence.regionUuid}>
                    <View style={styles.evidenceHeading}>
                      <Text style={styles.evidenceTitle}>Item {evidence.itemNumber}</Text>
                      <Text style={styles.evidenceType}>
                        {evidence.questionType.replaceAll('_', ' ')}
                      </Text>
                    </View>
                    <Image
                      source={{
                        uri: evidenceView === 'enhanced'
                          ? evidence.enhancedImageUri
                          : evidence.evidenceImageUri,
                      }}
                      style={styles.evidenceImage}
                      resizeMode="contain"
                    />
                  </View>
                ))
              )}

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => runScan('camera')}
                disabled={isScanning}
                activeOpacity={0.88}
              >
                {isScanning ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <RotateCcw size={18} color="#FFFFFF" strokeWidth={2.5} />
                )}
                <Text style={styles.primaryButtonText}>
                  {isScanning ? `Analyzing ${scanElapsedSeconds}s` : 'Scan Another Page'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.outlineButton}
                onPress={() => runScan('gallery')}
                disabled={isScanning}
                activeOpacity={0.88}
              >
                <ImageIcon size={19} color="#174F2A" strokeWidth={2.4} />
                <Text style={styles.outlineButtonText}>Choose Another Photo</Text>
              </TouchableOpacity>
            </>
          )}

          {errorMessage ? (
            <View style={styles.errorBand}>
              <Text style={styles.errorTitle}>Scan failed</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: '#F5F6FA'},
  header: {
    minHeight: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  iconButton: {width: 40, height: 40, alignItems: 'center', justifyContent: 'center'},
  headerCopy: {flex: 1, paddingHorizontal: 8},
  title: {fontSize: 17, fontWeight: '900', color: '#17261B'},
  subtitle: {fontSize: 11, fontWeight: '700', color: '#718096', marginTop: 2},
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#EAF9EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {flex: 1},
  content: {padding: 18, paddingBottom: 36},
  prototypeBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#CDE7D4',
    borderRadius: 8,
    backgroundColor: '#F4FBF6',
  },
  prototypeCopy: {flex: 1},
  prototypeTitle: {fontSize: 13, fontWeight: '900', color: '#174F2A'},
  prototypeText: {fontSize: 11, lineHeight: 16, fontWeight: '600', color: '#607568', marginTop: 2},
  captureArea: {paddingVertical: 42, alignItems: 'center'},
  captureIcon: {
    width: 68,
    height: 68,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF9EF',
  },
  captureTitle: {marginTop: 18, fontSize: 18, fontWeight: '900', color: '#17261B'},
  captureMeta: {marginTop: 6, marginBottom: 24, fontSize: 12, color: '#64748B', fontWeight: '600'},
  primaryButton: {
    width: '100%',
    minHeight: 48,
    marginTop: 12,
    borderRadius: 8,
    backgroundColor: '#26B947',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  primaryButtonText: {fontSize: 13, fontWeight: '900', color: '#FFFFFF'},
  outlineButton: {
    width: '100%',
    minHeight: 48,
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#B8D8C1',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  outlineButtonText: {fontSize: 13, fontWeight: '900', color: '#174F2A'},
  resultHeader: {flexDirection: 'row', alignItems: 'center', marginTop: 20},
  successIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#EAF9EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultHeaderCopy: {flex: 1, paddingLeft: 12},
  resultTitle: {fontSize: 16, fontWeight: '900', color: '#17261B'},
  resultMeta: {fontSize: 12, fontWeight: '700', color: '#64748B', marginTop: 3},
  identityRows: {marginTop: 16, borderTopWidth: 1, borderTopColor: '#E2E8F0'},
  identityRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  identityLabel: {width: 82, fontSize: 11, fontWeight: '800', color: '#64748B'},
  identityValue: {flex: 1, fontSize: 11, fontWeight: '800', color: '#1E293B'},
  sectionTitle: {fontSize: 13, fontWeight: '900', color: '#17261B', marginTop: 22, marginBottom: 9},
  diagnosticList: {borderTopWidth: 1, borderTopColor: '#E2E8F0'},
  diagnosticRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  diagnosticLabel: {flex: 1, fontSize: 11, fontWeight: '800', color: '#475569'},
  diagnosticValue: {fontSize: 11, fontWeight: '900', color: '#17261B', textAlign: 'right'},
  warningBand: {
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderLeftWidth: 3,
    borderLeftColor: '#D97706',
    backgroundColor: '#FFF9ED',
  },
  warningText: {fontSize: 10, lineHeight: 15, fontWeight: '700', color: '#7C4A03'},
  qualityPassed: {marginTop: 9, fontSize: 10, fontWeight: '800', color: '#16863A'},
  previewFrame: {
    width: '100%',
    height: 380,
    borderWidth: 1,
    borderColor: '#D6DCE4',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  previewImage: {width: '100%', height: '100%'},
  detectionList: {borderTopWidth: 1, borderTopColor: '#E2E8F0'},
  detectionRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  itemNumber: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#EDF2F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemNumberText: {fontSize: 12, fontWeight: '900', color: '#174F2A'},
  detectionCopy: {flex: 1, paddingHorizontal: 11},
  detectionType: {fontSize: 12, fontWeight: '800', color: '#27352C'},
  detectionStatus: {fontSize: 11, fontWeight: '800', marginTop: 2},
  detectedAnswer: {minWidth: 32, textAlign: 'center', fontSize: 18, fontWeight: '900', color: '#17261B'},
  emptyText: {fontSize: 12, lineHeight: 18, color: '#64748B', fontWeight: '600'},
  evidenceSectionHeader: {
    marginTop: 22,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  evidenceSectionCopy: {flex: 1},
  evidenceSectionTitle: {marginTop: 0, marginBottom: 2},
  sectionMeta: {fontSize: 10, lineHeight: 14, fontWeight: '600', color: '#64748B'},
  segmentedControl: {
    width: 132,
    height: 32,
    padding: 2,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#C7D5CB',
    borderRadius: 7,
    backgroundColor: '#F4F7F5',
  },
  segmentButton: {flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 5},
  segmentButtonActive: {backgroundColor: '#FFFFFF'},
  segmentText: {fontSize: 9, fontWeight: '800', color: '#64748B'},
  segmentTextActive: {color: '#174F2A'},
  evidenceBlock: {marginBottom: 14},
  evidenceHeading: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7},
  evidenceTitle: {fontSize: 12, fontWeight: '900', color: '#17261B'},
  evidenceType: {fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'capitalize'},
  evidenceImage: {
    width: '100%',
    height: 150,
    borderWidth: 1,
    borderColor: '#D6DCE4',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  errorBand: {
    marginTop: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: '#F1B8B5',
    borderRadius: 8,
    backgroundColor: '#FFF6F5',
  },
  errorTitle: {fontSize: 12, fontWeight: '900', color: '#A72D28'},
  errorText: {fontSize: 11, lineHeight: 17, fontWeight: '600', color: '#7F1D1D', marginTop: 3},
});
