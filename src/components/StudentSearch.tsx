import { useState, useEffect } from 'react';
import type { Student } from '../types';

export default function StudentSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [results, setResults] = useState<Student[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [years, setYears] = useState<string[]>([]);

  useEffect(() => {
      fetch('/api/years')
          .then(res => res.json())
          .then(data => setYears(data.years || []))
          .catch(() => setYears(['2025', '2024', '2023']));
  }, []);

  useEffect(() => {
      if (searchTerm.length < 3) {
          setResults([]);
          return;
      }

      setIsSearching(true);
      const timer = setTimeout(async () => {
          try {
              const res = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}&year=${selectedYear}`);
              if (res.ok) {
                  const data = await res.json();
                  setResults(data.results);
              }
          } catch (error) {
              console.error("Search failed", error);
          } finally {
              setIsSearching(false);
          }
      }, 300);

      return () => clearTimeout(timer);
  }, [searchTerm, selectedYear]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Search Controls */}
      <div className="sticky top-6 z-10 mb-12">
        <div className="bg-white/80 backdrop-blur-xl border border-slate-200 shadow-2xl shadow-slate-200/50 rounded-2xl p-2 flex flex-col md:flex-row gap-2">
          <div className="relative flex-grow">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search student, school, or subject..."
              className="block w-full pl-11 pr-4 py-4 border-none bg-transparent text-slate-900 placeholder-slate-400 focus:ring-0 text-lg font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {isSearching && (
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                <svg className="animate-spin h-5 w-5 text-trajectory-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            )}
          </div>
          
          <div className="h-px md:h-8 md:w-px bg-slate-200 my-auto"></div>
          
          <div className="flex items-center px-2">
            <select 
              className="w-full md:w-32 py-4 px-2 bg-transparent border-none text-sm font-bold text-slate-600 focus:ring-0 cursor-pointer appearance-none text-center"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              <option value="">All Years</option>
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <div className="pointer-events-none pr-2">
               <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
               </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-6">
        {results.map((student, idx) => (
          <div 
            key={`${student.name}-${student.year}-${idx}`} 
            className="group bg-white border border-slate-100 rounded-2xl p-6 hover:border-trajectory-200 hover:shadow-xl hover:shadow-trajectory-500/5 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
            style={{ animationDelay: `${Math.min(idx * 50, 500)}ms` }}
          >
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-xl font-bold text-slate-900 group-hover:text-trajectory-600 transition-colors">
                    {student.name}
                  </h3>
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    {student.year}
                  </span>
                </div>
                <p className="text-slate-400 font-medium text-sm">
                  {student.school}
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {student.subjects.map((sub, sIdx) => (
                <div 
                  key={sIdx} 
                  className={`flex justify-between items-center px-4 py-3 rounded-xl border transition-colors ${
                    sub.score === 50 
                    ? 'bg-trajectory-500 border-trajectory-500 text-white shadow-lg shadow-trajectory-500/20' 
                    : 'bg-white border-slate-100 group-hover:border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="text-sm font-bold truncate mr-3" title={sub.subject}>
                    {sub.subject}
                  </span>
                  <span className={`text-lg font-black font-mono ${sub.score === 50 ? 'text-white' : 'text-trajectory-500'}`}>
                    {sub.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
        
        {!isSearching && results.length === 0 && searchTerm.length >= 3 && (
          <div className="text-center py-20 animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="h-10 w-10 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">No matches found</h3>
            <p className="text-slate-400 max-w-xs mx-auto">
              We couldn't find any results for "{searchTerm}". Try a different name or school.
            </p>
          </div>
        )}
        
        {!isSearching && searchTerm.length > 0 && searchTerm.length < 3 && (
          <div className="text-center py-12">
            <p className="text-slate-300 font-medium animate-pulse">Keep typing...</p>
          </div>
        )}
        
        {!isSearching && searchTerm.length === 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 opacity-40 grayscale group-hover:grayscale-0 transition-all duration-1000">
             {[...Array(8)].map((_, i) => (
               <div key={i} className="h-32 bg-slate-50 border border-slate-100 rounded-2xl border-dashed"></div>
             ))}
          </div>
        )}
      </div>
    </div>
  );
}
