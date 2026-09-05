# Bhusanket inventory

`bhusanket_inventory.csv` and `bhusanket_inventory.geojson` were derived from the supplied Geological Survey of India PDF:

```text
C:\Users\ROHITH\Downloads\Bhusanket Data.pdf
```

The extraction keeps Northeast India records with source row number, slide number, state, latitude, longitude, and the original row text. The database import uses `source_row:slide_no` as `source_key` because the source contains repeated slide numbers.

This is historical inventory data, not a complete negative/positive ML training set. It does not by itself provide non-landslide samples or weather/terrain features. Join each record with historical Open-Meteo and OpenTopoData values, then construct time/geography-aware negative samples before training.