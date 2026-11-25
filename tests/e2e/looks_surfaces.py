"""Run the surfaces cases from the Looks suite."""

from looks import (
    surface_schemes,
    surface_opacity_rendering,
    surface_opacity_controls,
    shadow_camera_fit,
    surfaces_cast_and_receive,
    split_surface_shadows,
    surfaces_and_sessions,
    shared_material_presets,
    run_cases,
)

CASES = (
    surface_schemes,
    surface_opacity_rendering,
    surface_opacity_controls,
    shadow_camera_fit,
    surfaces_cast_and_receive,
    split_surface_shadows,
    surfaces_and_sessions,
    shared_material_presets,
)


if __name__ == "__main__":
    run_cases(CASES)
