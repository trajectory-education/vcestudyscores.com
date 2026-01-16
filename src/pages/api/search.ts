import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import {
  validateYearParam,
  validateQueryParam,
  withSecurityHeaders,
} from '../../lib/validation';

const MAX_TOTAL_RESULTS = 100;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const queryParam = url.searchParams.get('q');
  const yearParam = url.searchParams.get('year') || '';

  // Validate year parameter
  const yearValidation = validateYearParam(yearParam);
  if (!yearValidation.valid) {
    return yearValidation.error!;
  }
  const { year } = yearValidation;

  // Validate query parameter
  const queryValidation = validateQueryParam(queryParam);
  if (!queryValidation.valid) {
    return queryValidation.error!;
  }
  const query = queryValidation.query || '';

  if (query.length < 3) {
    return withSecurityHeaders(new Response(JSON.stringify({ results: [] }), { status: 200 }));
  }

  try {
    let supabaseQuery = supabase
      .schema('vce_study_scores')
      .from('scores')
      .select('*')
      .order('year', { ascending: false })
      .order('name', { ascending: true })
      .limit(MAX_TOTAL_RESULTS);

    if (year) {
      supabaseQuery = supabaseQuery.eq('year', year);
    }

    // Use full-text search for performance on 360k+ records
    const searchTerms = query.trim().split(/\s+/).join(' & ');
    supabaseQuery = supabaseQuery.textSearch('search_text', searchTerms);

    const { data, error } = await supabaseQuery;

    if (error) throw error;

    const response = new Response(JSON.stringify({
      results: data,
      query,
      total: data.length
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60'
      }
    });

    return withSecurityHeaders(response);
  } catch (err) {
    return new Response(JSON.stringify({ results: [], error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
