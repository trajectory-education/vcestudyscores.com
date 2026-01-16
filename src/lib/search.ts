import Fuse from 'fuse.js';

// Type for Fuse search results
interface FuseResult<T> {
  item: T;
  refIndex: number;
  score?: number;
}

// ============================================================================
// SEARCH CONFIGURATION
// ============================================================================

export interface SearchOptions<T = unknown> {
  keys: (string | { name: string; weight: number })[];
  threshold?: number;
  minMatchCharLength?: number;
  shouldSort?: boolean;
  includeScore?: boolean;
  ignoreLocation?: boolean;
  distance?: number;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  keys: [],
  threshold: 0.3, // Good balance between fuzziness and precision
  minMatchCharLength: 1,
  shouldSort: true,
  includeScore: true,
  ignoreLocation: true,
  distance: 100,
};

// ============================================================================
// SEARCH CACHE
// ============================================================================

interface CachedSearch<T> {
  fuse: Fuse<T>;
  timestamp: number;
}

const searchCache = new Map<string, CachedSearch<any>>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(data: any[], options: SearchOptions<any>): string {
  return JSON.stringify({
    dataLength: data.length,
    options,
  });
}

function clearExpiredCache(): void {
  const now = Date.now();
  for (const [key, value] of searchCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      searchCache.delete(key);
    }
  }
}

// Export cache clearing function for testing
export function clearSearchCache(): void {
  searchCache.clear();
}

// ============================================================================
// FUZZY SEARCH FACTORY
// ============================================================================

/**
 * Creates a cached Fuse instance for fuzzy searching
 */
export function createFuzzySearch<T>(
  data: T[],
  options: SearchOptions<T>
): Fuse<T> {
  clearExpiredCache();

  const cacheKey = getCacheKey(data, options);
  const cached = searchCache.get(cacheKey);

  if (cached) {
    return cached.fuse as Fuse<T>;
  }

  const fuse = new Fuse(data, {
    ...DEFAULT_SEARCH_OPTIONS,
    ...options,
  });

  searchCache.set(cacheKey, { fuse, timestamp: Date.now() });

  return fuse;
}

/**
 * Performs a fuzzy search with automatic caching
 */
export function fuzzySearch<T>(
  data: T[],
  query: string,
  options: SearchOptions<T>
): T[] {
  if (!query || query.trim().length === 0) {
    return data;
  }

  const trimmedQuery = query.trim();
  if (trimmedQuery.length < (options.minMatchCharLength || 1)) {
    return [];
  }

  const fuse = createFuzzySearch(data, options);
  const results = fuse.search(trimmedQuery);

  return results.map((r: FuseResult<T>) => r.item);
}

/**
 * Performs a fuzzy search returning scored results
 */
export function fuzzySearchWithScores<T>(
  data: T[],
  query: string,
  options: SearchOptions<T>
): Array<{ item: T; score: number }> {
  if (!query || query.trim().length === 0) {
    return data.map((item) => ({ item, score: 1 }));
  }

  const trimmedQuery = query.trim();
  if (trimmedQuery.length < (options.minMatchCharLength || 1)) {
    return [];
  }

  const fuse = createFuzzySearch(data, options);
  return fuse.search(trimmedQuery)
    .map((r) => ({ item: r.item, score: r.score ?? 0 }));
}

// ============================================================================
// HYBRID SEARCH (Exact + Fuzzy)
// ============================================================================

/**
 * Performs a hybrid search that prioritises exact matches
 * then falls back to fuzzy matches
 */
