import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Camera,
  Check,
  CircleAlert,
  Image as ImageIcon,
  RotateCcw,
  ScanLine,
  X,
} from 'lucide-react-native';

import {
  getSavedV2OmrReview,
  resolveV2OmrContext,
  saveVerifiedV2OmrAttempt,
  type SavedV2OmrAttempt,
  type SavedV2OmrReview,
  type V2OmrContext,
  type VerifiedOmrAnswer,
} from '../database/v2/resultRepository';
import {V2_MC_TEMPLATE_VERSION, type AnswerOption} from '../database/v2/contracts';
import {
  captureOmrSheet,
  chooseOmrImage,
  type OmrScanDetection,
  type OmrScanResult,
} from '../native/omrScanner';

type ReviewState = VerifiedOmrAnswer & {reviewed: boolean};
type ScannerMode = 'scan' | 'view';

interface OmrScannerModalProps {
  visible: boolean;
  teacherId: number | null;
  test: {
    test_id: number;
    test_name?: string;
    total_items?: number;
  } | null;
  student: {
    student_id: number;
    first_name?: string;
    last_name?: string;
  } | null;
  classData: {
    grade_level_name?: string;
    section_name?: string;
    subject_name?: string;
  } | null;
  mode?: ScannerMode;
  onClose: () => void;
  onSaved?: (attempt: SavedV2OmrAttempt) => void;
}

const OPTIONS: AnswerOption[] = ['A', 'B', 'C', 'D'];

const statusLabel = (status: OmrScanDetection['detectionStatus']): string => {
  if (status === 'multiple_marks') return 'Multiple marks';
  if (status === 'uncertain') return 'Uncertain';
  if (status === 'blank') return 'Blank';
  return 'Detected';
};

const createInitialReviews = (scan: OmrScanResult): ReviewState[] =>
  scan.detections.map(detection => {
    const isDetected = detection.detectionStatus === 'detected' && detection.detectedOption != null;
    return {
      itemNumber: detection.itemNumber,
      selectedOption: isDetected ? detection.detectedOption : null,
      answerStatus: isDetected
        ? 'answered'
        : detection.detectionStatus === 'multiple_marks'
          ? 'multiple'
          : 'blank',
      verificationStatus: 'confirmed',
      reviewed: isDetected,
    };
  });

