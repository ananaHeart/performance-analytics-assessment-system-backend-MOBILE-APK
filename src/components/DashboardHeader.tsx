// src/components/DashboardHeader.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const DashboardHeader = ({ stats, totalStudents }: any) => {
  return (
    <View style={styles.container}>
      <View style={styles.mainStat}>
        <Text style={styles.label}>CLASS AVERAGE</Text>
        <Text style={styles.bigNumber}>{Math.round(stats.average)}%</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.item}><Text style={styles.sLabel}>GRADED</Text><Text style={styles.sValue}>{stats.gradedCount}/{totalStudents}</Text></View>
        <View style={styles.divider} />
        <View style={styles.item}><Text style={styles.sLabel}>TOP STUDENT</Text><Text style={styles.sValue}>{stats.topStudent}</Text></View>
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  container: { backgroundColor: '#DBFFD9', padding: 20, margin: 15, borderRadius: 15 },
  mainStat: { alignItems: 'center', marginBottom: 15 },
  label: { color: '#50DC46', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  bigNumber: { color: '#333', fontSize: 42, fontWeight: 'bold' },
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(80, 220, 70, 0.2)', paddingTop: 15 },
  item: { flex: 1, alignItems: 'center' },
  divider: { width: 1, height: 20, backgroundColor: '#C6C6C6' },
  sLabel: { color: '#999', fontSize: 9, fontWeight: 'bold' },
  sValue: { color: '#333', fontSize: 15, fontWeight: 'bold' }
});