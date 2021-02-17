/**
 * @param data
 * @param type
 * @returns {any[]}
 */
export const filterByType = (data: any[], type: string): any[] => data.filter(({ $type }) => $type === type)