export function hybridSearch<T>(
  data: T[],
  query: string,
  options: SearchOptions<T>,
  exactMatchKeys: string[] = []
): T[] {
  if (!query || query.trim().length === 0) {
    return data;
  }

  const trimmedQuery = query.trim().toLowerCase();
  const exactMatches: T[] = [];
  const fuzzyMatches: T[] = [];

  // First, find exact matches (case-insensitive)
  for (const item of data) {
    let isExactMatch = false;

    for (const key of exactMatchKeys) {
      const value = (item as any)[key];
      if (value && typeof value === 'string') {
        if (value.toLowerCase() === trimmedQuery) {
          exactMatches.push(item);
          isExactMatch = true;
          break;
        }
        if (value.toLowerCase().startsWith(trimmedQuery)) {
          exactMatches.push(item);
          isExactMatch = true;
          break;
        }
      }
    }

    if (!isExactMatch) {
      fuzzyMatches.push(item);
    }
  }

  // If no exact matches, do full fuzzy search
  if (exactMatches.length === 0) {
    return fuzzySearch(data, query, options);
  }

  // Otherwise, get fuzzy matches for remaining items and combine
  const fuzzyResults = fuzzySearch(
    fuzzyMatches,
    query,
    options
  ).filter(item => !exactMatches.includes(item));

  return [...exactMatches, ...fuzzyResults];
}

// ============================================================================
// COURSE SEARCH
// ============================================================================

export interface Course {
  code: string;
  name: string;
  rank: string;
  institution: string;
  campus: string;
  category?: 'safe' | 'target' | 'reach' | 'unknown';
  rankNum?: number;
  searchText?: string;
  // Extended fields (optional - may not be available for all courses)
  prerequisites?: string[];
  duration?: string;
  faculty?: string;
  vtacUrl?: string;
  description?: string;
  fullTime?: boolean;
  partTime?: boolean;
}

export interface CourseSearchOptions {
  searchTerm?: string;
  category?: 'all' | 'safe' | 'target' | 'reach';
  atar?: number;
  limit?: number;
}

export interface EnrichedCourse extends Course {
  category: 'safe' | 'target' | 'reach' | 'unknown';
  rankNum: number;
  searchText: string;
}

/**
 * Enriches courses with category and search text
 */
export function enrichCourses(
  courses: Course[],
  atar: number
): EnrichedCourse[] {
  return courses.map((course) => {
    let category: 'safe' | 'target' | 'reach' | 'unknown' = 'unknown';
    let rankNum = 0;

    if (course.rank === 'N/P' || course.rank === 'L/N' || course.rank === 'RC') {
      category = 'unknown';
    } else {
      rankNum = parseFloat(course.rank);
      if (!isNaN(rankNum)) {
        if (rankNum < atar - 5) category = 'safe';
        else if (rankNum > atar + 5) category = 'reach';
        else category = 'target';
      }
    }

    const searchText = `${course.institution} ${course.name} ${course.code}`;

    return { ...course, category, rankNum, searchText };
  });
}

/**
 * Performs word-based exact match search (all terms must be present)
 * Returns courses sorted by relevance (exact matches first, then starts-with, then contains)
 */
