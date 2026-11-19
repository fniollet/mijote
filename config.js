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
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
};
