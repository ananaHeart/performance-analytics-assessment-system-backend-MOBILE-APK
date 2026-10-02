import React, { useState, useCallback, memo, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {
  getFlattenedTestItemsForTest,
  getSavedResponsesForStudent,
  getTestPartsForTest,
  saveItemResponse,
  debugItemResponses,
} from '../database/db';

const normalizePartType = (partType: string | null | undefined) =>
  String(partType ?? '').trim().toLowerCase();

const isGridPartType = (partType: string | null | undefined) =>
  normalizePartType(partType) === 'multiple choice';

const ItemButton = memo(({
  itemNum,
  status,
  correctAnswer,
  onPress,
  buttonWidth,
  buttonHeight,
  isLongAnswer,
  layoutMode = 'grid',
}: any) => {
  const isPending = status !== 1 && status !== 0;
  const backgroundColor = status === 1 ? '#3ACF49' : status === 0 ? '#FF3B30' : '#D1D1D6';
  const textColor = isPending ? '#555555' : '#FFFFFF';
  const answerLabel = correctAnswer && correctAnswer !== '?' ? String(correctAnswer) : 'No key';
  const isLineLayout = layoutMode === 'line';

  return (
    <TouchableOpacity
      style={[
        styles.button,
        isLineLayout && styles.lineAnswerButton,
        isLongAnswer && styles.longAnswerButton,
        {
          backgroundColor,
          width: buttonWidth,
          height: isLineLayout ? undefined : buttonHeight,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {isLineLayout ? (
        <View style={styles.lineAnswerContent}>
          <Text style={[styles.lineItemNumText, { color: textColor }]}>{itemNum}</Text>
          <Text
            style={[styles.lineAnswerText, { color: textColor }]}
            numberOfLines={2}
          >
            {answerLabel}
          </Text>
          <View style={styles.lineAnswerSpacer} />
        </View>
      ) : (
        <>
          <Text style={[styles.itemNumText, { color: textColor }]}>#{itemNum}</Text>
          <Text
            style={[styles.answerText, isLongAnswer && styles.longAnswerText, { color: textColor }]}
            numberOfLines={isLongAnswer ? 3 : 2}
          >
            {answerLabel}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
});

export const CheckingGrid = forwardRef(({ totalItems, testId, studentId, onScoreChange }: any, ref) => {
  const { width } = useWindowDimensions();

  const [grades, setGrades] = useState<any>({});
  const [flattenedItems, setFlattenedItems] = useState<any[]>([]);
  const [testParts, setTestParts] = useState<any[]>([]);

  const numColumns = width < 340 ? 4 : 5;
  const horizontalPadding = 16;
  const gridGap = 8;
  const availableWidth = width - (horizontalPadding * 2) - (gridGap * (numColumns - 1));
  const buttonSize = Math.max(52, Math.min(70, Math.floor(availableWidth / numColumns)));
  const innerGridWidth = Math.max(240, width - (horizontalPadding * 2));

  const getButtonMetrics = useCallback((answer: string | null | undefined) => {
    const normalizedAnswer = answer && answer !== '?' ? String(answer).trim() : '';
    const answerLength = normalizedAnswer.length;

    if (answerLength > 14) {
      return {
        buttonWidth: innerGridWidth,
        buttonHeight: 76,
        isLongAnswer: true,
      };
    }

    if (answerLength > 4) {
      return {
        buttonWidth: Math.min(innerGridWidth, Math.max(buttonSize * 2 + gridGap, 150)),
        buttonHeight: 76,
        isLongAnswer: false,
      };
    }

    return {
      buttonWidth: buttonSize,
      buttonHeight: buttonSize,
      isLongAnswer: false,
    };
  }, [buttonSize, innerGridWidth]);

  useEffect(() => {
    setGrades({});
    if (!testId || !studentId) {
      setFlattenedItems([]);
      setTestParts([]);
      return;
    }

    const testItems = getFlattenedTestItemsForTest(testId);
    const testPartsForTest = getTestPartsForTest(testId);
    const testPartLookup = new Map(
      testPartsForTest.map((part: any) => [part.test_part_id, part]),
    );
    const mergedItems = testItems.map((item: any) => {
      const matchingPart = testPartLookup.get(item.test_part_id) || {};

      return {
        ...item,
        part_order: matchingPart.part_order ?? item.part_order,
        part_type: matchingPart.part_type ?? null,
        competency_name: matchingPart.competency_name ?? null,
        points_per_item: matchingPart.points_per_item ?? item.points_per_item ?? 1,
        number_of_items: matchingPart.number_of_items ?? null,
      };
    });
    const savedResponses = getSavedResponsesForStudent(testId, studentId);
    const savedGradesMap: Record<number, number> = {};
    const testItemLookup = new Map(
      mergedItems.map((item: any) => [`${item.test_part_id}:${item.item_number}`, item.global_item_number]),
    );

    mergedItems.forEach((item: any) => {
      savedGradesMap[item.global_item_number] = 1;
    });

    savedResponses.forEach((response: any) => {
      const globalItemNumber = testItemLookup.get(`${response.test_part_id}:${response.item_number}`);
      if (globalItemNumber != null) {
        savedGradesMap[globalItemNumber] = response.is_correct;
      }
    });

    setTestParts(testPartsForTest);
    setFlattenedItems(mergedItems);
    setGrades(savedGradesMap);
  }, [studentId, testId]);

  const score = flattenedItems.length > 0
    ? flattenedItems.reduce(
        (total, item) => total + (grades[item.global_item_number] === 1 ? (item.points_per_item || 1) : 0),
        0,
      )
    : Object.values(grades).filter((val) => val === 1).length;

  const maxScore = flattenedItems.length > 0
    ? flattenedItems.reduce(
        (total, item) => total + (item.points_per_item || 1),
        0,
      )
    : totalItems;

  const partSections = testParts.length > 0
    ? testParts.map((part: any, index: number) => ({
        key: String(part.test_part_id ?? index),
        label: `Part ${part.part_order || index + 1}`,
        partType: part.part_type || 'Assessment Items',
        competencyName: part.competency_name || null,
        pointsPerItem: part.points_per_item || 1,
        itemCount: part.number_of_items || 0,
        items: flattenedItems.filter((item: any) => item.test_part_id === part.test_part_id),
      }))
    : [
        {
          key: 'default-part',
          label: 'Part 1',
          partType: 'Assessment Items',
          competencyName: null,
          pointsPerItem: 1,
          itemCount: totalItems,
          items: flattenedItems.length > 0
            ? flattenedItems
            : Array.from({ length: totalItems }, (_, i) => ({
                global_item_number: i + 1,
                correct_answer: '?',
                test_part_id: null,
                item_number: i + 1,
              })),
        },
      ];

  useEffect(() => {
    if (typeof onScoreChange === 'function') {
      onScoreChange({ studentId, score, maxScore });
    }
  }, [maxScore, onScoreChange, score, studentId]);

  const saveAllResponses = useCallback(() => {
    if (!testId || !studentId) {
      return { savedCount: 0, score };
    }

    const itemsToSave = flattenedItems.filter((item: any) => item?.test_part_id);
    itemsToSave.forEach((item: any) => {
      const status = grades[item.global_item_number] === 0 ? 0 : 1;
      saveItemResponse(testId, studentId, item.test_part_id, item.item_number, status === 1);
    });

    return { savedCount: itemsToSave.length, score };
  }, [flattenedItems, grades, score, studentId, testId]);

  useImperativeHandle(ref, () => ({
    saveAllResponses,
  }), [saveAllResponses]);

  const handlePress = useCallback((item: any) => {
    if (!testId || !studentId || !item?.test_part_id) {
      return;
    }

    setGrades((prev: any) => {
      const currentStatus = prev[item.global_item_number];
      const nextStatus = currentStatus === 1 ? 0 : 1;
      saveItemResponse(testId, studentId, item.test_part_id, item.item_number, nextStatus === 1);
      debugItemResponses();
      return { ...prev, [item.global_item_number]: nextStatus };
    });
  }, [studentId, testId]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {partSections.map((part: any) => (
        <View key={part.key} style={styles.partSection}>
          {(() => {
            const isGridLayout = isGridPartType(part.partType);

            return (
              <>
          <View style={styles.partHeader}>
            <View style={styles.partTitleRow}>
              <Text style={styles.partTitle}>{part.label} - {part.partType}</Text>
              <View style={styles.partPillRow}>
                <Text style={styles.partPill}>{part.pointsPerItem}pt</Text>
                <Text style={styles.partPill}>/{part.itemCount || part.items.length}</Text>
              </View>
            </View>
            {part.competencyName ? <Text style={styles.partTag}>Competency: {part.competencyName}</Text> : null}
          </View>

          <View style={isGridLayout ? styles.gridWrap : styles.listWrap}>
            {part.items.map((item: any) => (
              <View
                key={item.global_item_number}
                style={isGridLayout ? styles.gridCell : styles.listCell}
              >
                {(() => {
                  const metrics = isGridLayout
                    ? getButtonMetrics(item.correct_answer)
                    : {
                        buttonWidth: innerGridWidth,
                        buttonHeight: 64,
                        isLongAnswer: false,
                      };

                  return (
                    <ItemButton
                      itemNum={item.global_item_number}
                      status={grades[item.global_item_number]}
                      correctAnswer={item.correct_answer || '?'}
                      onPress={() => handlePress(item)}
                      buttonWidth={metrics.buttonWidth}
                      buttonHeight={metrics.buttonHeight}
                      isLongAnswer={metrics.isLongAnswer}
                      layoutMode={isGridLayout ? 'grid' : 'line'}
                    />
                  );
                })()}
              </View>
            ))}
          </View>
              </>
            );
          })()}
        </View>
      ))}
    </ScrollView>
  );
});

CheckingGrid.displayName = 'CheckingGrid';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  content: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  partSection: {
    backgroundColor: '#F5F6FA',
    marginHorizontal: 4,
    marginBottom: 8,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#1877D3',
    overflow: 'hidden',
  },
  partHeader: {
    backgroundColor: '#F5F6FA',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 6,
  },
  partTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  partTitle: {
    flex: 1,
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
  },
  partPillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  partPill: {
    backgroundColor: '#D9DEE5',
    color: '#374151',
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 4,
  },
  partTag: {
    alignSelf: 'flex-start',
    color: '#374151',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 6,
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
    justifyContent: 'center',
    gap: 8,
  },
  gridCell: {
    marginBottom: 4,
  },
  listWrap: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
    gap: 10,
  },
  listCell: {
    width: '100%',
  },
  button: {
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 5,
  },
  longAnswerButton: {
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  lineAnswerButton: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  lineAnswerContent: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  lineItemNumText: {
    width: 42,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  lineAnswerText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
    textAlign: 'center',
  },
  lineAnswerSpacer: {
    width: 42,
  },
  itemNumText: {
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 11,
    opacity: 0.86,
  },
  answerText: {
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
    textAlignVertical: 'center',
    textAlign: 'center',
    includeFontPadding: false,
    marginTop: 1,
  },
  longAnswerText: {
    fontSize: 17,
    lineHeight: 21,
    textAlign: 'left',
  },
});