function wordBasedSearch(
  courses: EnrichedCourse[],
  searchTerm: string
): EnrichedCourse[] {
  const words = searchTerm.toLowerCase().split(/\s+/).filter(w => w.length >= 2);

  if (words.length === 0) return courses;

  // Filter to courses containing ALL search words
  const matches = courses.filter(course => {
    const text = (course.searchText || '').toLowerCase();
    return words.every(word => text.includes(word));
  });

  if (matches.length === 0) return [];

  // Score by relevance
  const scored = matches.map(course => {
    let score = 0;

    for (const word of words) {
      // Exact match on institution (highest priority)
      if (course.institution.toLowerCase() === word) score += 100;
      // Exact match on course name
      else if (course.name.toLowerCase() === word) score += 90;
      // Starts with institution
      else if (course.institution.toLowerCase().startsWith(word)) score += 50;
      // Starts with name
      else if (course.name.toLowerCase().startsWith(word)) score += 40;
      // Word starts with term in institution
      else if (course.institution.toLowerCase().includes(' ' + word)) score += 20;
      // Word starts with term in name
      else if (course.name.toLowerCase().includes(' ' + word)) score += 15;
      // Contains anywhere
      else score += 1;
    }

    return { course, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.course);
}

/**
 * Searches and filters courses
 */
export function searchCourses(
  courses: Course[],
  options: CourseSearchOptions
): EnrichedCourse[] {
  const { searchTerm, category, atar = 0, limit } = options;

  // Enrich courses first
  const enriched = enrichCourses(courses, atar);

  let results = enriched;

  // Apply search if provided
  if (searchTerm && searchTerm.trim()) {
    const trimmed = searchTerm.trim();

    // Try word-based exact match first (better for multi-word queries like "monash medicine")
    let wordMatches = wordBasedSearch(enriched, trimmed);

    // If word-based search found good results (at least 3 for single words, or any for multi-word),
    // use those. Otherwise fall back to fuzzy search for partial matches.
    const isMultiWord = trimmed.split(/\s+/).filter(w => w.length >= 2).length > 1;

    if (wordMatches.length > 0 && (isMultiWord || wordMatches.length >= 3)) {
      results = wordMatches;
    } else {
      // Fall back to fuzzy search with more lenient threshold
      const fuse = createFuzzySearch(enriched, {
        keys: [
          { name: 'searchText', weight: 2 },
          { name: 'name', weight: 1.5 },
          { name: 'institution', weight: 1.5 },
          { name: 'code', weight: 1 },
        ],
        threshold: 0.4,
        minMatchCharLength: 2,
      });

      const searchResults = fuse.search(trimmed);
      results = searchResults.map((r) => r.item);
    }
  }

  // Apply category filter
  if (category && category !== 'all') {
    results = results.filter((c) => c.category === category);
  }

  // Sort by rank (descending) if not searching, otherwise keep relevance order
  if (!searchTerm) {
    results.sort((a, b) => {
      if (a.category === 'unknown' && b.category !== 'unknown') return 1;
      if (a.category !== 'unknown' && b.category === 'unknown') return -1;
      return b.rankNum - a.rankNum;
    });
  }

  // Apply limit if specified
  if (limit && limit > 0) {
    results = results.slice(0, limit);
  }

  return results;
}

// ============================================================================
// SUBJECT SEARCH
// ============================================================================

export interface Subject {
  code: string;
  name: string;
  mean?: number;
  stdev?: number;
  scaling?: { [key: string]: number };
}

export interface SubjectSearchOptions {
  query: string;
  aliases?: Record<string, string[]>;
  limit?: number;
}

/**
 * Normalises query for subject search (handles aliases, abbreviations)
 */
export function normaliseSubjectQuery(
  query: string,
  aliases?: Record<string, string[]>
): { query: string; aliasTargets: string[] } {
  const normalisedQuery = query.trim().toLowerCase();
  const aliasTargets: string[] = [];

  if (aliases) {
    for (const [alias, targets] of Object.entries(aliases)) {
      if (normalisedQuery === alias || normalisedQuery.startsWith(alias + ' ')) {
        aliasTargets.push(...targets);
      }
    }
  }

  return { query: normalisedQuery, aliasTargets };
}

/**
 * Searches subjects with alias support and fuzzy matching
 */
export function searchSubjects(
  subjects: Subject[],
  options: SubjectSearchOptions
): Subject[] {
  const { query, aliases, limit = 50 } = options;

  if (!query || query.trim().length === 0) {
    return subjects.slice(0, limit);
  }

  const { query: normalisedQuery, aliasTargets } = normaliseSubjectQuery(
    query,
    aliases
  );

  // Create a search text for each subject
  const enriched = subjects.map((s) => ({
    ...s,
    searchText: `${s.name} ${s.code}`,
  }));

  // Calculate priority scores for sorting
  const scored = enriched.map((subject) => {
    let priority = 0;

    const nameLower = subject.name.toLowerCase();
    const codeLower = subject.code.toLowerCase();

    // Exact alias match - highest priority
    for (const target of aliasTargets) {
      if (nameLower === target.toLowerCase()) {
        priority += 100;
      }
    }

    // Starts with alias target
    for (const target of aliasTargets) {
      if (nameLower.startsWith(target.toLowerCase())) {
        priority += 50;
      }
    }

    // Exact name match
    if (nameLower === normalisedQuery) {
      priority += 80;
    }

    // Starts with name
    if (nameLower.startsWith(normalisedQuery)) {
      priority += 40;
    }

    // Exact code match
    if (codeLower === normalisedQuery) {
      priority += 70;
    }

    // Starts with code
    if (codeLower.startsWith(normalisedQuery)) {
      priority += 30;
    }

    return { subject, priority };
  });

  // Separate into high priority (exact matches) and others
  const highPriority = scored.filter((s) => s.priority > 0);
  const lowPriority = scored.filter((s) => s.priority === 0);

  // Sort high priority by score descending
  highPriority.sort((a, b) => b.priority - a.priority);

  // For low priority, use fuzzy search
  let fuzzyResults: Subject[] = [];
  if (lowPriority.length > 0) {
    const fuse = createFuzzySearch(
      lowPriority.map((s) => s.subject),
      {
        keys: [
          { name: 'name', weight: 2 },
          { name: 'code', weight: 1 },
        ],
        threshold: 0.3,
        minMatchCharLength: 2,
      }
    );

    fuzzyResults = fuse
      .search(normalisedQuery)
      .map((r) => ({ item: r.item, score: r.score }))
      .sort((a, b) => (a.score || 1) - (b.score || 1))
      .map((r) => r.item);
  }

  // Combine results
  const results = [
    ...highPriority.map((s) => s.subject),
    ...fuzzyResults,
  ];

  return results.slice(0, limit);
}


  const trimmedQuery = query.trim().toLowerCase();
  const exactMatches: T[] = [];
  const fuzzyMatches: T[] = [];

  // First, find exact matches (case-insensitive)
  for (const item of data) {
    let isExactMatch = false;

    for (const key of exactMatchKeys) {
      const value = (item as any)[key];
      if (value && typeof value === 'string') {
        if (value.toLowerCase() === trimmedQuery) {
          exactMatches.push(item);
          isExactMatch = true;
          break;
        }
        if (value.toLowerCase().startsWith(trimmedQuery)) {
          exactMatches.push(item);
          isExactMatch = true;
          break;
        }
      }
    }

    if (!isExactMatch) {
      fuzzyMatches.push(item);
    }
  }

  // If no exact matches, do full fuzzy search
  if (exactMatches.length === 0) {
    return fuzzySearch(data, query, options);
  }

  // Otherwise, get fuzzy matches for remaining items and combine
  const fuzzyResults = fuzzySearch(
    fuzzyMatches,
    query,
    options
  ).filter(item => !exactMatches.includes(item));

  return [...exactMatches, ...fuzzyResults];
}

// ============================================================================
// COURSE SEARCH
// ============================================================================

export interface Course {
  code: string;
  name: string;
  rank: string;
  institution: string;
  campus: string;
  category?: 'safe' | 'target' | 'reach' | 'unknown';
  rankNum?: number;
  searchText?: string;
  // Extended fields (optional - may not be available for all courses)
  prerequisites?: string[];
  duration?: string;
  faculty?: string;
  vtacUrl?: string;
  description?: string;
  fullTime?: boolean;
  partTime?: boolean;
}

export interface CourseSearchOptions {
  searchTerm?: string;
  category?: 'all' | 'safe' | 'target' | 'reach';
  atar?: number;
  limit?: number;
}

export interface EnrichedCourse extends Course {
  category: 'safe' | 'target' | 'reach' | 'unknown';
  rankNum: number;
  searchText: string;
}

/**
 * Enriches courses with category and search text
 */
export function enrichCourses(
  courses: Course[],
  atar: number
): EnrichedCourse[] {
  return courses.map((course) => {
    let category: 'safe' | 'target' | 'reach' | 'unknown' = 'unknown';
    let rankNum = 0;

    if (course.rank === 'N/P' || course.rank === 'L/N' || course.rank === 'RC') {
      category = 'unknown';
    } else {
      rankNum = parseFloat(course.rank);
      if (!isNaN(rankNum)) {
        if (rankNum < atar - 5) category = 'safe';
        else if (rankNum > atar + 5) category = 'reach';
        else category = 'target';
      }
    }

    const searchText = `${course.institution} ${course.name} ${course.code}`;

    return { ...course, category, rankNum, searchText };
  });
}

/**
 * Performs word-based exact match search (all terms must be present)
 * Returns courses sorted by relevance (exact matches first, then starts-with, then contains)
 */
function wordBasedSearch(
  courses: EnrichedCourse[],
  searchTerm: string
): EnrichedCourse[] {
  const words = searchTerm.toLowerCase().split(/\s+/).filter(w => w.length >= 2);

  if (words.length === 0) return courses;

  // Filter to courses containing ALL search words
  const matches = courses.filter(course => {
    const text = (course.searchText || '').toLowerCase();
    return words.every(word => text.includes(word));
  });

  if (matches.length === 0) return [];

  // Score by relevance
  const scored = matches.map(course => {
    let score = 0;

    for (const word of words) {
      // Exact match on institution (highest priority)
      if (course.institution.toLowerCase() === word) score += 100;
      // Exact match on course name
      else if (course.name.toLowerCase() === word) score += 90;
      // Starts with institution
      else if (course.institution.toLowerCase().startsWith(word)) score += 50;
      // Starts with name
      else if (course.name.toLowerCase().startsWith(word)) score += 40;
      // Word starts with term in institution
      else if (course.institution.toLowerCase().includes(' ' + word)) score += 20;
      // Word starts with term in name
      else if (course.name.toLowerCase().includes(' ' + word)) score += 15;
      // Contains anywhere
      else score += 1;
    }

    return { course, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.course);
}

/**
 * Searches and filters courses
 */
export function searchCourses(
  courses: Course[],
  options: CourseSearchOptions
): EnrichedCourse[] {
  const { searchTerm, category, atar = 0, limit } = options;

  // Enrich courses first
  const enriched = enrichCourses(courses, atar);

  let results = enriched;

  // Apply search if provided
  if (searchTerm && searchTerm.trim()) {
    const trimmed = searchTerm.trim();

    // Try word-based exact match first (better for multi-word queries like "monash medicine")
    let wordMatches = wordBasedSearch(enriched, trimmed);

    // If word-based search found good results (at least 3 for single words, or any for multi-word),
    // use those. Otherwise fall back to fuzzy search for partial matches.
    const isMultiWord = trimmed.split(/\s+/).filter(w => w.length >= 2).length > 1;

    if (wordMatches.length > 0 && (isMultiWord || wordMatches.length >= 3)) {
      results = wordMatches;
    } else {
      // Fall back to fuzzy search with more lenient threshold
      const fuse = createFuzzySearch(enriched, {
        keys: [
          { name: 'searchText', weight: 2 },
          { name: 'name', weight: 1.5 },
          { name: 'institution', weight: 1.5 },
          { name: 'code', weight: 1 },
        ],
        threshold: 0.4,
        minMatchCharLength: 2,
      });

      const searchResults = fuse.search(trimmed);
      results = searchResults.map((r) => r.item);
    }
  }

  // Apply category filter
  if (category && category !== 'all') {
    results = results.filter((c) => c.category === category);
  }

  // Sort by rank (descending) if not searching, otherwise keep relevance order
  if (!searchTerm) {
    results.sort((a, b) => {
      if (a.category === 'unknown' && b.category !== 'unknown') return 1;
      if (a.category !== 'unknown' && b.category === 'unknown') return -1;
      return b.rankNum - a.rankNum;
    });
  }

  // Apply limit if specified
  if (limit && limit > 0) {
    results = results.slice(0, limit);
  }

  return results;
}

// ============================================================================
// SUBJECT SEARCH
// ============================================================================

export interface Subject {
  code: string;
  name: string;
  mean?: number;
  stdev?: number;
  scaling?: { [key: string]: number };
}

export interface SubjectSearchOptions {
  query: string;
  aliases?: Record<string, string[]>;
  limit?: number;
}

/**
 * Normalises query for subject search (handles aliases, abbreviations)
 */
export function normalizeSubjectQuery(
  query: string,
  aliases?: Record<string, string[]>
): { query: string; aliasTargets: string[] } {
  const normalizedQuery = query.trim().toLowerCase();
  const aliasTargets: string[] = [];

  if (aliases) {
    for (const [alias, targets] of Object.entries(aliases)) {
      if (normalizedQuery === alias || normalizedQuery.startsWith(alias + ' ')) {
        aliasTargets.push(...targets);
      }
    }
  }

  return { query: normalizedQuery, aliasTargets };
}

/**
 * Searches subjects with alias support and fuzzy matching
 */
export function searchSubjects(
  subjects: Subject[],
  options: SubjectSearchOptions
): Subject[] {
  const { query, aliases, limit = 50 } = options;

  if (!query || query.trim().length === 0) {
    return subjects.slice(0, limit);
  }

  const { query: normalizedQuery, aliasTargets } = normalizeSubjectQuery(
    query,
    aliases
  );

  // Create a search text for each subject
  const enriched = subjects.map((s) => ({
    ...s,
    searchText: `${s.name} ${s.code}`,
  }));

  // Calculate priority scores for sorting
  const scored = enriched.map((subject) => {
    let priority = 0;

    const nameLower = subject.name.toLowerCase();
    const codeLower = subject.code.toLowerCase();

    // Exact alias match - highest priority
    for (const target of aliasTargets) {
      if (nameLower === target.toLowerCase()) {
        priority += 100;
      }
    }

    // Starts with alias target
    for (const target of aliasTargets) {
      if (nameLower.startsWith(target.toLowerCase())) {
        priority += 50;
      }
    }

    // Exact name match
    if (nameLower === normalizedQuery) {
      priority += 80;
    }

    // Starts with name
    if (nameLower.startsWith(normalizedQuery)) {
      priority += 40;
    }

    // Exact code match
    if (codeLower === normalizedQuery) {
      priority += 70;
    }

    // Starts with code
    if (codeLower.startsWith(normalizedQuery)) {
      priority += 30;
    }

    return { subject, priority };
  });

  // Separate into high priority (exact matches) and others
  const highPriority = scored.filter((s) => s.priority > 0);
  const lowPriority = scored.filter((s) => s.priority === 0);

  // Sort high priority by score descending
  highPriority.sort((a, b) => b.priority - a.priority);

  // For low priority, use fuzzy search
  let fuzzyResults: Subject[] = [];
  if (lowPriority.length > 0) {
    const fuse = createFuzzySearch(
      lowPriority.map((s) => s.subject),
      {
        keys: [
          { name: 'name', weight: 2 },
          { name: 'code', weight: 1 },
        ],
        threshold: 0.3,
        minMatchCharLength: 2,
      }
    );

    fuzzyResults = fuse
      .search(normalizedQuery)
      .map((r) => ({ item: r.item, score: r.score }))
      .sort((a, b) => (a.score || 1) - (b.score || 1))
      .map((r) => r.item);
  }

  // Combine results
  const results = [
    ...highPriority.map((s) => s.subject),
    ...fuzzyResults,
  ];

  return results.slice(0, limit);
}

// ============================================================================
// DEBOUNCE UTILITY
// ============================================================================

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function debounced(...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, wait);
  };
}

// ============================================================================
// STUDENT SEARCH (Server-side optimization)
// ============================================================================

export interface Student {
  name: string;
  school: string;
  subjects: { subject: string; score: number }[];
  year?: number;
}

/**
 * Checks if a student matches the search query
 */
export function studentMatchesQuery(
  student: Student,
  query: string
): boolean {
  const nameLower = student.name.toLowerCase();
  const schoolLower = student.school.toLowerCase();
  const queryLower = query.toLowerCase();

  // Direct substring match in name or school
  if (nameLower.includes(queryLower) || schoolLower.includes(queryLower)) {
    return true;
  }

  // Check subjects
  if (student.subjects.some(s => s.subject.toLowerCase().includes(queryLower))) {
    return true;
  }

  // Multi-word match (handles "Smith John" finding "John Smith")
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 0);
  if (queryWords.length > 1) {
    const nameWords = nameLower.split(/[\s,]+/).filter((w) => w.length > 0);
    const schoolWords = schoolLower.split(/[\s,]+/).filter((w) => w.length > 0);
    
    const allWordsMatch = queryWords.every((qw) =>
      nameWords.some((nw) => nw.includes(qw)) || 
      schoolWords.some((sw) => sw.includes(qw)) ||
      student.subjects.some(s => s.subject.toLowerCase().includes(qw))
    );
    if (allWordsMatch) {
      return true;
    }
  }

  return false;
}

/**
 * Sorts students by year (descending) then name (alphabetical)
 */
export function sortStudents(students: Student[]): Student[] {
  return students.sort((a, b) => {
    if (b.year !== a.year) {
      return (b.year || 0) - (a.year || 0);
    }
    return a.name.localeCompare(b.name);
  });
}
