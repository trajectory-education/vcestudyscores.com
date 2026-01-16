import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { withSecurityHeaders } from '../../lib/validation';

export const GET: APIRoute = async () => {
  try {
    const { data, error } = await supabase
      .schema('vce_study_scores')
      .from('scores')
      .select('year')
      .order('year', { ascending: false });

    if (error) throw error;

    // Extract unique years
    const uniqueYears = [...new Set(data.map(item => item.year.toString()))];

    const response = new Response(JSON.stringify({ years: uniqueYears }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      }
    });

    return withSecurityHeaders(response);
  } catch (err) {
    return new Response(JSON.stringify({ years: ['2025', '2024', '2023'], error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
