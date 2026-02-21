// ============================================================
// ASCEND — Supabase Client
// Replace SUPABASE_URL and SUPABASE_ANON_KEY with your values
// from: Project Settings → API in your Supabase dashboard
// ============================================================

const SUPABASE_URL = 'https://egxdmneaoabsaolfppge.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVneGRtbmVhb2Fic2FvbGZwcGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODgzMjksImV4cCI6MjA4NzI2NDMyOX0.Q-KvjoMHzbJ5Dnp9GntfaZxAQFbWFnNDgUepUdeNbvY'; // ← cole o Anon Key completo aqui

// Import Supabase from CDN (loaded in HTML via script tag)
const { createClient } = supabase;

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});

// Expose globally
window.supabaseClient = supabaseClient;
