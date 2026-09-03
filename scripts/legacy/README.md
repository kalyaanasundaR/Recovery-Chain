# scripts/legacy

One-off scripts from the phase-by-phase build history (dataset construction,
validation, bias checks, ad-hoc inspection, and the `patch_*` migration helpers).

They are **not** part of the application and are not run by CI or `run.py`. Kept
for provenance only. The reproducible ML training entry point is
`backend/run_phase19_training.py`; dataset build history lives in
`docs/history/`.
