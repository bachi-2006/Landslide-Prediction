import React, { useState } from 'react';
import RiskMap from './components/RiskMap';
import DistrictPanel from './components/DistrictPanel';
import IncidentForm from './components/IncidentForm';
import { AlertTriangle, Map as MapIcon, PlusCircle } from 'lucide-react';
import { requestNotificationPermission } from './services/firebase';

const App = () => {
    const [selectedDistrict, setSelectedDistrict] = useState(null);
    const [showIncidentForm, setShowIncidentForm] = useState(false);

    React.useEffect(() => {
        // Initialize Firebase notifications on load
        requestNotificationPermission().then(token => {
            if (token) console.log("FCM Token registered:", token);
        });
    }, []);

    return (
        <div className="flex h-screen w-full overflow-hidden">
            {/* Sidebar/Header area is integrated into a floating header for a modern look */}
            <div className="fixed top-4 left-4 z-[1000] flex gap-3">
                <div className="bg-white shadow-lg rounded-full px-6 py-3 flex items-center gap-3 border border-slate-200">
                    <AlertTriangle className="text-blue-600" size={24} />
                    <h1 className="text-xl font-bold text-slate-800 tracking-tight">NE-SHIELD</h1>
                </div>
                <button
                    onClick={() => setShowIncidentForm(true)}
                    className="bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2 px-5 font-semibold"
                >
                    <PlusCircle size={24} />
                    <span>Report Incident</span>
                </button>
            </div>

            {/* Main Map View */}
            <div className="flex-1 relative">
                <RiskMap selectedDistrict={selectedDistrict} setSelectedDistrict={setSelectedDistrict} />
            </div>

            {/* Right Detail Panel */}
            {selectedDistrict && (
                <DistrictPanel
                    district={selectedDistrict}
                    onClose={() => setSelectedDistrict(null)}
                />
            )}

            {/* Incident Report Modal */}
            {showIncidentForm && (
                <IncidentForm onClose={() => setShowIncidentForm(false)} />
            )}
        </div>
    );
};

export default App;
