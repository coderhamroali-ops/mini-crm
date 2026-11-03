import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  throw new Error('Заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env')
}

// Во фронтенде только публичный anon-ключ. Все права проверяет база (RLS).
export const supabase = createClient(url, anonKey)
