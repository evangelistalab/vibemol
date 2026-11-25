"""Run the presets cases from the Looks suite."""

from looks import (
    reference_ui,
    reference_persistence,
    reference_migration,
    complete_look_tiles,
    bond_sphere_fit,
    hydrogen_bond_restrictions,
    bond_colors_and_preset_controls,
    components_and_saving,
    run_cases,
)

CASES = (
    reference_ui,
    reference_persistence,
    reference_migration,
    complete_look_tiles,
    bond_sphere_fit,
    hydrogen_bond_restrictions,
    bond_colors_and_preset_controls,
    components_and_saving,
)


if __name__ == "__main__":
    run_cases(CASES)
