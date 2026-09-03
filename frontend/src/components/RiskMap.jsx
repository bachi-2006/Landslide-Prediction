import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { riskService, incidentService } from '../services/api';

// Fix for Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const riskColors = {
    'Low': '#4ade80',
    'Moderate': '#facc15',
    'High': '#f97316',
    'Critical': '#ef4444',
};

const RiskMap = ({ selectedDistrict, setSelectedDistrict }) => {
    const [geoJsonData, setGeoJsonData] = useState(null);
    const [risks, setRisks] = useState([]);
    const [incidents, setIncidents] = useState([]);

    useEffect(() => {
        // Load districts GeoJSON (assume it's in /public/data/ner_districts.json)
        fetch('/data/ner_districts.json')
            .then(res => res.json())
            .then(data => setGeoJsonData(data));

        // Load risk scores
        riskService.getAllRisks()
            .then(res => setRisks(res.data.data))
            .catch(err => console.error(err));

        // Load incidents
        incidentService.getIncidents()
            .then(res => setIncidents(res.data.data))
            .catch(err => console.error(err));
    }, []);

    const onEachDistrictFeature = (feature, layer) => {
        const districtId = feature.properties.id;
        const risk = risks.find(r => r.district_id === districtId);
        const level = risk ? risk.risk_level : 'Low';

        layer.setStyle({
            fillColor: riskColors[level] || '#cbd5e1',
            weight: 2,
            opacity: 1,
            color: 'white',
            fillOpacity: 0.7,
        });

        layer.on({
            mouseover: (e) => {
                const l = e.target;
                l.setStyle({ fillOpacity: 0.9 });
            },
            mouseout: (e) => {
                const l = e.target;
                l.setStyle({ fillOpacity: 0.7 });
            },
            click: (e) => {
                setSelectedDistrict(feature.properties);
            },
        });
    };

    return (
        <MapContainer
            center={[26.0, 92.0]}
            zoom={7}
            style={{ height: '100%', width: '100%' }}
        >
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors'
            />
            {geoJsonData && (
                <GeoJSON
                    data={geoJsonData}
                    onEachFeature={onEachDistrictFeature}
                />
            )}
            {incidents.map(inc => (
                <Marker key={inc.id} position={[inc.latitude, inc.longitude]}>
                    <Popup>
                        <div className="p-2">
                            <h3 className="font-bold">Incident Report</h3>
                            <p className="text-sm">{inc.description}</p>
                            {inc.photo_url && (
                                <img src={inc.photo_url} alt="Incident" className="mt-2 w-full rounded" />
                            )}
                        </div>
                    </Popup>
                </Marker>
            ))}
        </MapContainer>
    );
};

export default RiskMap;
