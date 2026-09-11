// ضع بيانات مشروعك من Supabase Dashboard > Project Settings > API
// SUPABASE_ANON_KEY هو مفتاح "عام" آمن للنشر في كود الواجهة —
// لا تضع هنا أبدًا الـ service_role key أو مفاتيح ElevenLabs / D-ID.

const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
