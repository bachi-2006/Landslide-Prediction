import { createClient } from '@supabase/supabase-js';
import { notificationService } from './notifications';

const url = import.meta.env.VITE_SUPABASE_URL || 'https://vefivqfyceclhkfuzxrp.supabase.co';
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ZACmfkAWA_fRH_gnV5V8zA_9T13em5j';

export const supabase = url && publishableKey ? createClient(url, publishableKey) : null;

export const subscribeToMapUpdates = (onUpdate) => {
    if (!supabase) return () => {};

    const channel = supabase
        .channel('ne-shield-mobile-map-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'district_risk' }, onUpdate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, onUpdate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, onUpdate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, (payload) => {
            if (payload?.new) {
                // Trigger live alert popup & notification immediately on mobile
                try {
                    notificationService.notify({
                        title: `🚨 ${payload.new.level || 'CRITICAL'} DISASTER ALERT`,
                        body: payload.new.message || 'Immediate evacuation order issued.',
                        level: payload.new.level || 'Critical',
                        sound: true
                    });
                } catch (e) {}
            }
            onUpdate(payload);
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
};
