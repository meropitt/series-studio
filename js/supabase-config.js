// ضع بيانات مشروعك من Supabase Dashboard > Project Settings > API
// SUPABASE_ANON_KEY هو مفتاح "عام" آمن للنشر في كود الواجهة —
// لا تضع هنا أبدًا الـ service_role key أو مفاتيح ElevenLabs / D-ID.

const SUPABASE_URL = "https://drxlcsykfmarmztndlxl.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY = "sb_publishable_yGvD2BPHgi5pyniJmgHLCA_tQEDVTph";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