export const OmrScannerModal = ({
  visible,
  teacherId,
  test,
  student,
  classData,
  mode = 'scan',
  onClose,
  onSaved,
}: OmrScannerModalProps): React.JSX.Element => {
  const [scanResult, setScanResult] = useState<OmrScanResult | null>(null);
  const [reviews, setReviews] = useState<ReviewState[]>([]);
  const [v2Context, setV2Context] = useState<V2OmrContext | null>(null);
  const [contextMessage, setContextMessage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [savedReview, setSavedReview] = useState<SavedV2OmrReview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !test || !student || teacherId == null) {
      return;
    }

    try {
      const resolution = resolveV2OmrContext(test.test_id, student.student_id, teacherId);
      setV2Context(resolution.context);
      setContextMessage(resolution.reason);
    } catch (error) {
      setV2Context(null);
      setContextMessage(error instanceof Error ? error.message : 'Downloaded assessment data is not available.');
    }
  }, [student, teacherId, test, visible]);

  useEffect(() => {
    if (!visible || mode !== 'view' || !test || !student || teacherId == null) return;

    setIsLoadingSaved(true);
    setErrorMessage(null);
    try {
      const review = getSavedV2OmrReview(test.test_id, student.student_id, teacherId);
      setSavedReview(review);
      if (!review) {
        setErrorMessage('The saved scan and answer record could not be found on this device.');
      }
    } catch (error) {
      setSavedReview(null);
      setErrorMessage(error instanceof Error ? error.message : 'Unable to open the saved scan.');
    } finally {
      setIsLoadingSaved(false);
    }
  }, [mode, student, teacherId, test, visible]);

  useEffect(() => {
    if (!visible) {
      setScanResult(null);
      setReviews([]);
      setErrorMessage(null);
      setIsScanning(false);
      setIsSaving(false);
      setIsLoadingSaved(false);
      setSavedReview(null);
    }
  }, [visible]);

  const studentName = useMemo(
    () => [student?.last_name, student?.first_name].filter(Boolean).join(', ') || 'No student selected',
    [student],
  );
  const classLabel = useMemo(
    () => [classData?.grade_level_name, classData?.section_name].filter(Boolean).join(' - ') || 'Selected class',
    [classData],
  );
  const reviewedCount = reviews.filter(item => item.reviewed).length;
  const allReviewed = Boolean(scanResult && reviews.length === scanResult.itemCount && reviewedCount === reviews.length);

  const runScan = async (source: 'camera' | 'gallery') => {
    if (!test || !student || teacherId == null) {
      setErrorMessage('Select a test and student before scanning.');
      return;
    }
    if (Number(test.total_items ?? 0) !== 10) {
      setErrorMessage('The current phone scanner supports the approved 10-item Multiple Choice sheet only.');
      return;
    }

    setIsScanning(true);
    setErrorMessage(null);
    try {
      const options = {
        expectedTemplateVersion: V2_MC_TEMPLATE_VERSION,
        expectedItemCount: 10,
        expectedTestId: Number(test.test_id),
      };
      const result = source === 'camera'
        ? await captureOmrSheet(options)
        : await chooseOmrImage(options);
      setScanResult(result);
      setReviews(createInitialReviews(result));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsScanning(false);
    }
  };

  const selectAnswer = (
    detection: OmrScanDetection,
    selectedOption: AnswerOption | null,
    answerStatus: VerifiedOmrAnswer['answerStatus'],
  ) => {
    if (detection.detectionStatus === 'detected') return;

    const matchesRawDetection =
      (detection.detectionStatus === 'blank' && answerStatus === 'blank') ||
      (detection.detectionStatus === 'multiple_marks' && answerStatus === 'multiple');

    setReviews(current => current.map(review => review.itemNumber === detection.itemNumber
      ? {
        ...review,
        selectedOption,
        answerStatus,
        verificationStatus: matchesRawDetection ? 'confirmed' : 'corrected',
        reviewed: true,
      }
      : review));
  };

  const finishReview = async () => {
    if (!scanResult || !allReviewed || teacherId == null) return;

    if (!v2Context) {
      setErrorMessage(contextMessage ?? 'Downloaded assessment data is unavailable, so this scan cannot be saved.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const attempt = await saveVerifiedV2OmrAttempt(
        v2Context,
        teacherId,
        scanResult,
        reviews.map(({itemNumber, selectedOption, answerStatus, verificationStatus}) => ({
          itemNumber,
          selectedOption,
          answerStatus,
          verificationStatus,
        })),
      );
      onSaved?.(attempt);
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconButton} onPress={onClose} activeOpacity={0.8}>
            <X size={22} color="#17261B" strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{mode === 'view' ? 'Saved Scan & Answers' : 'Scan Answer Sheet'}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{test?.test_name ?? 'Assessment'}</Text>
          </View>
          <View style={styles.headerIcon}>
            <ScanLine size={22} color="#20B94B" strokeWidth={2.5} />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.contextBand}>
            <Text style={styles.contextStudent}>{studentName}</Text>
            <Text style={styles.contextMeta}>{classLabel}{classData?.subject_name ? `  ·  ${classData.subject_name}` : ''}</Text>
          </View>

          {mode === 'view' ? (
            <>
              {isLoadingSaved ? (
                <View style={styles.savedLoadingState}>
                  <ActivityIndicator color="#20B94B" />
                  <Text style={styles.sectionMeta}>Opening saved result...</Text>
                </View>
              ) : savedReview ? (
                <>
                  <View style={styles.previewHeader}>
                    <View>
                      <Text style={styles.sectionTitle}>Saved Result</Text>
                      <Text style={styles.sectionMeta}>
                        {savedReview.answers.length} answers reviewed
                      </Text>
                    </View>
                    <Text style={styles.savedScore}>
                      {savedReview.provisionalTotalScore} / {savedReview.provisionalMaxScore}
                    </Text>
                  </View>

                  {savedReview.checkedAt ? (
                    <Text style={styles.savedTimestamp}>
                      Saved {new Date(savedReview.checkedAt).toLocaleString()}
                    </Text>
                  ) : null}

                  {savedReview.scan?.imageUri ? (
                    <Image
                      source={{uri: savedReview.scan.imageUri}}
                      style={styles.previewImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.missingImageState}>
                      <ImageIcon size={24} color="#64748B" strokeWidth={2.2} />
                      <Text style={styles.missingImageText}>
                        The saved image is unavailable, but the verified answers remain stored below.
                      </Text>
                    </View>
                  )}

                  <View style={styles.lockedNotice}>
                    <Check size={17} color="#0F7A34" strokeWidth={2.8} />
                    <Text style={styles.lockedNoticeText}>Read-only saved record</Text>
                  </View>

                  <View style={styles.answerList}>
                    {savedReview.answers.map(answer => (
                      <View key={answer.questionId} style={styles.answerRow}>
                        <View style={styles.answerRowHeader}>
                          <Text style={styles.questionNumber}>Q{answer.itemNumber}</Text>
                          <View style={[styles.statusPill, answer.verificationStatus === 'corrected'
                            ? styles.statusUncertain
                            : styles.statusDetected]}>
                            <Text style={styles.statusText}>
                              {answer.verificationStatus === 'corrected' ? 'Reviewed' : 'Detected'}
                            </Text>
                          </View>
                          <Text style={styles.confidenceText}>
                            {Math.round(answer.confidenceScore * 100)}%
                          </Text>
                        </View>
                        <View style={styles.optionRow}>
                          {OPTIONS.map(option => {
                            const selected = answer.answerStatus === 'answered' && answer.selectedOption === option;
                            return (
                              <View
                                key={option}
                                style={[styles.optionButton, selected && styles.optionButtonSelected]}
                              >
                                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option}</Text>
                              </View>
                            );
                          })}
                          <View style={[styles.compactStateButton, answer.answerStatus === 'blank' && styles.blankButtonSelected]}>
                            <Text style={styles.compactStateButtonText}>BLANK</Text>
                          </View>
                          <View style={[styles.compactStateButton, answer.answerStatus === 'multiple' && styles.multipleButtonSelected]}>
                            <Text style={styles.compactStateButtonText}>MULTI</Text>
                          </View>
                          <Check size={18} color="#20B94B" strokeWidth={3} />
                        </View>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
            </>
          ) : !scanResult ? (
            <View style={styles.captureArea}>
              <View style={styles.captureIcon}>
                <ScanLine size={34} color="#20B94B" strokeWidth={2.2} />
              </View>
              <Text style={styles.captureTitle}>10-item Multiple Choice</Text>
              <Text style={styles.templateText}>{V2_MC_TEMPLATE_VERSION}</Text>

              <View style={styles.captureButtons}>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => runScan('camera')}
                  activeOpacity={0.88}
                  disabled={isScanning}
                >
                  {isScanning ? <ActivityIndicator color="#FFFFFF" /> : <Camera size={19} color="#FFFFFF" strokeWidth={2.6} />}
                  <Text style={styles.primaryButtonText}>OPEN CAMERA</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.outlineButton}
                  onPress={() => runScan('gallery')}
                  activeOpacity={0.88}
                  disabled={isScanning}
                >
                  <ImageIcon size={19} color="#174F2A" strokeWidth={2.4} />
                  <Text style={styles.outlineButtonText}>CHOOSE PHOTO</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.previewHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Detected Sheet</Text>
                  <Text style={styles.sectionMeta}>{reviewedCount} of {reviews.length} reviewed</Text>
                </View>
                <TouchableOpacity style={styles.retakeButton} onPress={() => runScan('camera')} activeOpacity={0.8}>
                  <RotateCcw size={16} color="#174F2A" strokeWidth={2.5} />
                  <Text style={styles.retakeText}>Retake</Text>
                </TouchableOpacity>
              </View>

              <Image source={{uri: scanResult.annotatedImageUri}} style={styles.previewImage} resizeMode="contain" />

              <View style={styles.confirmDetectedButton}>
                <Check size={17} color="#0F7A34" strokeWidth={2.8} />
                <Text style={styles.confirmDetectedText}>Detected answers are locked. Review only flagged items.</Text>
              </View>

              <View style={styles.answerList}>
                {scanResult.detections.map(detection => {
                  const review = reviews.find(item => item.itemNumber === detection.itemNumber);
                  const isLocked = detection.detectionStatus === 'detected';
                  const statusTone = detection.detectionStatus === 'detected'
                    ? styles.statusDetected
                    : detection.detectionStatus === 'blank'
                      ? styles.statusBlank
                      : detection.detectionStatus === 'uncertain'
                        ? styles.statusUncertain
                        : styles.statusMultiple;
                  return (
                    <View key={detection.itemNumber} style={styles.answerRow}>
                      <View style={styles.answerRowHeader}>
                        <Text style={styles.questionNumber}>Q{detection.itemNumber}</Text>
                        <View style={[styles.statusPill, statusTone]}>
                          <Text style={styles.statusText}>{statusLabel(detection.detectionStatus)}</Text>
                        </View>
                        <Text style={styles.confidenceText}>{Math.round(detection.confidenceScore * 100)}%</Text>
                      </View>
                      <View style={styles.optionRow}>
                        {OPTIONS.map(option => {
                          const selected = review?.selectedOption === option;
                          return (
                            <TouchableOpacity
                              key={option}
                              style={[styles.optionButton, selected && styles.optionButtonSelected]}
                              onPress={() => selectAnswer(detection, option, 'answered')}
                              activeOpacity={0.82}
                              disabled={isLocked}
                            >
                              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option}</Text>
                            </TouchableOpacity>
                          );
                        })}
                        <TouchableOpacity
                          style={[
                            styles.compactStateButton,
                            review?.reviewed && review.answerStatus === 'blank' && styles.blankButtonSelected,
                          ]}
                          onPress={() => selectAnswer(detection, null, 'blank')}
                          activeOpacity={0.82}
                          disabled={isLocked}
                        >
                          <Text style={styles.compactStateButtonText}>BLANK</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.compactStateButton,
                            review?.reviewed && review.answerStatus === 'multiple' && styles.multipleButtonSelected,
                          ]}
                          onPress={() => selectAnswer(detection, null, 'multiple')}
                          activeOpacity={0.82}
                          disabled={isLocked}
                        >
                          <Text style={styles.compactStateButtonText}>MULTI</Text>
                        </TouchableOpacity>
                        {review?.reviewed ? <Check size={18} color="#20B94B" strokeWidth={3} /> : <CircleAlert size={18} color="#D97706" strokeWidth={2.5} />}
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {contextMessage ? (
            <View style={styles.notice}>
              <CircleAlert size={17} color="#8A5A00" strokeWidth={2.4} />
              <Text style={styles.noticeText}>{contextMessage}</Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <CircleAlert size={18} color="#B42318" strokeWidth={2.5} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}
        </ScrollView>

        {mode === 'view' ? (
          <View style={styles.footer}>
            <TouchableOpacity style={styles.closeSavedButton} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.closeSavedButtonText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        ) : scanResult ? (
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.cancelButtonText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, (!allReviewed || isSaving) && styles.disabledButton]}
              onPress={finishReview}
              activeOpacity={0.88}
              disabled={!allReviewed || isSaving}
            >
              {isSaving ? <ActivityIndicator color="#FFFFFF" /> : <Check size={18} color="#FFFFFF" strokeWidth={2.8} />}
              <Text style={styles.saveButtonText}>{v2Context ? 'SAVE VERIFIED' : 'FINISH REVIEW'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: '#F5F7F8'},
  header: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#DDE4E1',
    backgroundColor: '#FFFFFF',
  },
  iconButton: {width: 42, height: 42, alignItems: 'center', justifyContent: 'center'},
  headerCopy: {flex: 1, minWidth: 0, paddingHorizontal: 8},
  title: {fontSize: 20, fontWeight: '800', color: '#102033'},
  subtitle: {fontSize: 13, color: '#64748B', marginTop: 2},
  headerIcon: {width: 42, alignItems: 'center'},
  content: {padding: 16, paddingBottom: 34},
  contextBand: {paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#DDE4E1'},
  contextStudent: {fontSize: 18, fontWeight: '800', color: '#102033'},
  contextMeta: {fontSize: 14, color: '#526271', marginTop: 4},
  captureArea: {alignItems: 'center', paddingVertical: 54},
  captureIcon: {
    width: 70,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 35,
    backgroundColor: '#EAF9EE',
  },
  captureTitle: {fontSize: 20, fontWeight: '800', color: '#102033', marginTop: 18},
  templateText: {fontSize: 13, color: '#708090', marginTop: 5},
  captureButtons: {width: '100%', gap: 10, marginTop: 28},
  primaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 7,
    backgroundColor: '#2DCE4A',
  },
  primaryButtonText: {fontSize: 15, fontWeight: '800', color: '#FFFFFF'},
  outlineButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#B9C8C0',
    backgroundColor: '#FFFFFF',
  },
  outlineButtonText: {fontSize: 14, fontWeight: '800', color: '#174F2A'},
  previewHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18},
  sectionTitle: {fontSize: 18, fontWeight: '800', color: '#102033'},
  sectionMeta: {fontSize: 13, color: '#64748B', marginTop: 2},
  retakeButton: {height: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10},
  retakeText: {fontSize: 14, fontWeight: '700', color: '#174F2A'},
  previewImage: {
    width: '100%',
    aspectRatio: 0.707,
    marginTop: 12,
    backgroundColor: '#E7EBEE',
    borderWidth: 1,
    borderColor: '#D5DDDA',
    borderRadius: 6,
  },
  savedLoadingState: {alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 54},
  savedScore: {fontSize: 22, fontWeight: '900', color: '#0F7A34'},
  savedTimestamp: {fontSize: 12, color: '#64748B', marginTop: 8},
  missingImageState: {
    minHeight: 130,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 18,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#D5DDDA',
    borderRadius: 6,
    backgroundColor: '#EEF2F4',
  },
  missingImageText: {fontSize: 13, lineHeight: 19, color: '#526271', textAlign: 'center'},
  lockedNotice: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    borderRadius: 6,
    backgroundColor: '#EAF9EE',
  },
  lockedNoticeText: {fontSize: 14, fontWeight: '800', color: '#0F7A34'},
  confirmDetectedButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    borderRadius: 6,
    backgroundColor: '#EAF9EE',
  },
  confirmDetectedText: {fontSize: 14, fontWeight: '800', color: '#0F7A34'},
  answerList: {marginTop: 16, borderTopWidth: 1, borderTopColor: '#DDE4E1'},
  answerRow: {paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#DDE4E1'},
  answerRowHeader: {flexDirection: 'row', alignItems: 'center'},
  questionNumber: {fontSize: 17, fontWeight: '900', color: '#102033', width: 48},
  statusPill: {paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12},
  statusDetected: {backgroundColor: '#E5F8EA'},
  statusBlank: {backgroundColor: '#E9EDF0'},
  statusUncertain: {backgroundColor: '#FFF2D5'},
  statusMultiple: {backgroundColor: '#FFE4E2'},
  statusText: {fontSize: 11, fontWeight: '800', color: '#344054'},
  confidenceText: {marginLeft: 'auto', fontSize: 12, fontWeight: '700', color: '#64748B'},
  optionRow: {flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10},
  optionButton: {
    flex: 1,
    minWidth: 0,
    maxWidth: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#C9D4CE',
    backgroundColor: '#FFFFFF',
  },
  optionButtonSelected: {borderColor: '#2DCE4A', backgroundColor: '#2DCE4A'},
  optionText: {fontSize: 16, fontWeight: '900', color: '#102033'},
  optionTextSelected: {color: '#FFFFFF'},
  compactStateButton: {
    flex: 1.15,
    minWidth: 0,
    maxWidth: 56,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#C9D4CE',
    backgroundColor: '#FFFFFF',
  },
  blankButtonSelected: {borderColor: '#94A3B8', backgroundColor: '#E9EDF0'},
  multipleButtonSelected: {borderColor: '#F4A261', backgroundColor: '#FFF2D5'},
  compactStateButtonText: {fontSize: 9, fontWeight: '800', color: '#526271'},
  notice: {flexDirection: 'row', gap: 9, padding: 12, marginTop: 16, borderRadius: 6, backgroundColor: '#FFF7E6'},
  noticeText: {flex: 1, fontSize: 12, lineHeight: 18, color: '#6B4B12'},
  errorBanner: {flexDirection: 'row', gap: 9, padding: 12, marginTop: 14, borderRadius: 6, backgroundColor: '#FEECEB'},
  errorText: {flex: 1, fontSize: 13, lineHeight: 19, color: '#912018'},
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#DDE4E1',
    backgroundColor: '#FFFFFF',
  },
  cancelButton: {
    width: 94,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#C9D4CE',
  },
  cancelButtonText: {fontSize: 13, fontWeight: '800', color: '#526271'},
  saveButton: {
    flex: 1,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 7,
    backgroundColor: '#2DCE4A',
  },
  disabledButton: {backgroundColor: '#A7B8AD'},
  saveButtonText: {fontSize: 14, fontWeight: '900', color: '#FFFFFF'},
  closeSavedButton: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: '#174F2A',
  },
  closeSavedButtonText: {fontSize: 14, fontWeight: '900', color: '#FFFFFF'},
});
