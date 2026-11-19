// ─────────────────────────────────────────────────────────────
// Configuration de la synchronisation familiale (Supabase)
//
// Laissez vide pour utiliser Mijoté en mode « cet appareil ».
// Pour synchroniser toute la famille, collez ici l'URL et la clé
// « anon public » de votre projet Supabase (voir README, étape 3).
// La clé anon est PUBLIQUE par conception : la sécurité est assurée
// par les politiques RLS du fichier supabase/schema.sql.
// ⚠️ Ne mettez JAMAIS la clé « service_role » ici.
// ─────────────────────────────────────────────────────────────
window.MIJOTE_CONFIG = {
  SUPABASE_URL: 'https://nxbukqljwdqilmkkndvd.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54YnVrcWxqd2RxaWxta2tuZHZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwNjYwMjcsImV4cCI6MjExMDY0MjAyN30.9tRn8R-R_esP2G-WafC-Gh3tqH89LoBqo9C2_1dvVvI',
};
