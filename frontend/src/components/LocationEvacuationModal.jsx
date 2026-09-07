import React, { useState } from 'react';
import { routeService } from '../services/api';

export default function LocationEvacuationModal({ isOpen, onClose, onRouteFound, userLocation }) {
  const [locationQuery, setLocationQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [checkinDone, setCheckinDone] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!locationQuery.trim() && !userLocation) {
      setError('Please enter your current location or landmark');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        location_query: locationQuery,
        user_lat: userLocation ? userLocation[0] : null,
        user_lon: userLocation ? userLocation[1] : null,
      };
      const res = await routeService.calculateEvacuation(payload);
      const data = res.data || res;
      setResult(data);
      if (data.route && onRouteFound) {
        onRouteFound(data.route, data.shelter);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to calculate evacuation route. Please try another nearby landmark.');
    } finally {
      setLoading(false);
    }
  };

  const useCurrentGps = () => {
    if (userLocation) {
      setLocationQuery(`GPS: ${userLocation[0].toFixed(4)}, ${userLocation[1].toFixed(4)}`);
    } else {
      setError('GPS signal not available. Please type your city or area.');
    }
  };

  const getRiskBadge = (level) => {
    switch (level?.toLowerCase()) {
      case 'high':
      case 'severe':
      case 'critical':
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      case 'moderate':
      case 'medium':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      default:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0d1527] border border-slate-700/60 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 text-slate-100">
        
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xl text-amber-400">
              🚨
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">Emergency Evacuation &amp; Shelter Finder</h2>
              <p className="text-xs text-slate-400">Location-based hazard prediction and uphill safe path generator</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-2 hover:bg-slate-800 rounded-lg"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSearch} className="space-y-3 mb-6">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Your Location / Village / Landmark in NER
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. Police Bazar Shillong, Sohra, Kohima War Cemetery, Aizawl..."
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              className="flex-1 bg-slate-900/90 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
            <button
              type="button"
              onClick={useCurrentGps}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium text-slate-300 transition flex items-center gap-1.5"
              title="Use current GPS pin"
            >
              📍 GPS
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 font-bold rounded-xl text-sm transition shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? 'Analyzing...' : 'Find Safe Route'}
            </button>
          </div>
          {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
        </form>

        {result && (
          <div className="space-y-4 animate-fade-in">
            <div className={`p-4 rounded-xl border flex items-start gap-3.5 ${getRiskBadge(result.risk_level)}`}>
              <span className="text-2xl">
                {result.disaster_predicted ? '⚠️' : '🛡️'}
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm uppercase tracking-wider">
                    Hazard Status: {result.disaster_predicted ? 'Active Risk Detected' : 'No Immediate Critical Threat'}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-slate-900/60">
                    Risk Level: {result.risk_level?.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-200">
                  {result.warning_message}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Pinned to: <strong className="text-slate-200">{result.user_coords?.name}</strong> (Elevation: {result.user_coords?.elevation}m)
                </p>
              </div>
            </div>

            {result.shelter && (
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏕️</span>
                    <div>
                      <h3 className="text-sm font-bold text-white">Assigned Safe Haven Shelter</h3>
                      <p className="text-xs text-slate-400">{result.shelter.name} — {result.shelter.type}</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-1 rounded-lg">
                    {result.shelter.distance_km} km away
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-xs">
                  <div className="bg-slate-800/60 p-2 rounded-lg">
                    <span className="text-slate-400 block text-[10px]">Capacity</span>
                    <span className="text-slate-200 font-semibold">{result.shelter.capacity} people</span>
                  </div>
                  <div className="bg-slate-800/60 p-2 rounded-lg">
                    <span className="text-slate-400 block text-[10px]">Current Occupancy</span>
                    <span className="text-slate-200 font-semibold">{result.shelter.current_occupancy} people</span>
                  </div>
                  <div className="bg-slate-800/60 p-2 rounded-lg">
                    <span className="text-slate-400 block text-[10px]">Elevation</span>
                    <span className="text-slate-200 font-semibold">{result.shelter.elevation}m</span>
                  </div>
                  <div className="bg-slate-800/60 p-2 rounded-lg">
                    <span className="text-slate-400 block text-[10px]">Helpline</span>
                    <span className="text-amber-300 font-mono font-semibold">{result.shelter.contact}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {result.shelter.amenities?.map((amenity, i) => (
                    <span key={i} className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700/50">
                      ✓ {amenity}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.route && (
              <div className="bg-gradient-to-br from-blue-950/30 to-indigo-950/30 border border-blue-800/40 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-blue-300 uppercase tracking-wider mb-1">Evacuation Path Ready</h4>
                  <p className="text-xs text-slate-300">
                    Distance: <strong className="text-white">{result.route.total_distance_km} km</strong> • Approx. Time: <strong className="text-white">{result.route.estimated_time_min} mins</strong> (Uphill Path)
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition shadow"
                >
                  View on Map 🗺️
                </button>
              </div>
            )}

            {result.precautions && result.precautions.length > 0 && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <span>📋</span> Personalized NDMA Survival Precautions
                </h4>
                <ul className="space-y-2">
                  {result.precautions.map((item, idx) => (
                    <li key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between border-t border-slate-800 text-xs">
              <span className="text-slate-400">Let response teams know your status:</span>
              <button
                onClick={() => setCheckinDone(true)}
                disabled={checkinDone}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  checkinDone
                    ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50 cursor-default'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                }`}
              >
                {checkinDone ? '✓ Checked In Safe' : 'Mark Myself Safe'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
