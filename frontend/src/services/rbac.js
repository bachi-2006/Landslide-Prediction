/**
 * NE-SHIELD Role-Based Access Control (RBAC)
 * Roles:
 * 1. citizen: Public citizen viewer / hazard reporter.
 * 2. field_officer: SDRF / District Field Patrol — triage and resolve.
 * 3. admin: Disaster Management HQ / SDMA / NDMA — full command access.
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
            // Broadcast & hardware
            canSimulate: false,
            canBroadcast: false,
            canTriggerHardware: false,
            // Reporting
            canReportField: false,
            canReportCitizen: true,
            // Incident management — citizens have NO management rights
            canAssignOfficer: false,
            canResolveIncident: false,
            canDeleteIncident: false,
            canCreateAdminIncident: false,
            // Filtering
            canViewAssignedOnly: false,
            canViewAllIncidents: false,
            // Map features — citizens do NOT see analytics calculations
            canViewAnalytics: false,
            canViewOfficerLayer: false,
            // General
            canVerifyReports: false,
            canViewAnalyticsDashboard: false,
        }
    },
    [ROLES.FIELD_OFFICER]: {
        label: 'Field Officer (SDRF / Patrol)',
        badge: 'Verified Officer',
        color: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
        permissions: {
            // Broadcast & hardware
            canSimulate: false,
            canBroadcast: false,
            canTriggerHardware: true,
            // Reporting
            canReportField: true,
            canReportCitizen: true,
            // Incident management — officers can resolve but NOT assign or delete
            canAssignOfficer: false,
            canResolveIncident: true,
            canDeleteIncident: false,
            canCreateAdminIncident: false,
            // Filtering — officers see only their assigned incidents by default
            canViewAssignedOnly: true,
            canViewAllIncidents: false,
            // Map features — officers see full analytics
            canViewAnalytics: true,
            canViewOfficerLayer: false,
            // General
            canVerifyReports: true,
            canViewAnalyticsDashboard: true,
        }
    },
    [ROLES.ADMIN]: {
        label: 'Disaster HQ Admin (NDMA)',
        badge: 'HQ Authority',
        color: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
        permissions: {
            // Broadcast & hardware
            canSimulate: true,
            canBroadcast: true,
            canTriggerHardware: true,
            // Reporting
            canReportField: true,
            canReportCitizen: true,
            // Incident management — admin has full CRUD
            canAssignOfficer: true,
            canResolveIncident: true,
            canDeleteIncident: true,
            canCreateAdminIncident: true,
            // Filtering — admin sees all incidents
            canViewAssignedOnly: false,
            canViewAllIncidents: true,
            // Map features — admin sees analytics + officer deployment layer
            canViewAnalytics: true,
            canViewOfficerLayer: true,
            // General
            canVerifyReports: true,
            canViewAnalyticsDashboard: true,
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
