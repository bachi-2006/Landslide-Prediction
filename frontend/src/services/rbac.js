/**
 * NE-SHIELD Role-Based Access Control (RBAC)
 * Roles:
 * 1. citizen: Public citizen viewer.
 * 2. field_officer: SDRF / District Field Patrol.
 * 3. admin: Disaster Management HQ / SDMA / NDMA.
 */

export const ROLES = {
    CITIZEN: 'citizen',
    FIELD_OFFICER: 'field_officer',
    ADMIN: 'admin'
};

export const ROLE_CONFIG = {
    [ROLES.CITIZEN]: {
        label: 'Citizen / Community',
        badge: 'Public Citizen',
        color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
        permissions: {
            canSimulate: false,
            canBroadcast: false,
            canTriggerHardware: false,
            canVerifyReports: false,
            canReportField: false,
            canReportCitizen: true,
            canViewAnalytics: true
        }
    },
    [ROLES.FIELD_OFFICER]: {
        label: 'Field Officer (SDRF / Patrol)',
        badge: 'Verified Officer',
        color: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
        permissions: {
            canSimulate: false,
            canBroadcast: false,
            canTriggerHardware: true,
            canVerifyReports: true,
            canReportField: true,
            canReportCitizen: true,
            canViewAnalytics: true
        }
    },
    [ROLES.ADMIN]: {
        label: 'Disaster HQ Admin (NDMA)',
        badge: 'HQ Authority',
        color: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
        permissions: {
            canSimulate: true,
            canBroadcast: true,
            canTriggerHardware: true,
            canVerifyReports: true,
            canReportField: true,
            canReportCitizen: true,
            canViewAnalytics: true
        }
    }
};

const STORAGE_KEY = 'ne_shield_active_role';

export const rbac = {
    getCurrentRole: () => {
        return localStorage.getItem(STORAGE_KEY) || ROLES.CITIZEN;
    },
    setRole: (role) => {
        if (ROLE_CONFIG[role]) {
            localStorage.setItem(STORAGE_KEY, role);
            window.dispatchEvent(new CustomEvent('ne_shield_role_changed', { detail: role }));
        }
    },
    getConfig: (role) => {
        return ROLE_CONFIG[role] || ROLE_CONFIG[ROLES.CITIZEN];
    },
    hasPermission: (role, permission) => {
        const config = ROLE_CONFIG[role] || ROLE_CONFIG[ROLES.CITIZEN];
        return !!config.permissions[permission];
    }
};
