import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput } from 'react-native';

export const StudentList = ({ students, onSelectStudent }: any) => {
  const [search, setSearch] = useState('');

  // Filter students based on search input
  const filteredStudents = students.filter((s: any) => 
    `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  const renderItem = ({ item }: any) => (
    <TouchableOpacity 
      style={styles.studentCard} 
      onPress={() => onSelectStudent(item)}
    >
      <View style={styles.info}>
        <Text style={styles.name}>{item.last_name}, {item.first_name}</Text>
        <Text style={styles.idText}>Status: {item.score > 0 ? '✅ Graded' : '⏳ Pending'}</Text>
      </View>
      <View style={[styles.scoreBadge, { backgroundColor: item.score > 0 ? '#2E7D32' : '#757575' }]}>
        <Text style={styles.scoreText}>{item.score}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TextInput 
        style={styles.searchBar}
        placeholder="Search student name..."
        value={search}
        onChangeText={setSearch}
      />
      <FlatList
        data={filteredStudents}
        renderItem={renderItem}
        keyExtractor={(item) => item.student_id.toString()}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15 },
  searchBar: { 
    backgroundColor: 'white', 
    padding: 12, 
    borderRadius: 8, 
    marginBottom: 15, 
    elevation: 2,
    borderWidth: 1,
    borderColor: '#ddd'
  },
  studentCard: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 2,
  },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: 'bold' },
  idText: { fontSize: 12, color: '#888' },
  scoreBadge: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  scoreText: { color: 'white', fontWeight: 'bold' }
});