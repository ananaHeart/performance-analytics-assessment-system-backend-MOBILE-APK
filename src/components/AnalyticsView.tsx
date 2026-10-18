import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CloudUpload,
  FileText,
  Grid2X2,
  Inbox,
  type LucideIcon,
} from 'lucide-react-native';

import { theme, type StatusTone } from '../theme/tokens';
import { classLabels } from './NavigationLists';
import { Badge, Card, EmptyState, ListRow, TabHeader } from './ui';

const scoreTone = (score: number, maxScore: number): StatusTone => {
  const percent = maxScore > 0 ? (score / maxScore) * 100 : 0;
  return percent >= 70 ? 'success' : percent >= 45 ? 'warning' : 'danger';
};

const StatCard = ({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
  color: string;
}) => (
  <Card style={styles.statCard} padded={false}>
    <View style={styles.statBody} accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon size={theme.iconSize.small} color={color} strokeWidth={2.2} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  </Card>
);

/** A field that opens a short list of choices right below it. */
const Picker = ({
  icon: Icon,
  label,
  value,
  placeholder,
  open,
  onToggle,
  disabled = false,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
  placeholder: string;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) => (
  <Card padded={false}>
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? placeholder}`}
      accessibilityState={{ expanded: open, disabled }}
      style={({ pressed }) => [styles.pickerField, pressed && styles.pressed]}
    >
      <Icon size={theme.iconSize.small} color={disabled ? theme.colors.faint : theme.colors.primary} strokeWidth={2.2} />
      <View style={styles.pickerCopy}>
        <Text style={styles.pickerLabel}>{label}</Text>
        <Text style={[styles.pickerValue, !value && styles.pickerPlaceholder]}>{value ?? placeholder}</Text>
      </View>
      {open
        ? <ChevronUp size={20} color={theme.colors.muted} strokeWidth={2.2} />
        : <ChevronDown size={20} color={theme.colors.muted} strokeWidth={2.2} />}
    </Pressable>
    {open ? <View>{children}</View> : null}
  </Card>
);

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

  const selectedClassLabel = selectedClass
    ? [classLabels(selectedClass).title, classLabels(selectedClass).subtitle].filter(Boolean).join(' · ')
    : null;

  return (
    <View style={styles.container}>
      <TabHeader title="Synchronization" subtitle="Track checked and synced results" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Picker
          icon={Grid2X2}
          label="Class"
          value={selectedClassLabel}
          placeholder="Select a class"
          open={isClassPickerOpen}
          onToggle={() => {
            setIsClassPickerOpen((current) => !current);
            setIsAssessmentPickerOpen(false);
          }}
        >
          {classes.length > 0 ? (
            classes.map((item: any) => {
              const { title, subtitle } = classLabels(item);
              const isSelected = selectedClass?.class_id === item.class_id;
              return (
                <ListRow
                  key={item.class_id}
                  bordered={false}
                  divider
                  title={title}
                  subtitle={subtitle}
                  selected={isSelected}
                  right={isSelected ? <Check size={20} color={theme.colors.primary} strokeWidth={2.4} /> : null}
                  onPress={() => {
                    onSelectClass?.(item);
                    setIsClassPickerOpen(false);
                  }}
                />
              );
            })
          ) : (
            <ListRow bordered={false} divider title="No classes available" subtitle="Download assigned data first." />
          )}
        </Picker>

        <Picker
          icon={FileText}
          label="Assessment"
          value={selectedTest?.test_name || null}
          placeholder="Select an assessment"
          open={isAssessmentPickerOpen}
          onToggle={() => {
            setIsAssessmentPickerOpen((current) => !current);
            setIsClassPickerOpen(false);
          }}
        >
          {tests.length > 0 ? (
            tests.map((test: any) => {
              const isSelected = selectedTest?.test_id === test.test_id;
              return (
                <ListRow
                  key={test.test_id}
                  bordered={false}
                  divider
                  title={test.test_name || 'Assessment'}
                  subtitle={`Total Items: ${test.total_items ?? 0}`}
                  selected={isSelected}
                  right={isSelected ? <Check size={20} color={theme.colors.primary} strokeWidth={2.4} /> : null}
                  onPress={() => {
                    onSelectAssessment?.(test);
                    setIsAssessmentPickerOpen(false);
                  }}
                />
              );
            })
          ) : (
            <ListRow
              bordered={false}
              divider
              title="No assessments available"
              subtitle="Choose a class first to load its assessments."
            />
          )}
        </Picker>

        {hasSelectedAssessment ? (
          <>
            <Text style={styles.sectionLabel} accessibilityRole="header">Sync Overview</Text>
            <View style={styles.statRow}>
              <StatCard icon={CircleCheck} value={ofTotal(checkedStudents)} label="Checked" color={theme.colors.primary} />
              <StatCard icon={CloudUpload} value={ofTotal(syncedStudents)} label="Synced" color={theme.colors.primary} />
              <StatCard icon={CloudUpload} value={ofTotal(unsyncedStudents)} label="Unsynced" color={theme.status.warning.text} />
            </View>

            {checkedStudents === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Nothing to sync yet"
                message="Results you save on this phone appear here until you send them."
              />
            ) : (
              <>
                <Text style={styles.sectionLabel} accessibilityRole="header">Student Scores</Text>
                {studentRows.length > 0 ? (
                  <Card padded={false}>
                    {studentRows.map((student: any, index: number) => (
                      <ListRow
                        key={student.id}
                        bordered={false}
                        divider={index > 0}
                        title={student.name}
                        right={(
                          <Badge
                            label={`${student.score} / ${student.maxScore}`}
                            tone={scoreTone(student.score, student.maxScore)}
                          />
                        )}
                      />
                    ))}
                  </Card>
                ) : (
                  <Card>
                    <Text style={styles.cardTitle}>No student scores yet</Text>
                    <Text style={styles.cardText}>Check students first to view their scores here.</Text>
                  </Card>
                )}
              </>
            )}
          </>
        ) : (
          <EmptyState
            icon={Grid2X2}
            title="No assessment selected"
            message="Select a class and assessment to view analytics."
            action={{ label: 'Go to Classes', onPress: onGoToClasses }}
          />
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.screenPadding, paddingBottom: theme.spacing.xxxl, gap: theme.spacing.md },
  pressed: { backgroundColor: theme.colors.surfaceSunken },
  pickerField: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  pickerCopy: { flex: 1 },
  pickerLabel: { ...theme.type.label, color: theme.colors.muted },
  pickerValue: { ...theme.type.bodyStrong, color: theme.colors.text, marginTop: 2 },
  pickerPlaceholder: { color: theme.colors.placeholder, fontWeight: '400' },
  sectionLabel: { ...theme.type.label, color: theme.colors.muted, marginTop: theme.spacing.sm, textTransform: 'uppercase' },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  statCard: { flexGrow: 1, flexBasis: 96 },
  statBody: { padding: theme.spacing.md, gap: theme.spacing.xs },
  statValue: { ...theme.type.score },
  statLabel: { ...theme.type.caption, color: theme.colors.muted },
  cardTitle: { ...theme.type.cardTitle, color: theme.colors.text },
  cardText: { ...theme.type.body, color: theme.colors.muted, marginTop: theme.spacing.xs },
});
