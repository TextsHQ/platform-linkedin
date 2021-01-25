/**
 * @param data
 * @param type
 * @returns {any[]}
 */
export const filterByType = (data: any[], type: string): any[] => {
  return data.filter(({ $type }) => $type === type);
};
