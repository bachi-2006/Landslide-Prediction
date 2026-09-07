import os
import logging
from pathlib import Path
from typing import Tuple, Dict, Any, List
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
CSV_PATH = ROOT_DIR / 'data' / 'landslides' / 'bhusanket_inventory.csv'

_tree = None
_df = None

def init_landslide_history():
    global _tree, _df
    if _tree is not None:
        return
    try:
        if CSV_PATH.exists():
            _df = pd.read_csv(CSV_PATH)
            coords_rad = np.radians(_df[['latitude', 'longitude']].values)
            _tree = cKDTree(coords_rad)
            logger.info(f'Loaded {len(_df)} historical landslide records into spatial KD-Tree.')
        else:
            logger.warning(f'Bhusanket inventory not found at {CSV_PATH}.')
    except Exception as e:
        logger.error(f'Failed to initialize landslide history KD-Tree: {e}')

init_landslide_history()

def get_accident_stats_at_point(lat: float, lon: float) -> Dict[str, Any]:
    if _tree is None:
        return {
            'count_5km': 0,
            'count_25km': 0,
            'density_zone': 'Low Historical Record',
            'fragility_index': 0.1
        }
    
    pt = np.radians([lat, lon])
    EARTH_RADIUS_KM = 6371.0

    idx_5km = _tree.query_ball_point(pt, r=5.0 / EARTH_RADIUS_KM)
    idx_25km = _tree.query_ball_point(pt, r=25.0 / EARTH_RADIUS_KM)

    count_5km = len(idx_5km)
    count_25km = len(idx_25km)

    if count_5km >= 15 or count_25km >= 120:
        density_zone = 'Critical Historical Hazard Zone'
        fragility_index = 0.28
    elif count_5km >= 5 or count_25km >= 50:
        density_zone = 'High Historical Hazard Cluster'
        fragility_index = 0.20
    elif count_5km >= 1 or count_25km >= 10:
        density_zone = 'Documented Slope Slip Area'
        fragility_index = 0.12
    else:
        density_zone = 'Low Historical Slide Record'
        fragility_index = 0.04

    return {
        'count_5km': count_5km,
        'count_25km': count_25km,
        'density_zone': density_zone,
        'fragility_index': fragility_index
    }
