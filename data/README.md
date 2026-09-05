# Data and training

The supplied source files have now been converted into:

- `data/landslides/bhusanket_inventory.csv`: 9,852 Northeast historical points.
- `data/landslides/bhusanket_inventory.geojson`: the same points for GIS use.
- `frontend/public/data/historical_landslides.geojson`: frontend map copy.
- `frontend/public/data/ner_districts.json`: 115 Northeast district polygons from `district_nwic.kmz`.

The historical inventory is not yet a model-training matrix. It contains locations and source text, but not the weather/terrain features or negative examples required for supervised learning. Use it to build the labeled feature dataset after joining historical weather and terrain data.

## Training CSV

Place the resulting labeled CSV here, for example `data/landslide_events.csv`.

Required columns:

```text
rain_1h,rain_3h,rain_24h,soil_moisture,elevation,slope,hist_count,hist_fatalities,label
```

`label` must be `0` for no landslide and `1` for landslide. Train and evaluate it with:

```powershell
python backend/ml/train.py --data data/landslide_events.csv
```

The command writes `backend/ml/model.joblib` and `backend/ml/metrics.json`. Do not use the reported metrics as real-world validation until the dataset is geographically and temporally held out.
