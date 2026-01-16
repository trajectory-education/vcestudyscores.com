import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Use service role for migration

const supabase = createClient(supabaseUrl, supabaseKey);

const DATA_DIR = path.join(process.cwd(), 'src/data');

async function migrate() {
  console.log('Starting migration...');

  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith('students_') && f.endsWith('.json'));

  for (const file of files) {
    const year = parseInt(file.replace('students_', '').replace('.json', ''));
    console.log(`Processing year ${year}...`);

    const rawData = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
    const students = JSON.parse(rawData);

    const BATCH_SIZE = 1000;
    for (let i = 0; i < students.length; i += BATCH_SIZE) {
      const batch = students.slice(i, i + BATCH_SIZE).map((s: any) => ({
        name: s.name,
        school: s.school,
        year: s.year || year,
        subjects: s.subjects,
        // Combined search text for full text search efficiency
        search_text: `${s.name} ${s.school} ${s.subjects.map((sub: any) => sub.subject).join(' ')}`.toLowerCase()
      }));

      const { error } = await supabase
        .schema('vce_study_scores')
        .from('scores')
        .insert(batch);

      if (error) {
        console.error(`Error inserting batch for ${year}:`, error);
      } else {
        console.log(`Inserted ${i + batch.length}/${students.length} for ${year}`);
      }
    }
  }

  console.log('Migration complete!');
}

migrate().catch(console.error);
