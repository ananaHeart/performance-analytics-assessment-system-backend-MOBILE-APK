import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Bell, ChevronRight, RefreshCw, Users } from 'lucide-react-native';

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

const renderMetaLine = (label: string, value?: string | number | null) => {
  if (value == null || value === '') {
    return null;
  }

  return (
    <Text style={styles.metaText}>
      <Text style={styles.metaLabel}>{label}: </Text>
      {value}
    </Text>
  );
};

export const ClassList = ({ data, onSelect, onSync }: any) => {
  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.class_id.toString()}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <View style={styles.classListHeader}>
          <View style={styles.classListCopy}>
            <Text style={styles.classListTitle}>Classes</Text>
            <Text style={styles.classListSubtitle}>Choose a class to begin checking assessments</Text>
          </View>
          <View style={styles.classHeaderActions}>
            <TouchableOpacity style={styles.classHeaderIconButton} activeOpacity={0.9}>
              <Bell size={30} color="#2DBE4F" strokeWidth={3.2} />
            </TouchableOpacity>
            {onSync ? (
              <TouchableOpacity style={styles.classHeaderIconButton} onPress={onSync} activeOpacity={0.9}>
                <RefreshCw size={30} color="#2DBE4F" strokeWidth={3.2} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No downloaded classes yet</Text>
          <Text style={styles.emptyText}>Use Download Assigned Data to load your assigned classes and tests.</Text>
        </View>
      }
      renderItem={({ item }) => {
        const className = [item.grade_level_name, item.section_name].filter(Boolean).join(' - ') || item.subject_name || 'Class';
        const studentCount = item.student_count ?? 0;

        return (
          <TouchableOpacity style={styles.classCard} onPress={() => onSelect(item)} activeOpacity={0.9}>
            <View style={styles.classCardTopRow}>
              <View style={styles.chevronCircle}>
                <ChevronRight size={17} color="#2DBE4F" strokeWidth={3} />
              </View>
            </View>

            <Text style={styles.classTitle}>{className}</Text>
            <View style={styles.classSubjectPill}>
              <Text style={styles.classSubject} numberOfLines={1}>{item.subject_name || 'Assigned Subject'}</Text>
            </View>

            <View style={styles.classCardFooter}>
              <View style={styles.studentCountRow}>
                <Users size={13} color="#4B5563" strokeWidth={2.3} style={styles.studentIcon} />
                <Text style={styles.studentCountText}>{studentCount} Students</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
};

export const TestList = ({ data, onSelect }: any) => {
  return (
    <FlatList
      data={data}
      contentContainerStyle={[styles.listContent, styles.testListContent]}
      keyExtractor={(item) => item.test_id.toString()}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No downloaded tests yet</Text>
          <Text style={styles.emptyText}>Download assigned data first or choose another class.</Text>
        </View>
      }
      renderItem={({ item }) => {
        const isUploaded = item.checking_status === 'Uploaded';
        const isV3 = item.storage_version === 'v3';
        const statusLabel = isV3
          ? String(item.assignment_status || 'Downloaded').toUpperCase()
          : isUploaded ? 'Uploaded' : 'Upload';

        return (
          <TouchableOpacity style={styles.testRowCard} onPress={() => onSelect(item)} activeOpacity={0.9}>
            <View style={styles.testRowContent}>
              <View style={styles.testRowTopLine}>
                <Text style={styles.testRowTitle}>{item.test_name || 'Assessment'}</Text>
                <View style={[styles.uploadBadge, (isUploaded || isV3) && styles.uploadedBadge]}>
                  <Text style={[styles.uploadBadgeText, (isUploaded || isV3) && styles.uploadedBadgeText]}>
                    {statusLabel}
                  </Text>
                </View>
              </View>
              <View style={styles.testMetaRow}>
                <Text style={styles.testMetaText}>
                  <Text style={styles.testMetaLabel}>Date: </Text>
                  {formatTestDate(item.test_date) || 'No date'}
                </Text>
                <Text style={styles.testMetaText}>
                  <Text style={styles.testMetaLabel}>Total Items: </Text>
                  {item.total_items ?? 0}
                </Text>
              </View>
            </View>
            <ChevronRight size={21} color="#B6BCC2" strokeWidth={2.6} />
          </TouchableOpacity>
        );
      }}
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingTop: 18,
    paddingBottom: 24,
  },
  testListContent: {
    paddingTop: 0,
  },
  classListHeader: {
    position: 'relative',
    paddingHorizontal: 18,
    marginBottom: 20,
  },
  classListCopy: {
    paddingRight: 104,
  },
  classListTitle: {
    color: '#111827',
    fontSize: 25,
    fontWeight: '900',
  },
  classListSubtitle: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  classHeaderActions: {
    position: 'absolute',
    right: 18,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  classHeaderIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  classCard: {
    backgroundColor: '#EFF1F3',
    marginHorizontal: 20,
    marginVertical: 7,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  classCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 6,
  },
  chevronCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8ECEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  classTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
  },
  classSubjectPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: '#DFF7E6',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  classSubject: {
    color: '#159947',
    fontSize: 14,
    fontWeight: '900',
  },
  classCardFooter: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  studentIcon: {
    marginRight: 6,
  },
  studentCountText: {
    color: '#4B5563',
    fontSize: 10,
    fontWeight: '700',
  },
  testRowCard: {
    backgroundColor: '#EFF1F3',
    marginHorizontal: 10,
    marginVertical: 8,
    borderRadius: 10,
    minHeight: 92,
    paddingHorizontal: 22,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  testRowContent: {
    flex: 1,
    paddingRight: 12,
  },
  testRowTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  testRowTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
    flex: 1,
  },
  uploadBadge: {
    backgroundColor: '#E8ECEF',
    borderRadius: 999,
    minHeight: 30,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadedBadge: {
    backgroundColor: '#D8F5DE',
  },
  uploadBadgeText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '900',
  },
  uploadedBadgeText: {
    color: '#22A447',
  },
  testMetaRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  testMetaText: {
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '700',
  },
  testMetaLabel: {
    color: '#6B7280',
    fontWeight: '900',
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  statusAccent: {
    width: 8,
    borderRadius: 999,
    marginRight: 14,
  },
  classAccent: {
    backgroundColor: '#34C759',
  },
  testAccent: {
    backgroundColor: '#84CC16',
  },
  content: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
  },
  badge: {
    backgroundColor: '#E9F9EE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    color: '#1E8E3E',
    fontSize: 11,
    fontWeight: '700',
  },
  classPrimaryDetail: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  secondaryBadge: {
    backgroundColor: '#F2F7F3',
  },
  secondaryBadgeText: {
    color: '#4B5563',
    fontSize: 11,
    fontWeight: '700',
  },
  metaText: {
    color: '#374151',
    fontSize: 13,
    marginTop: 4,
  },
  metaLabel: {
    color: '#6B7280',
    fontWeight: '700',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 20,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#1F2937',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
