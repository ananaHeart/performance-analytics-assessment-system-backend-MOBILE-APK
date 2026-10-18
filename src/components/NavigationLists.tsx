import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, ClipboardList, RefreshCw, School } from 'lucide-react-native';

import { theme, type StatusTone } from '../theme/tokens';
import { Badge, Banner, Card, EmptyState, IconButton, ScreenHeader, SkeletonList, TabHeader } from './ui';

const formatTestDate = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const gradeAndSection = (item: any): string =>
  [item.grade_level_name, item.section_name].filter(Boolean).join(' - ');

/** A class's name (its subject) and the grade and section it belongs to. */
export const classLabels = (item: any): { title: string; subtitle: string | null } => {
  const section = gradeAndSection(item);
  if (item.subject_name) {
    return { title: item.subject_name, subtitle: section || null };
  }
  return { title: section || 'Class', subtitle: null };
};

const CLASS_STATUS_TONES: Record<string, StatusTone> = {
  Synced: 'success',
  Unsynced: 'warning',
  'No Records': 'neutral',
};

const assessmentStatusTone = (status: string): StatusTone => {
  switch (status.toLowerCase()) {
    case 'complete':
      return 'success';
    case 'open':
      return 'info';
    case 'scheduled':
      return 'warning';
    default:
      return 'neutral';
  }
};

const OFFLINE_MESSAGE =
  "You're offline. You can keep checking saved assessments and send results when you're back online.";

const refreshControl = (refreshing: boolean, onRefresh: () => void) => (
  <RefreshControl
    refreshing={refreshing}
    onRefresh={onRefresh}
    colors={[theme.colors.primary]}
    tintColor={theme.colors.primary}
    progressBackgroundColor={theme.colors.surface}
  />
);

interface ClassListProps {
  data: any[];
  onSelect: (item: any) => void;
  /** 'button' for the refresh button and the empty state's Refresh, 'pull' for pull-to-refresh. */
  onRefresh: (source: 'button' | 'pull') => void;
  refreshing: boolean;
  offline: boolean;
}

export const ClassList = ({ data, onSelect, onRefresh, refreshing, offline }: ClassListProps) => (
  <View style={styles.screen}>
    <TabHeader
      title="Classes"
      subtitle="Choose a class to begin checking assessments"
      right={(
        <IconButton
          icon={RefreshCw}
          accessibilityLabel="Download assigned classes"
          onPress={() => onRefresh('button')}
          disabled={refreshing}
          color={theme.colors.primary}
        />
      )}
    />
    <FlatList
      data={data}
      keyExtractor={(item) => item.class_id.toString()}
      contentContainerStyle={styles.listContent}
      refreshControl={refreshControl(refreshing, () => onRefresh('pull'))}
      ListHeaderComponent={offline ? <Banner tone="info" message={OFFLINE_MESSAGE} style={styles.banner} /> : null}
      ListEmptyComponent={refreshing ? <SkeletonList /> : (
        <EmptyState
          icon={School}
          title="No downloaded classes yet"
          message="Pull down to refresh while you're online."
          action={{ label: 'Refresh', onPress: () => onRefresh('button') }}
        />
      )}
      ItemSeparatorComponent={Separator}
      renderItem={({ item }) => {
        const { title, subtitle } = classLabels(item);
        const studentCount = Number(item.student_count ?? 0);
        const details = [subtitle, `${studentCount} ${studentCount === 1 ? 'student' : 'students'}`]
          .filter(Boolean)
          .join(' · ');
        const status: string | undefined = item.statusLabel;

        return (
          <Card
            onPress={() => onSelect(item)}
            accessibilityLabel={[title, details, status].filter(Boolean).join(', ')}
          >
            <View style={styles.cardRow}>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>{title}</Text>
                <Text style={styles.caption}>{details}</Text>
                {status ? (
                  <Badge label={status} tone={CLASS_STATUS_TONES[status] ?? 'neutral'} style={styles.cardBadge} />
                ) : null}
              </View>
              <ChevronRight size={20} color={theme.colors.muted} strokeWidth={2.2} />
            </View>
          </Card>
        );
      }}
    />
  </View>
);

interface TestListProps {
  classItem: any;
  data: any[];
  onSelect: (item: any) => void;
  onBack: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  offline: boolean;
}

export const TestList = ({ classItem, data, onSelect, onBack, onRefresh, refreshing, offline }: TestListProps) => {
  const { title, subtitle } = classLabels(classItem);
  return (
    <View style={styles.screen}>
      <ScreenHeader title={title} subtitle={subtitle ?? undefined} onBack={onBack} backLabel="Back to classes" />
      <FlatList
        data={data}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.test_id.toString()}
        refreshControl={refreshControl(refreshing, onRefresh)}
        ListHeaderComponent={offline ? <Banner tone="info" message={OFFLINE_MESSAGE} style={styles.banner} /> : null}
        ListEmptyComponent={refreshing ? <SkeletonList /> : (
          <EmptyState
            icon={ClipboardList}
            title="No assessments yet"
            message="Activated assessments for this class appear here. Pull down to refresh."
          />
        )}
        ItemSeparatorComponent={Separator}
        renderItem={({ item }) => {
          const isV3 = item.storage_version === 'v3';
          const isUploaded = item.checking_status === 'Uploaded';
          const statusLabel = isV3
            ? String(item.assignment_status || 'Downloaded').toUpperCase()
            : isUploaded ? 'Uploaded' : 'Upload';
          const statusTone = isV3 ? assessmentStatusTone(statusLabel) : isUploaded ? 'success' : 'warning';
          const date = formatTestDate(item.test_date) || 'No date';
          const totalItems = item.total_items ?? 0;

          return (
            <Card
              accent
              onPress={() => onSelect(item)}
              accessibilityLabel={`${item.test_name || 'Assessment'}, ${statusLabel}, Date ${date}, Total Items ${totalItems}`}
            >
              <View style={styles.cardRow}>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{item.test_name || 'Assessment'}</Text>
                  <Badge label={statusLabel} tone={statusTone} style={styles.cardBadge} />
                  <View style={styles.metaRow}>
                    <Text style={styles.caption}>
                      <Text style={styles.metaLabel}>Date: </Text>
                      {date}
                    </Text>
                    <Text style={styles.caption}>
                      <Text style={styles.metaLabel}>Total Items: </Text>
                      {totalItems}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={20} color={theme.colors.muted} strokeWidth={2.2} />
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
};

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  listContent: {
    flexGrow: 1,
    padding: theme.screenPadding,
    paddingBottom: theme.spacing.xxl,
  },
  banner: { marginBottom: theme.spacing.md },
  separator: { height: theme.spacing.md },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  cardCopy: { flex: 1 },
  cardTitle: { ...theme.type.cardTitle, color: theme.colors.text },
  caption: { ...theme.type.caption, color: theme.colors.muted, marginTop: 2 },
  cardBadge: { marginTop: theme.spacing.sm },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: theme.spacing.lg, marginTop: theme.spacing.sm },
  metaLabel: { ...theme.type.label, color: theme.colors.textSecondary },
});
