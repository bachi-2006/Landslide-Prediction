import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || 'https://vefivqfyceclhkfuzxrp.supabase.co';
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ZACmfkAWA_fRH_gnV5V8zA_9T13em5j';

export const supabase = url && publishableKey ? createClient(url, publishableKey) : null;

export const subscribeToMapUpdates = (onUpdate) => {
    if (!supabase) return () => {};

    const channel = supabase
        .channel('ne-shield-map-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'district_risk' }, onUpdate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, onUpdate)
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
};
