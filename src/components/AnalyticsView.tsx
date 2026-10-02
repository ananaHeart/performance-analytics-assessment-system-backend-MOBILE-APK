import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import {
  CheckCircle2,
  ChevronDown,
  X,
  CloudUpload,
  FileText,
  Grid2X2,
  UserCircle,
} from 'lucide-react-native';

const OverviewTile = ({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  tone: 'green' | 'orange' | 'blue';
}) => (
  <View style={styles.overviewTile}>
    <View style={[styles.overviewIconCircle, styles[`${tone}IconCircle`]]}>{icon}</View>
    <Text style={[styles.overviewValue, styles[`${tone}Text`]]}>{value}</Text>
    <Text style={styles.overviewLabel}>{label}</Text>
  </View>
);

const getScoreTone = (score: number, maxScore: number): string => {
  const percent = maxScore > 0 ? (score / maxScore) * 100 : 0;
  return percent >= 70 ? '#16A34A' : percent >= 45 ? '#EA580C' : '#DC2626';
};

export const AnalyticsView = ({
  totalStudentsChecked,
  selectedClass,
  classes = [],
  selectedTest,
  tests = [],
  roster = [],
  selectedTestStatus,
  onSelectClass,
  onSelectAssessment,
  onGoToClasses,
}: any) => {
  const [isClassPickerOpen, setIsClassPickerOpen] = useState(false);
  const [isAssessmentPickerOpen, setIsAssessmentPickerOpen] = useState(false);
  const [isStudentPanelOpen, setIsStudentPanelOpen] = useState(false);
  const hasSelectedClass = Boolean(selectedClass);
  const hasSelectedAssessment = Boolean(selectedTest);
  const checkedStudents = selectedTestStatus?.checkedStudents ?? totalStudentsChecked ?? 0;
  const syncedStudents = selectedTestStatus?.syncedStudents ?? 0;
  const unsyncedStudents = selectedTestStatus?.unsyncedStudents ?? 0;
  const totalStudents: number | null = selectedTestStatus?.totalStudents ?? null;
  const ofTotal = (value: number): string | number =>
    totalStudents ? `${value}/${totalStudents}` : value;

  const studentRows = roster
    .filter((student: any) => Number(student.is_checked) === 1)
    .map((student: any) => ({
      id: student.student_id,
      name: [student.last_name, student.first_name].filter(Boolean).join(', ') || 'Unnamed Student',
      score: Number(student.score ?? 0),
      maxScore: Number(student.maxScore ?? selectedTest?.total_items ?? 0),
    }))
    .sort((left: any, right: any) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.name.localeCompare(right.name);
    });

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Synchronization</Text>
          <Text style={styles.subtitle}>Track checked and synced results</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      <View style={styles.selectorArea}>
        <TouchableOpacity
          style={styles.assessmentSelect}
          onPress={() => {
            setIsClassPickerOpen((current) => !current);
            setIsAssessmentPickerOpen(false);
          }}
          activeOpacity={0.85}
        >
          <Grid2X2 size={20} color="#35C94A" strokeWidth={2.4} />
          <Text style={[styles.assessmentSelectText, !hasSelectedClass && styles.placeholderText]}>
            {selectedClass
              ? [selectedClass.grade_level_name, selectedClass.section_name].filter(Boolean).join(' - ') || selectedClass.subject_name || 'Selected class'
              : 'Select a class'}
          </Text>
          <ChevronDown size={20} color="#111827" strokeWidth={2.5} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.assessmentSelect}
          onPress={() => {
            setIsAssessmentPickerOpen((current) => !current);
            setIsClassPickerOpen(false);
          }}
          activeOpacity={0.85}
        >
          <FileText size={20} color={hasSelectedClass ? '#35C94A' : '#94A3B8'} strokeWidth={2.4} />
          <Text style={[styles.assessmentSelectText, !hasSelectedAssessment && styles.placeholderText]}>
            {selectedTest?.test_name || 'Select an assessment'}
          </Text>
          <ChevronDown size={20} color="#111827" strokeWidth={2.5} />
        </TouchableOpacity>

        {isClassPickerOpen ? (
          <View style={[styles.assessmentMenu, styles.classMenuPosition]}>
            {classes.length > 0 ? (
              classes.map((item: any) => (
                <TouchableOpacity
                  key={item.class_id}
                  style={styles.assessmentMenuItem}
                  onPress={() => {
                    onSelectClass?.(item);
                    setIsClassPickerOpen(false);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.assessmentMenuCopy}>
                    <Text style={styles.assessmentMenuTitle}>
                      {[item.grade_level_name, item.section_name].filter(Boolean).join(' - ') || item.subject_name || 'Class'}
                    </Text>
                    <Text style={styles.assessmentMenuMeta}>{item.subject_name || 'Assigned subject'}</Text>
                  </View>
                  <Text style={styles.assessmentMenuAction}>Select</Text>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.assessmentMenuEmpty}>
                <Text style={styles.assessmentMenuEmptyTitle}>No classes available</Text>
                <Text style={styles.assessmentMenuEmptyText}>Download assigned data first.</Text>
              </View>
            )}
          </View>
        ) : null}

        {isAssessmentPickerOpen ? (
          <View style={[styles.assessmentMenu, styles.assessmentMenuPosition]}>
            {tests.length > 0 ? (
              tests.map((test: any) => (
                <TouchableOpacity
                  key={test.test_id}
                  style={styles.assessmentMenuItem}
                  onPress={() => {
                    onSelectAssessment?.(test);
                    setIsAssessmentPickerOpen(false);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.assessmentMenuCopy}>
                    <Text style={styles.assessmentMenuTitle}>{test.test_name || 'Assessment'}</Text>
                    <Text style={styles.assessmentMenuMeta}>
                      Total Items: {test.total_items ?? 0}
                    </Text>
                  </View>
                  <Text style={styles.assessmentMenuAction}>Select</Text>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.assessmentMenuEmpty}>
                <Text style={styles.assessmentMenuEmptyTitle}>No assessments available</Text>
                <Text style={styles.assessmentMenuEmptyText}>Choose a class first to load its assessments.</Text>
              </View>
            )}
          </View>
        ) : null}
      </View>

      <View style={styles.overviewCard}>
        <Text style={styles.sectionLabel}>Sync Overview</Text>
        <View style={styles.overviewGrid}>
          <OverviewTile
            icon={<CheckCircle2 size={17} color="#35C94A" strokeWidth={2.3} />}
            value={hasSelectedAssessment ? ofTotal(checkedStudents) : '--'}
            label="Checked"
            tone="green"
          />
          <OverviewTile
            icon={<CloudUpload size={17} color="#35C94A" strokeWidth={2.3} />}
            value={hasSelectedAssessment ? ofTotal(syncedStudents) : '--'}
            label="Synced"
            tone="green"
          />
          <OverviewTile
            icon={<CloudUpload size={17} color="#F97316" strokeWidth={2.3} />}
            value={hasSelectedAssessment ? ofTotal(unsyncedStudents) : '--'}
            label="Unsynced"
            tone="orange"
          />
        </View>
      </View>

      {hasSelectedAssessment ? (
        <TouchableOpacity
          style={styles.viewStudentButton}
          onPress={() => setIsStudentPanelOpen(true)}
          activeOpacity={0.9}
        >
          <Text style={styles.viewStudentText}>View Student</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Grid2X2 size={34} color="#35C94A" strokeWidth={2.2} />
          </View>
          <Text style={styles.emptyTitle}>No assessment selected</Text>
          <Text style={styles.emptyText}>Select a class and assessment to view analytics.</Text>
          <TouchableOpacity style={styles.goClassesButton} onPress={onGoToClasses} activeOpacity={0.9}>
            <Text style={styles.goClassesText}>Go to Classes</Text>
          </TouchableOpacity>
        </View>
      )}

      </ScrollView>

      {isStudentPanelOpen ? (
        <View style={styles.studentPanelOverlay}>
          <View style={styles.studentPanel}>
            <View style={styles.studentPanelHeader}>
              <View>
                <Text style={styles.studentPanelTitle}>Student Scores</Text>
                <Text style={styles.studentPanelSubtitle}>{selectedTest?.test_name || 'Selected assessment'}</Text>
              </View>
              <TouchableOpacity style={styles.studentPanelClose} onPress={() => setIsStudentPanelOpen(false)} activeOpacity={0.8}>
                <X size={20} color="#111827" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.studentList} showsVerticalScrollIndicator={false}>
              {studentRows.length > 0 ? (
                studentRows.map((student: any) => (
                  <View key={student.id} style={styles.studentScoreRow}>
                    <View style={styles.studentScoreAvatar}>
                      <UserCircle size={19} color="#35C94A" strokeWidth={2.5} />
                    </View>
                    <Text style={styles.studentScoreName} numberOfLines={1}>{student.name}</Text>
                    <Text
                      style={[
                        styles.studentScoreValue,
                        {color: getScoreTone(student.score, student.maxScore)},
                      ]}
                    >
                      {student.score} / {student.maxScore}
                    </Text>
                  </View>
                ))
              ) : (
                <View style={styles.studentPanelEmpty}>
                  <Text style={styles.studentPanelEmptyTitle}>No student scores yet</Text>
                  <Text style={styles.studentPanelEmptyText}>Check students first to view their scores here.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6FA',
  },
  scrollArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 8,
    backgroundColor: '#F5F6FA',
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    color: '#111827',
    fontSize: 25,
    fontWeight: '900',
  },
  subtitle: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  selectorArea: {
    position: 'relative',
    zIndex: 40,
    elevation: 40,
    marginBottom: 12,
  },
  assessmentSelect: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDE4EC',
    minHeight: 48,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  assessmentMenu: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDE4EC',
    overflow: 'hidden',
    zIndex: 60,
    elevation: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
  },
  classMenuPosition: {
    top: 54,
  },
  assessmentMenuPosition: {
    top: 114,
  },
  assessmentMenuItem: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  assessmentMenuCopy: {
    flex: 1,
  },
  assessmentMenuTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
  },
  assessmentMenuMeta: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
  },
  assessmentMenuAction: {
    color: '#35C94A',
    fontSize: 11,
    fontWeight: '900',
  },
  assessmentMenuEmpty: {
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  assessmentMenuEmptyTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
  },
  assessmentMenuEmptyText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  assessmentSelectText: {
    flex: 1,
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
  },
  placeholderText: {
    color: '#94A3B8',
  },
  overviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDE4EC',
    padding: 14,
    marginBottom: 14,
  },
  sectionLabel: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 10,
  },
  overviewGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  overviewTile: {
    flex: 1,
    minHeight: 82,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  overviewIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  greenIconCircle: {
    backgroundColor: '#E9FBEF',
  },
  orangeIconCircle: {
    backgroundColor: '#FFF4E8',
  },
  blueIconCircle: {
    backgroundColor: '#EFF6FF',
  },
  overviewValue: {
    fontSize: 15,
    fontWeight: '900',
  },
  greenText: {
    color: '#35C94A',
  },
  orangeText: {
    color: '#F97316',
  },
  blueText: {
    color: '#3B82F6',
  },
  overviewLabel: {
    color: '#64748B',
    fontSize: 7,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 2,
  },
  viewStudentButton: {
    minHeight: 48,
    borderRadius: 7,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    marginBottom: 12,
  },
  viewStudentText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  studentPanelOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 100,
    elevation: 20,
  },
  studentPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    maxHeight: '70%',
    width: '100%',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 12,
  },
  studentPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  studentPanelTitle: {
    color: '#111827',
    fontSize: 19,
    fontWeight: '900',
  },
  studentPanelSubtitle: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  studentPanelClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentList: {
    maxHeight: 360,
  },
  studentScoreRow: {
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  studentScoreAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E9FBEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentScoreName: {
    flex: 1,
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
  },
  studentScoreValue: {
    fontSize: 13,
    fontWeight: '900',
  },
  studentPanelEmpty: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  studentPanelEmptyTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
  },
  studentPanelEmptyText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#E9FBEF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 8,
  },
  goClassesButton: {
    backgroundColor: '#35C94A',
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  goClassesText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
});
