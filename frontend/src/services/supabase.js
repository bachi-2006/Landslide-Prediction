import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

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
