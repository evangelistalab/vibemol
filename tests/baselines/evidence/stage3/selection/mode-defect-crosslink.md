The Selection manual matrix confirmed another pre-existing Edit overlay
collision. A geometry probe measured Metal covering 38 × 42 px of the adjacent
Coordination trigger, whose center hits Metal's Automatic option. Separately,
the existing legacy Coordinates Delete center hits `#editSelectionPosition`,
with a 28 × 19.890625 px overlap.

These have different positioning paths: `positionSelectionMetalBondingCuePopover`
uses trigger-side placement and viewport clamping; `renderEditSelectionTranslateCue`
uses projected atom bounds and sidebar/viewport clamping. Their effective
z-indices in the reproductions are 60 and 34. Accordingly the popover finding
is filed separately as #17, rather than silently expanding the accepted
`mode_consistency.py` failure. Both remain separate 0.9.x production work.

The tagged/proposed desktop geometry records are exactly equal. No production
changes or accepted CI workflow changes are included. The user authorized an
issue-cited click-away step on both sources solely to continue the comparison;
one-click Coordination switching remains the intended behavior and is open.
