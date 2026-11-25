"""Run the materials cases from the Looks suite."""

from looks import (
    independent_colors,
    material_families,
    material_color_fill,
    basic_surface_finish,
    run_cases,
)

CASES = (
    independent_colors,
    material_families,
    material_color_fill,
    basic_surface_finish,
)


if __name__ == "__main__":
    run_cases(CASES)
